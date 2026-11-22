import type {
  DashboardResponse,
  ForecastHour,
  RawRecord,
  ResumenLecturaJson,
  ThresholdsInfo,
  TrendArrow,
  WeatherCurrent,
} from "../types";
import { MESES } from "./format";

const ESTACION_CODIGO = "29037020";
const ESTACION_NOMBRE = "Calamar, Bolívar";
const ESTACION_LATITUD = 10.243275;
const ESTACION_LONGITUD = -74.915017;
const ESTACION_ALTITUD_MSNM = 8;
const NIVEL_REFERENCIA_CM = 985;
const NIVEL_MURALLA_CM = 1000;
const DIAS_MAX_SIN_DATOS = 3;

const FEWS_VISOR_URL = "https://fews.ideam.gov.co/visorfews/nacional";
const METEO_URL = "https://api.open-meteo.com/v1/forecast";
const METEO_LATITUD = 10.25271;
const METEO_LONGITUD = -74.91574;
const METEO_ZONA_HORARIA = "America/Bogota";
const HORIZONTE_METEO_HORAS = 24;

function resolveRepoOwner(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".github.io")) {
      return host.split(".")[0] || "Bortiz1996";
    }
  }
  return "Bortiz1996";
}

const REPO_OWNER = resolveRepoOwner();
const APP_URL = `https://${REPO_OWNER.toLowerCase()}.github.io/PROYECTO_JUAN/`;
const RAW_CSV_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/PROYECTO_JUAN/main/nivel_calamar.csv`;
const RAW_FEWS_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/PROYECTO_JUAN/main/assets/fews_calamar.json`;
const BUNDLED_CSV_PATH = "assets/nivel_calamar.csv";
const BUNDLED_FEWS_PATH = "assets/fews_calamar.json";
const BUNDLED_CONFIG_PATH = "assets/config_alertas.json";
const SUBZONAS_CSV_PATH = "assets/subzonas_magdalena_cauca.csv";

interface ConfigAlertasJson {
  notificaciones?: {
    tolerancia_sin_cambio_cm?: number;
  };
  cotas?: {
    amarilla?: { valor_cm?: number | null; fuente?: string | null };
    naranja?: { valor_cm?: number | null; fuente?: string | null };
    roja?: { valor_cm?: number | null; fuente?: string | null };
  };
  muralla_referencia?: { valor_cm?: number | null };
}

interface ParsedTimestamp {
  iso: string;
  ms: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  hasTime: boolean;
}

interface InternalRow {
  fecha: ParsedTimestamp;
  nivelCm: number;
  ultimaLectura: ParsedTimestamp | null;
  fuente: 0 | 1;
}

interface Subzona {
  codigo: string;
  areaKm2: number;
  latitud: number;
  longitud: number;
}

let subzonasCache: Subzona[] | null = null;
let weatherCache: {
  expiresAt: number;
  weather: WeatherCurrent | null;
  error: string | null;
} | null = null;
let forecastCache: {
  key: string;
  expiresAt: number;
  hours: ForecastHour[] | null;
  error: string | null;
} | null = null;

function parseNaiveTimestamp(
  raw: string | null | undefined
): ParsedTimestamp | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let match = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  let year: number;
  let month: number;
  let day: number;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let hasTime = false;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    if (match[4] !== undefined && match[5] !== undefined) {
      hour = Number(match[4]);
      minute = Number(match[5]);
      second = match[6] ? Number(match[6]) : 0;
      hasTime = true;
    }
  } else {
    match = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
    if (match[4] !== undefined && match[5] !== undefined) {
      hour = Number(match[4]);
      minute = Number(match[5]);
      second = match[6] ? Number(match[6]) : 0;
      hasTime = true;
    }
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const pad = (v: number) => String(v).padStart(2, "0");
  const datePart = `${year}-${pad(month)}-${pad(day)}`;
  const iso = hasTime
    ? `${datePart}T${pad(hour)}:${pad(minute)}:${pad(second)}`
    : datePart;

  return { iso, ms, year, month, day, hour, minute, hasTime };
}

function formatFechaEs(ts: ParsedTimestamp, conHora = false): string {
  const base = `${ts.day} ${MESES[ts.month - 1]} ${ts.year}`;
  if (!conHora) return base;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${base}, ${pad(ts.hour)}:${pad(ts.minute)}`;
}

function getBogotaNow(): { dayMidnightMs: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: METEO_ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return { dayMidnightMs: Date.UTC(year, month - 1, day, 0, 0, 0) };
}

function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function cleanNivel(rawVal: string | number): number | null {
  let val =
    typeof rawVal === "number"
      ? rawVal
      : Number(String(rawVal).trim().replace(",", "."));
  if (!Number.isFinite(val)) return null;
  if (Math.abs(val) > 2000 && Math.abs(val) <= 200_000) {
    val /= 100;
  }
  if (val < 0 || val > 2000) return null;
  return val;
}

function parseHistoricalCsv(text: string): InternalRow[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idxFecha = header.indexOf("Fecha");
  const idxNivel = header.indexOf("Nivel_cm");
  const idxUlt = header.indexOf("Ultima_lectura");
  if (idxFecha === -1 || idxNivel === -1) {
    throw new Error("El archivo nivel_calamar.csv no tiene las columnas esperadas.");
  }

  const rows: InternalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const fecha = parseNaiveTimestamp(cols[idxFecha]);
    const nivelCm = cleanNivel(cols[idxNivel]);
    if (!fecha || nivelCm === null) continue;
    const ultimaLectura =
      idxUlt !== -1 ? parseNaiveTimestamp(cols[idxUlt]) : null;
    rows.push({
      fecha,
      nivelCm,
      ultimaLectura,
      fuente: 0,
    });
  }

  rows.sort((a, b) => a.fecha.ms - b.fecha.ms);
  return rows;
}

function parseSubzonasCsv(text: string): Subzona[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Faltan subzonas para representar la cuenca Magdalena-Cauca.");
  }
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const iCod = header.indexOf("CodigoSubzona");
  const iArea = header.indexOf("Area_km2");
  const iLat = header.indexOf("Latitud");
  const iLon = header.indexOf("Longitud");
  if (iCod === -1 || iArea === -1 || iLat === -1 || iLon === -1) {
    throw new Error("Columnas inválidas en subzonas_magdalena_cauca.csv.");
  }

  const seen = new Set<string>();
  const subzonas: Subzona[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const codigo = cols[iCod]?.trim();
    const areaKm2 = Number(cols[iArea]);
    const latitud = Number(cols[iLat]);
    const longitud = Number(cols[iLon]);
    if (
      !codigo ||
      seen.has(codigo) ||
      !Number.isFinite(areaKm2) ||
      areaKm2 <= 0 ||
      !Number.isFinite(latitud) ||
      latitud < -90 ||
      latitud > 90 ||
      !Number.isFinite(longitud) ||
      longitud < -180 ||
      longitud > 180
    ) {
      continue;
    }
    seen.add(codigo);
    subzonas.push({ codigo, areaKm2, latitud, longitud });
  }
  return subzonas;
}


async function loadHistoricalRows(refresh: boolean): Promise<InternalRow[]> {
  const fetchText = async (url: string, timeoutMs: number): Promise<string> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al leer ${url}`);
      }
      return await response.text();
    } finally {
      window.clearTimeout(timer);
    }
  };

  try {
    const remoteUrl = refresh ? `${RAW_CSV_URL}?t=${Date.now()}` : RAW_CSV_URL;
    const remoteText = await fetchText(remoteUrl, 6000);
    const parsed = parseHistoricalCsv(remoteText);
    if (parsed.length >= 2) return parsed;
  } catch {
    // Fallback to local bundled asset when offline or raw GitHub is unreachable.
  }

  const localText = await fetchText(BUNDLED_CSV_PATH, 10_000);
  return parseHistoricalCsv(localText);
}

interface FewsJsonPayload {
  updatedAt?: string;
  station?: string;
  resumenLectura?: ResumenLecturaJson | null;
  records?: RawRecord[];
}

function parseFewsJson(payload: FewsJsonPayload): InternalRow[] {
  if (!payload || !Array.isArray(payload.records)) return [];
  const rows: InternalRow[] = [];
  for (const r of payload.records) {
    const fecha = parseNaiveTimestamp(r?.f);
    const nivelCm = cleanNivel(r?.n);
    if (!fecha || nivelCm === null) continue;
    const ultimaLectura = parseNaiveTimestamp(r?.u) ?? fecha;
    rows.push({
      fecha,
      nivelCm: Math.round(nivelCm * 100) / 100,
      ultimaLectura,
      fuente: 1,
    });
  }
  rows.sort((a, b) => a.fecha.ms - b.fecha.ms);
  return rows;
}

function mergeFewsSources(sources: InternalRow[][]): InternalRow[] {
  const map = new Map<string, InternalRow>();
  for (const list of sources) {
    for (const row of list) {
      map.set(row.fecha.iso, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.fecha.ms - b.fecha.ms);
}

async function loadAlertConfig(): Promise<ConfigAlertasJson | null> {
  try {
    const response = await fetch(BUNDLED_CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as ConfigAlertasJson;
  } catch {
    return null;
  }
}

async function loadFewsRows(refresh: boolean): Promise<{
  rows: InternalRow[] | null;
  resumenLectura: ResumenLecturaJson | null;
  error: string | null;
}> {
  const fetchJson = async (
    url: string,
    timeoutMs: number
  ): Promise<FewsJsonPayload> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al leer ${url}`);
      }
      return (await response.json()) as FewsJsonPayload;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const remoteUrl = refresh
    ? `${RAW_FEWS_URL}?t=${Date.now()}`
    : RAW_FEWS_URL;
  const localUrl = refresh
    ? `${BUNDLED_FEWS_PATH}?t=${Date.now()}`
    : BUNDLED_FEWS_PATH;

  const [localRes, remoteRes] = await Promise.allSettled([
    fetchJson(localUrl, 6000),
    fetchJson(remoteUrl, 6000),
  ]);

  const orderedSources: InternalRow[][] = [];
  let resumenLectura: ResumenLecturaJson | null = null;
  if (localRes.status === "fulfilled") {
    const parsed = parseFewsJson(localRes.value);
    if (parsed.length > 0) orderedSources.push(parsed);
    if (localRes.value.resumenLectura) resumenLectura = localRes.value.resumenLectura;
  }
  if (remoteRes.status === "fulfilled") {
    const parsed = parseFewsJson(remoteRes.value);
    if (parsed.length > 0) orderedSources.push(parsed);
    if (remoteRes.value.resumenLectura) resumenLectura = remoteRes.value.resumenLectura;
  }

  const merged = mergeFewsSources(orderedSources);
  if (merged.length > 0) {
    return { rows: merged, resumenLectura, error: null };
  }

  return {
    rows: null,
    resumenLectura,
    error:
      "No se pudieron obtener las lecturas recientes de FEWS IDEAM; se muestra el último histórico guardado.",
  };
}

function combineData(
  histRows: InternalRow[],
  fewsRows: InternalRow[] | null
): InternalRow[] {
  if (!fewsRows || fewsRows.length === 0) {
    return histRows;
  }
  const map = new Map<string, InternalRow>();
  for (const r of histRows) {
    map.set(r.fecha.iso, r);
  }
  for (const r of fewsRows) {
    map.set(r.fecha.iso, r);
  }
  return Array.from(map.values()).sort((a, b) => a.fecha.ms - b.fecha.ms);
}

async function loadSubzonas(): Promise<Subzona[]> {
  if (subzonasCache) return subzonasCache;
  const response = await fetch(SUBZONAS_CSV_PATH);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} leyendo ${SUBZONAS_CSV_PATH}`);
  }
  const text = await response.text();
  subzonasCache = parseSubzonasCsv(text);
  return subzonasCache;
}

async function loadWeather(forceRefresh = false): Promise<{
  weather: WeatherCurrent | null;
  error: string | null;
}> {
  const now = Date.now();
  if (!forceRefresh && weatherCache && weatherCache.expiresAt > now) {
    return { weather: weatherCache.weather, error: weatherCache.error };
  }

  try {
    const url = new URL(METEO_URL);
    url.searchParams.set("latitude", String(METEO_LATITUD));
    url.searchParams.set("longitude", String(METEO_LONGITUD));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
    );
    url.searchParams.set("timezone", METEO_ZONA_HORARIA);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} desde Open-Meteo`);
    }
    const json = (await response.json()) as {
      current?: Partial<WeatherCurrent>;
    };
    const actual = json?.current;
    if (
      !actual ||
      actual.time == null ||
      actual.temperature_2m == null ||
      actual.relative_humidity_2m == null ||
      actual.precipitation == null ||
      actual.weather_code == null ||
      actual.wind_speed_10m == null
    ) {
      throw new Error(
        "La respuesta meteorológica no contiene condiciones actuales para Calamar."
      );
    }

    const weather: WeatherCurrent = {
      time: String(actual.time),
      temperature_2m: Number(actual.temperature_2m),
      relative_humidity_2m: Number(actual.relative_humidity_2m),
      precipitation: Number(actual.precipitation),
      weather_code: Number(actual.weather_code),
      wind_speed_10m: Number(actual.wind_speed_10m),
    };
    weatherCache = {
      expiresAt: now + 15 * 60 * 1000,
      weather,
      error: null,
    };
    return { weather, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error consultando meteorología";
    weatherCache = {
      expiresAt: now + 60 * 1000,
      weather: null,
      error: message,
    };
    return { weather: null, error: message };
  }
}

async function loadBasinForecast(
  horaInicio: string,
  subzonas: Subzona[],
  forceRefresh = false
): Promise<{
  hours: ForecastHour[] | null;
  error: string | null;
}> {
  const now = Date.now();
  if (
    !forceRefresh &&
    forecastCache &&
    forecastCache.key === horaInicio &&
    forecastCache.expiresAt > now
  ) {
    return { hours: forecastCache.hours, error: forecastCache.error };
  }

  try {
    const inicioParsed = parseNaiveTimestamp(horaInicio);
    if (!inicioParsed) {
      throw new Error(
        "La respuesta meteorológica contiene una hora de inicio inválida."
      );
    }
    const inicioMs = inicioParsed.ms;
    const finMs = inicioMs + HORIZONTE_METEO_HORAS * 3600 * 1000;

    const batchSize = 100;
    const hourlyAgg = new Map<
      number,
      { iso: string; lluviaPonderada: number; areaSum: number; count: number }
    >();

    for (let start = 0; start < subzonas.length; start += batchSize) {
      const lote = subzonas.slice(start, start + batchSize);
      const url = new URL(METEO_URL);
      url.searchParams.set(
        "latitude",
        lote.map((s) => s.latitud.toFixed(5)).join(",")
      );
      url.searchParams.set(
        "longitude",
        lote.map((s) => s.longitud.toFixed(5)).join(",")
      );
      url.searchParams.set("hourly", "precipitation");
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("timezone", METEO_ZONA_HORARIA);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} desde Open-Meteo cuenca`);
      }
      const rawJson = await response.json();
      const datos = Array.isArray(rawJson) ? rawJson : [rawJson];
      if (datos.length !== lote.length) {
        throw new Error(
          "Open-Meteo no devolvió pronósticos para todas las subzonas de la cuenca."
        );
      }

      for (let idx = 0; idx < lote.length; idx++) {
        const subzona = lote[idx];
        const porHora = datos[idx]?.hourly;
        const tiempos: unknown = porHora?.time;
        const precipitacion: unknown = porHora?.precipitation;
        if (
          !Array.isArray(tiempos) ||
          !Array.isArray(precipitacion) ||
          tiempos.length !== precipitacion.length
        ) {
          throw new Error(
            `Las series horarias de la subzona ${subzona.codigo} son inválidas.`
          );
        }

        let validHours = 0;
        for (let h = 0; h < tiempos.length; h++) {
          const ts = parseNaiveTimestamp(String(tiempos[h]));
          const p = Number(precipitacion[h]);
          if (!ts || !Number.isFinite(p) || p < 0) continue;
          if (ts.ms >= inicioMs && ts.ms < finMs) {
            validHours++;
            const existing = hourlyAgg.get(ts.ms);
            if (existing) {
              existing.lluviaPonderada += p * subzona.areaKm2;
              existing.areaSum += subzona.areaKm2;
              existing.count += 1;
            } else {
              hourlyAgg.set(ts.ms, {
                iso: ts.iso,
                lluviaPonderada: p * subzona.areaKm2,
                areaSum: subzona.areaKm2,
                count: 1,
              });
            }
          }
        }

        if (validHours !== HORIZONTE_METEO_HORAS) {
          throw new Error(
            `La subzona ${subzona.codigo} no tiene 24 horas válidas de precipitación.`
          );
        }
      }
    }

    const sortedTimes = Array.from(hourlyAgg.keys()).sort((a, b) => a - b);
    if (sortedTimes.length === 0) {
      throw new Error(
        "El pronóstico horario no cubre las subzonas de la cuenca."
      );
    }

    const hours: ForecastHour[] = sortedTimes.map((ms) => {
      const item = hourlyAgg.get(ms)!;
      if (item.count !== subzonas.length) {
        throw new Error(
          "El pronóstico horario no cubre todas las subzonas de la cuenca."
        );
      }
      return {
        fechaHora: item.iso,
        precipitacionMm: item.lluviaPonderada / item.areaSum,
      };
    });

    forecastCache = {
      key: horaInicio,
      expiresAt: now + 15 * 60 * 1000,
      hours,
      error: null,
    };
    return { hours, error: null };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error consultando pronóstico de cuenca";
    forecastCache = {
      key: horaInicio,
      expiresAt: now + 60 * 1000,
      hours: null,
      error: message,
    };
    return { hours: null, error: message };
  }
}

function calculateThresholds(cfg: ConfigAlertasJson | null): ThresholdsInfo {
  const amar = cfg?.cotas?.amarilla?.valor_cm ?? null;
  const nara = cfg?.cotas?.naranja?.valor_cm ?? null;
  const roja = cfg?.cotas?.roja?.valor_cm ?? NIVEL_REFERENCIA_CM;
  const valores = {
    amarilla: amar !== null ? Number(amar) : null,
    naranja: nara !== null ? Number(nara) : null,
    roja: roja !== null ? Number(roja) : null,
  };
  const origen = {
    amarilla:
      valores.amarilla !== null
        ? cfg?.cotas?.amarilla?.fuente || "oficial"
        : "sin definir",
    naranja:
      valores.naranja !== null
        ? cfg?.cotas?.naranja?.fuente || "oficial"
        : "sin definir",
    roja:
      valores.roja !== null
        ? cfg?.cotas?.roja?.fuente || `cota crítica (${(valores.roja / 100).toFixed(2).replace(".", ",")} m)`
        : "sin definir",
  };
  return { valores, origen };
}

function computeArrow(deltaCm: number, tolerancia: number): TrendArrow {
  if (deltaCm > tolerancia) return "▲";
  if (deltaCm < -tolerancia) return "▼";
  return "▬";
}

function evaluateAlertState(
  nivel: number,
  u: ThresholdsInfo
): DashboardResponse["alertState"] {
  const v = u.valores;
  if (v.roja !== null && nivel >= v.roja) return "roja";
  if (v.naranja !== null && nivel >= v.naranja) return "naranja";
  if (v.amarilla !== null && nivel >= v.amarilla) return "amarilla";
  return v.roja !== null ||
    (v.amarilla !== null && v.naranja !== null)
    ? "verde"
    : "sin_umbral";
}

function estimateTrend(rows: InternalRow[]): {
  direccion: string;
  motivo: string;
} {
  if (rows.length === 0) {
    return {
      direccion: "Sin estimación",
      motivo: "No hay lecturas válidas del nivel del río.",
    };
  }
  const last = rows[rows.length - 1];
  const bogotaNow = getBogotaNow();
  const lastDayMs = Date.UTC(
    last.fecha.year,
    last.fecha.month - 1,
    last.fecha.day,
    0,
    0,
    0
  );
  const diasDesactualizado = Math.max(
    Math.floor((bogotaNow.dayMidnightMs - lastDayMs) / 86_400_000),
    0
  );

  if (diasDesactualizado > 2) {
    return {
      direccion: "Sin estimación",
      motivo: `La última lectura tiene ${diasDesactualizado} días; no es suficientemente reciente para describir la dirección actual.`,
    };
  }

  const cutoffMs = last.fecha.ms - 3 * 86_400_000;
  const recientes = rows.filter((r) => r.fecha.ms >= cutoffMs);
  const periodoDias = (last.fecha.ms - recientes[0].fecha.ms) / 86_400_000;

  if (recientes.length < 3 || periodoDias < 2) {
    return {
      direccion: "Señal insuficiente",
      motivo:
        "Se requieren al menos 3 lecturas distribuidas en 2 días para describir una dirección reciente.",
    };
  }

  const pendientes: number[] = [];
  for (let i = 0; i < recientes.length; i++) {
    for (let j = i + 1; j < recientes.length; j++) {
      const diasEntre =
        (recientes[j].fecha.ms - recientes[i].fecha.ms) / 86_400_000;
      if (diasEntre > 0) {
        pendientes.push(
          (recientes[j].nivelCm - recientes[i].nivelCm) / diasEntre
        );
      }
    }
  }

  if (pendientes.length === 0) {
    return {
      direccion: "Señal insuficiente",
      motivo: "No hay lecturas con horarios distintos para comparar.",
    };
  }

  pendientes.sort((a, b) => a - b);
  const mid = Math.floor(pendientes.length / 2);
  const cambioDiario =
    pendientes.length % 2 === 0
      ? (pendientes[mid - 1] + pendientes[mid]) / 2
      : pendientes[mid];

  let direccion = "Sin cambio claro";
  if (cambioDiario > 0.5) direccion = "Alza observada";
  else if (cambioDiario < -0.5) direccion = "Baja observada";

  const signo = cambioDiario >= 0 ? "+" : "";
  return {
    direccion,
    motivo: `Pendiente mediana de ${signo}${cambioDiario.toFixed(1)} cm/día en ${recientes.length} lecturas de los últimos 3 días (umbral de dirección: ±0,5 cm/día). Es una descripción de datos observados, no una predicción.`,
  };
}

export async function buildStaticDashboard(
  forceRefresh = false
): Promise<DashboardResponse> {
  const [histRows, fewsRes, subzonas, weatherRes, alertConfig] = await Promise.all([
    loadHistoricalRows(forceRefresh),
    loadFewsRows(forceRefresh),
    loadSubzonas(),
    loadWeather(forceRefresh),
    loadAlertConfig(),
  ]);

  const combined = combineData(histRows, fewsRes.rows);
  if (combined.length < 2) {
    throw new Error("Hay muy pocos datos para mostrar el tablero.");
  }

  const totalAreaKm2 = subzonas.reduce((sum, s) => sum + s.areaKm2, 0);
  const ultimo = combined[combined.length - 1];
  const previo = combined[combined.length - 2];
  const nivelCm = ultimo.nivelCm;
  const tolerancia = alertConfig?.notificaciones?.tolerancia_sin_cambio_cm ?? 0.05;
  const resumenMatch =
    fewsRes.resumenLectura &&
    fewsRes.resumenLectura.fechaHora === ultimo.fecha.iso
      ? fewsRes.resumenLectura
      : null;

  const deltaCm = resumenMatch
    ? resumenMatch.deltaCm
    : Math.round((nivelCm - previo.nivelCm) * 10) / 10;
  const flecha: TrendArrow = resumenMatch
    ? resumenMatch.flecha
    : computeArrow(deltaCm, tolerancia);

  const ultimoDayMs = Date.UTC(
    ultimo.fecha.year,
    ultimo.fecha.month - 1,
    ultimo.fecha.day
  );
  const diasDiff = Math.floor((ultimo.fecha.ms - previo.fecha.ms) / 86_400_000);
  const refTxt =
    diasDiff === 1
      ? "el día anterior"
      : `el ${formatFechaEs(previo.fecha, false)}`;
  const cambioTexto = resumenMatch
    ? resumenMatch.cambioTexto
    : flecha === "▬"
      ? "Sin cambio"
      : `${flecha === "▲" ? "Subió" : "Bajó"} ${Math.abs(deltaCm).toFixed(1)} cm ${refTxt}`;

  const bogotaNow = getBogotaNow();
  const edadDias = Math.floor(
    (bogotaNow.dayMidnightMs - ultimoDayMs) / 86_400_000
  );

  let estadoPeces: "calm" | "scared" = "calm";
  let estadoPecesTexto = "tranquilos";
  if (nivelCm > 900) {
    estadoPeces = "scared";
    estadoPecesTexto = "asustados";
  }

  const tsUlt = ultimo.ultimaLectura ?? ultimo.fecha;
  const thresholds = calculateThresholds(alertConfig);
  const nivelReferenciaCm = thresholds.valores.roja ?? NIVEL_REFERENCIA_CM;
  const nivelMurallaCm =
    alertConfig?.muralla_referencia?.valor_cm ?? NIVEL_MURALLA_CM;
  const alertState = evaluateAlertState(nivelCm, thresholds);
  const trend = estimateTrend(combined);

  let forecast: ForecastHour[] | null = null;
  let forecastError: string | null = null;
  if (weatherRes.weather && !weatherRes.error) {
    const resForecast = await loadBasinForecast(
      weatherRes.weather.time,
      subzonas,
      forceRefresh
    );
    forecast = resForecast.hours;
    forecastError = resForecast.error;
  } else {
    forecastError =
      weatherRes.error || "No hay datos meteorológicos actuales disponibles.";
  }

  const records: RawRecord[] = combined.map((r) => ({
    f: r.fecha.iso,
    n: r.nivelCm,
    u: r.ultimaLectura ? r.ultimaLectura.iso : null,
    s: r.fuente,
  }));

  const fewsRows = fewsRes.rows;

  return {
    records,
    fewsCount: fewsRows ? fewsRows.length : 0,
    fewsRange:
      fewsRows && fewsRows.length > 0
        ? {
            start: formatFechaEs(fewsRows[0].fecha, false),
            end: formatFechaEs(fewsRows[fewsRows.length - 1].fecha, false),
          }
        : null,
    fewsError: fewsRes.error,
    meta: {
      nivelCm,
      fechaUlt: ultimo.fecha.iso,
      tsUlt: tsUlt.iso,
      tsUltHasTime: tsUlt.hasTime || ultimo.ultimaLectura !== null,
      deltaCm,
      flecha,
      cambioTexto,
      edadDias,
      fuente: ultimo.fuente === 1 ? "FEWS" : "Histórico IDEAM",
      estadoPeces,
      estadoPecesTexto,
    },
    thresholds,
    alertState,
    trend,
    weather: weatherRes.weather,
    weatherError: weatherRes.error,
    forecast,
    forecastError,
    subzonesCount: subzonas.length,
    totalAreaKm2,
    config: {
      estacionCodigo: ESTACION_CODIGO,
      estacionNombre: ESTACION_NOMBRE,
      estacionLatitud: ESTACION_LATITUD,
      estacionLongitud: ESTACION_LONGITUD,
      estacionAltitudMsnm: ESTACION_ALTITUD_MSNM,
      nivelReferenciaCm,
      nivelMurallaCm,
      diasMaxSinDatos: DIAS_MAX_SIN_DATOS,
      fewsVisorUrl: FEWS_VISOR_URL,
      appUrl: APP_URL,
    },
  };
}
