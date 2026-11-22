import type { DashboardResponse, RiverReading } from "../../../../types";
import {
  describirTiempo,
  fechaEs,
  formatIntegerDot,
  formatNumberComma,
  isNightInBogota,
  isoToUtcMs,
  tipoAmbiente,
} from "../../../../utils/format";
import type {
  HydroTrendStatus,
  LimnimetricReading,
  ObservatoryBlock,
  StationInfo,
  ThresholdEntry,
} from "../models/limnimetro-block.model";

export const CALAMAR_STATION_SEED: StationInfo = {
  codigoIdeam: "29037020",
  nombre: "Calamar",
  municipio: "Calamar",
  departamento: "Bolívar",
  cuenca: "Bajo Magdalena · Canal del Dique",
  latitud: 10.251222,
  longitud: -74.914528,
  altitudMsnm: 10,
  fuenteOficial: "IDEAM · FEWS Colombia",
};

function resolveTrendStatus(
  alertState: DashboardResponse["alertState"],
  deltaCm: number
): { estado: HydroTrendStatus; label: string } {
  if (
    alertState === "roja" ||
    alertState === "naranja" ||
    alertState === "amarilla"
  ) {
    return {
      estado: "alerta",
      label:
        alertState === "roja"
          ? "Cota crítica"
          : alertState === "naranja"
            ? "Alerta naranja"
            : "Alerta amarilla",
    };
  }
  if (deltaCm > 0.2) {
    return { estado: "sube", label: "Sube" };
  }
  if (deltaCm < -0.2) {
    return { estado: "baja", label: "Baja" };
  }
  return { estado: "estable", label: "Estable" };
}

function buildNotaEstado(
  alertState: DashboardResponse["alertState"],
  refMetros: number,
  refCm: number
): string {
  const mTxt = refMetros.toFixed(2);
  switch (alertState) {
    case "verde":
      return `Por debajo de la cota crítica configurada (${mTxt} m · ${refCm} cm). Manténgase atento a los avisos de las autoridades.`;
    case "amarilla":
      return "Umbral amarillo oficial alcanzado. Consulte los avisos del Consejo Municipal de Gestión del Riesgo.";
    case "naranja":
      return "Umbral naranja oficial alcanzado. Siga las instrucciones de las autoridades locales.";
    case "roja":
      return `Cota crítica alcanzada (≥ ${mTxt} m · ${refCm} cm). Atienda de inmediato las instrucciones de evacuación y autoridades.`;
    default:
      return "Sin cotas oficiales configuradas. El medidor muestra la lectura observada; no representa por sí solo un nivel de riesgo.";
  }
}

export function createSeedObservatoryBlocks(): ObservatoryBlock[] {
  const seedSeries: RiverReading[] = [
    { fecha: "2026-11-14T06:00:00", fechaMs: isoToUtcMs("2026-11-14T06:00:00"), nivelCm: 512, ultimaLectura: "2026-11-14T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-14T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-15T06:00:00", fechaMs: isoToUtcMs("2026-11-15T06:00:00"), nivelCm: 508, ultimaLectura: "2026-11-15T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-15T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-16T06:00:00", fechaMs: isoToUtcMs("2026-11-16T06:00:00"), nivelCm: 503, ultimaLectura: "2026-11-16T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-16T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-17T06:00:00", fechaMs: isoToUtcMs("2026-11-17T06:00:00"), nivelCm: 499, ultimaLectura: "2026-11-17T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-17T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-18T06:00:00", fechaMs: isoToUtcMs("2026-11-18T06:00:00"), nivelCm: 495, ultimaLectura: "2026-11-18T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-18T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-19T06:00:00", fechaMs: isoToUtcMs("2026-11-19T06:00:00"), nivelCm: 492, ultimaLectura: "2026-11-19T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-19T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-20T06:00:00", fechaMs: isoToUtcMs("2026-11-20T06:00:00"), nivelCm: 492, ultimaLectura: "2026-11-20T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-20T06:00:00"), fuente: "FEWS" },
    { fecha: "2026-11-21T06:00:00", fechaMs: isoToUtcMs("2026-11-21T06:00:00"), nivelCm: 486, ultimaLectura: "2026-11-21T06:00:00", ultimaLecturaMs: isoToUtcMs("2026-11-21T06:00:00"), fuente: "FEWS" },
  ];

  const seedReading: LimnimetricReading = {
    nivelMetros: 4.86,
    nivelCm: 486,
    variacionCm: -6,
    flecha: "▼",
    variacionTexto: "-6,0 cm vs. lectura anterior",
    cotaReferenciaMetros: 9.85,
    cotaReferenciaCm: 985,
    cotaMurallaMetros: 10.0,
    cotaMurallaCm: 1000,
    margenACriticaMetros: 4.99,
    estadoAlerta: "verde",
    notaEstado: buildNotaEstado("verde", 9.85, 985),
  };

  const seedThresholds: ThresholdEntry[] = [
    { clave: "amarilla", nombre: "Amarilla", valorCm: null, origen: "sin definir" },
    { clave: "naranja", nombre: "Naranja", valorCm: null, origen: "sin definir" },
    { clave: "roja", nombre: "Cota crítica (Roja)", valorCm: 985, origen: "cota crítica (9,85 m)" },
  ];

  return [
    {
      id: "bloque-nivel-actual",
      tipo: "nivel_actual",
      fuente: "IDEAM — Estación Calamar · 29037020",
      titulo: "Lectura limnimétrica más reciente",
      subtitulo: "Nivel observado y cota de referencia",
      estado: "baja",
      estadoLabel: "Baja",
      timestampIso: "2026-11-21T06:00:00",
      fechaActualizacionTexto: "21 nov 2026, 06:00",
      ultimaSincronizacionTexto: "Sincronización inicial · FEWS IDEAM",
      station: CALAMAR_STATION_SEED,
      lectura: seedReading,
      resumenCampo: "4,99 m por debajo de la cota crítica (9,85 m)",
      accionSecundariaLabel: "Ver ficha técnica",
      fichaTecnica: [
        { etiqueta: "Cota crítica", valor: "9,85 m (985 cm)" },
        { etiqueta: "Coronación muralla", valor: "10,00 m (1.000 cm)" },
        { etiqueta: "Altitud estación", valor: "10 m s. n. m." },
        { etiqueta: "Fuente lectura", valor: "FEWS IDEAM" },
      ],
      latestReadings: [...seedSeries].reverse(),
      gaugeContext: {
        estadoPeces: "calm",
        ambiente: "despejado",
        climaTexto: "cielo despejado",
        noche: false,
        vientoKmh: 12,
        thresholds: {
          valores: { amarilla: null, naranja: null, roja: 985 },
          origen: {
            amarilla: "sin definir",
            naranja: "sin definir",
            roja: "cota crítica (9,85 m)",
          },
        },
        weather: null,
      },
      documentos: [
        {
          label: "Abrir visor FEWS nacional",
          url: "https://fews.ideam.gov.co/",
        },
      ],
      esDatoEnVivo: false,
    },
    {
      id: "bloque-serie-historica",
      tipo: "serie_historica",
      fuente: "IDEAM — DHIME & FEWS Calamar",
      titulo: "Comportamiento limnimétrico histórico",
      subtitulo: "Serie consolidada con línea de referencia en 9,85 m",
      estado: "baja",
      estadoLabel: "Descenso gradual",
      timestampIso: "2026-11-21T06:00:00",
      fechaActualizacionTexto: "Últimos 7 días · preliminar",
      ultimaSincronizacionTexto: "Serie combinada IDEAM + FEWS",
      station: CALAMAR_STATION_SEED,
      lectura: seedReading,
      resumenCampo: "Tendencia descendente moderada en la última semana (-26,0 cm)",
      accionSecundariaLabel: "Ver últimas lecturas",
      seriesPoints: seedSeries,
      latestReadings: [...seedSeries].reverse(),
      documentos: [
        {
          label: "Visor FEWS IDEAM",
          url: "https://fews.ideam.gov.co/",
        },
      ],
      esDatoEnVivo: false,
    },
    {
      id: "bloque-alerta-cuenca",
      tipo: "alerta_hidrologica",
      fuente: "IDEAM · Open-Meteo Cuenca Magdalena-Cauca",
      titulo: "Estado de umbrales y lluvia prevista en la cuenca",
      subtitulo: "Evaluación frente a la cota crítica y aporte pluvial 24 h",
      estado: "estable",
      estadoLabel: "Bajo cota crítica",
      timestampIso: "2026-11-21T06:00:00",
      fechaActualizacionTexto: "21 nov 2026 · 105 subzonas",
      ultimaSincronizacionTexto: "Cota crítica configurada: 9,85 m (985 cm)",
      station: CALAMAR_STATION_SEED,
      lectura: seedReading,
      resumenCampo: "Nivel actual sin riesgo de desbordamiento sobre la muralla",
      accionSecundariaLabel: "Umbrales usados",
      textoExplicativo:
        "La estación limnimétrica de Calamar registra actualmente 4,86 m (486 cm), manteniéndose 4,99 m por debajo de la cota crítica configurada de 9,85 m (985 cm). La lluvia prevista se estima como promedio espacial ponderado sobre las 105 subzonas hidrográficas Magdalena-Cauca del IDEAM para las próximas 24 horas; este dato es orientativo y no pronostica directamente el tránsito de onda ni la operación de embalses aguas arriba.",
      thresholdRows: seedThresholds,
      documentos: [
        {
          label: "Zonificación hidrográfica IDEAM",
          url: "https://dhime.ideam.gov.co/server/rest/services/Cartografia_Tematica/ZonificacionHidrografica/MapServer/0",
        },
        {
          label: "Pronóstico Open-Meteo (CC BY 4.0)",
          url: "https://open-meteo.com/",
        },
      ],
      esDatoEnVivo: false,
    },
    {
      id: "bloque-boletin-estacion",
      tipo: "boletin_ideam",
      fuente: "IDEAM — Catálogo Nacional de Estaciones",
      titulo: "Ficha territorial y ubicación · Calamar, Bolívar",
      subtitulo: "Estación limnimétrica 29037020 en la bifurcación del Canal del Dique",
      estado: "estable",
      estadoLabel: "Estación operativa",
      timestampIso: "2026-11-21T06:00:00",
      fechaActualizacionTexto: "10,251222° N · -74,914528° O",
      ultimaSincronizacionTexto: "Referencia altimétrica: 10 m s. n. m.",
      station: CALAMAR_STATION_SEED,
      lectura: seedReading,
      resumenCampo: "Punto estratégico de control hidrológico del Bajo Magdalena",
      accionSecundariaLabel: "Ver metadatos",
      textoExplicativo:
        "La estación limnimétrica Calamar [29037020] monitorea el comportamiento del río Magdalena en su ingreso hacia el Canal del Dique y el tramo terminal hacia Bocas de Ceniza. Las lecturas intradiarias publicadas en FEWS IDEAM son preliminares y pueden ser ajustadas tras validación técnica en DHIME. Esta plataforma ciudadana es estrictamente informativa y no reemplaza los comunicados oficiales del IDEAM, la UNGRD ni el Consejo Municipal de Gestión del Riesgo de Calamar.",
      documentos: [
        {
          label: "Abrir ubicación en OpenStreetMap",
          url: "https://www.openstreetmap.org/?mlat=10.251222&mlon=-74.914528#map=15/10.251222/-74.914528",
        },
        {
          label: "Catálogo Nacional de Estaciones IDEAM",
          url: "https://dhime.ideam.gov.co/server/rest/services/CNE/Estaciones/MapServer/0",
        },
      ],
      esDatoEnVivo: false,
    },
  ];
}

export function mapDashboardToObservatoryBlocks(
  d: DashboardResponse
): ObservatoryBlock[] {
  const station: StationInfo = {
    codigoIdeam: d.config.estacionCodigo,
    nombre: d.config.estacionNombre,
    municipio: "Calamar",
    departamento: "Bolívar",
    cuenca: "Bajo Magdalena · Canal del Dique",
    latitud: d.config.estacionLatitud,
    longitud: d.config.estacionLongitud,
    altitudMsnm: d.config.estacionAltitudMsnm,
    fuenteOficial: "IDEAM · FEWS Colombia",
  };

  const nivelCm = d.meta.nivelCm;
  const nivelMetros = Math.round((nivelCm / 100) * 100) / 100;
  const refCm = d.config.nivelReferenciaCm;
  const refMetros = Math.round((refCm / 100) * 100) / 100;
  const murallaCm = d.config.nivelMurallaCm;
  const murallaMetros = Math.round((murallaCm / 100) * 100) / 100;
  const margenACriticaMetros = Math.round(((refCm - nivelCm) / 100) * 100) / 100;

  const lectura: LimnimetricReading = {
    nivelMetros,
    nivelCm,
    variacionCm: d.meta.deltaCm,
    flecha: d.meta.flecha,
    variacionTexto: d.meta.cambioTexto,
    cotaReferenciaMetros: refMetros,
    cotaReferenciaCm: refCm,
    cotaMurallaMetros: murallaMetros,
    cotaMurallaCm: murallaCm,
    margenACriticaMetros,
    estadoAlerta: d.alertState,
    notaEstado: buildNotaEstado(d.alertState, refMetros, refCm),
  };

  const readings: RiverReading[] = d.records.map((r) => ({
    fecha: r.f,
    fechaMs: isoToUtcMs(r.f),
    nivelCm: r.n,
    ultimaLectura: r.u,
    ultimaLecturaMs: r.u ? isoToUtcMs(r.u) : null,
    fuente: r.s === 1 ? "FEWS" : "Histórico IDEAM",
  }));

  const latest30 = [...readings]
    .sort(
      (a, b) =>
        (b.ultimaLecturaMs ?? b.fechaMs) - (a.ultimaLecturaMs ?? a.fechaMs)
    )
    .slice(0, 30);

  const weatherCode = d.weather ? Math.round(d.weather.weather_code) : null;
  const ambiente = tipoAmbiente(weatherCode);
  const climaTexto =
    weatherCode !== null ? describirTiempo(weatherCode) : "clima no disponible";
  const noche = isNightInBogota(d.weather?.time);
  const vientoKmh = d.weather ? d.weather.wind_speed_10m : 0;

  const trendInfo = resolveTrendStatus(d.alertState, d.meta.deltaCm);
  const fechaUltTexto = fechaEs(d.meta.tsUlt, d.meta.tsUltHasTime);
  const syncHoraTexto = fechaEs(d.meta.fechaUlt, true);

  const margenTexto =
    margenACriticaMetros >= 0
      ? `${margenACriticaMetros.toFixed(2).replace(".", ",")} m por debajo de cota crítica (${refMetros.toFixed(2).replace(".", ",")} m)`
      : `${Math.abs(margenACriticaMetros).toFixed(2).replace(".", ",")} m sobre la cota crítica (${refMetros.toFixed(2).replace(".", ",")} m)`;

  const climaValor = d.weather
    ? `${describirTiempo(Math.round(d.weather.weather_code))} · ${d.weather.temperature_2m.toFixed(1)} °C`
    : "Sin conexión meteorológica";

  const thresholdRows: ThresholdEntry[] = [
    {
      clave: "amarilla",
      nombre: "Amarilla",
      valorCm: d.thresholds.valores.amarilla,
      origen: d.thresholds.origen.amarilla,
    },
    {
      clave: "naranja",
      nombre: "Naranja",
      valorCm: d.thresholds.valores.naranja,
      origen: d.thresholds.origen.naranja,
    },
    {
      clave: "roja",
      nombre: "Cota crítica (Roja)",
      valorCm: d.thresholds.valores.roja,
      origen: d.thresholds.origen.roja,
    },
  ];

  const totalRain24h = d.forecast
    ? d.forecast.reduce((acc, h) => acc + h.precipitacionMm, 0)
    : null;

  const osmUrl = `https://www.openstreetmap.org/?mlat=${station.latitud}&mlon=${station.longitud}#map=15/${station.latitud}/${station.longitud}`;

  const agedWarning =
    d.meta.edadDias > d.config.diasMaxSinDatos
      ? ` Nota: la última publicación de IDEAM tiene ${d.meta.edadDias} días; puede no reflejar el nivel instantáneo actual.`
      : "";

  return [
    {
      id: "bloque-nivel-actual",
      tipo: "nivel_actual",
      fuente: `IDEAM — Estación ${station.nombre} · ${station.codigoIdeam}`,
      titulo: "Lectura limnimétrica más reciente",
      subtitulo: "Nivel observado del río Magdalena frente a la cota crítica",
      estado: trendInfo.estado,
      estadoLabel: trendInfo.label,
      timestampIso: d.meta.tsUlt,
      fechaActualizacionTexto: fechaUltTexto,
      ultimaSincronizacionTexto: `Última lectura ${d.meta.fuente}: ${syncHoraTexto}`,
      station,
      lectura,
      resumenCampo: margenTexto,
      accionSecundariaLabel: "Ficha técnica",
      fichaTecnica: [
        {
          etiqueta: "Cota crítica",
          valor: `${refMetros.toFixed(2).replace(".", ",")} m (${refCm} cm)`,
        },
        {
          etiqueta: "Coronación muralla",
          valor: `${murallaMetros.toFixed(2).replace(".", ",")} m (${formatIntegerDot(murallaCm)} cm)`,
        },
        { etiqueta: "Clima en Calamar", valor: climaValor },
        {
          etiqueta: "Fuente oficial",
          valor: `${d.meta.fuente} · ${station.altitudMsnm} m s. n. m.`,
        },
      ],
      latestReadings: latest30,
      gaugeContext: {
        estadoPeces: d.meta.estadoPeces,
        ambiente,
        climaTexto,
        noche,
        vientoKmh,
        thresholds: d.thresholds,
        weather: d.weather,
      },
      documentos: [
        {
          label: "Abrir visor FEWS nacional",
          url: d.config.fewsVisorUrl,
        },
      ],
      esDatoEnVivo: true,
    },
    {
      id: "bloque-serie-historica",
      tipo: "serie_historica",
      fuente: "IDEAM — Serie Histórica & FEWS",
      titulo: "Serie temporal y tendencia del río",
      subtitulo: `${formatNumberComma(readings.length, 0)} registros consolidados · referencia en ${refMetros.toFixed(2).replace(".", ",")} m`,
      estado:
        d.trend.direccion.toLowerCase().includes("sub")
          ? "sube"
          : d.trend.direccion.toLowerCase().includes("baj")
            ? "baja"
            : "estable",
      estadoLabel: d.trend.direccion,
      timestampIso: d.meta.fechaUlt,
      fechaActualizacionTexto: d.fewsRange
        ? `FEWS: ${d.fewsRange.start} – ${d.fewsRange.end}`
        : fechaUltTexto,
      ultimaSincronizacionTexto: `${formatNumberComma(d.fewsCount, 0)} lecturas FEWS recientes`,
      station,
      lectura,
      resumenCampo: d.trend.motivo,
      accionSecundariaLabel: "Últimas 30 lecturas",
      seriesPoints: readings,
      latestReadings: latest30,
      documentos: [
        {
          label: "Consultar visor FEWS IDEAM",
          url: d.config.fewsVisorUrl,
        },
      ],
      esDatoEnVivo: true,
    },
    {
      id: "bloque-alerta-cuenca",
      tipo: "alerta_hidrologica",
      fuente: "IDEAM · Open-Meteo Cuenca Magdalena-Cauca",
      titulo: "Umbrales de alerta y lluvia prevista en la cuenca",
      subtitulo:
        totalRain24h !== null
          ? `Lluvia media acumulada 24 h: ${totalRain24h.toFixed(1)} mm en ${d.subzonesCount} subzonas`
          : "Evaluación de cota crítica y umbrales configurados",
      estado:
        d.alertState === "roja" ||
        d.alertState === "naranja" ||
        d.alertState === "amarilla"
          ? "alerta"
          : "estable",
      estadoLabel:
        d.alertState === "verde"
          ? "Bajo cota crítica"
          : d.alertState === "roja"
            ? "Alerta roja"
            : d.alertState === "naranja"
              ? "Alerta naranja"
              : d.alertState === "amarilla"
                ? "Alerta amarilla"
                : "Sin umbral",
      timestampIso: d.weather?.time ?? d.meta.fechaUlt,
      fechaActualizacionTexto: d.weather
        ? `${fechaEs(d.weather.time, true)} · Colombia`
        : fechaUltTexto,
      ultimaSincronizacionTexto: `Área cuenca: ${formatIntegerDot(d.totalAreaKm2)} km²`,
      station,
      lectura,
      resumenCampo: `${d.trend.direccion} (3 días) · ${margenTexto}`,
      accionSecundariaLabel: "Umbrales usados",
      textoExplicativo:
        `La lectura observada de ${formatNumberComma(nivelCm, 1)} cm (${nivelMetros.toFixed(2).replace(".", ",")} m) se evalúa frente a la cota crítica configurada para Calamar de ${refMetros.toFixed(2).replace(".", ",")} m (${refCm} cm). ` +
        `La lluvia prevista se calcula como promedio espacial ponderado sobre ${d.subzonesCount} subzonas hidrográficas del área Magdalena-Cauca (${formatIntegerDot(d.totalAreaKm2)} km²). ` +
        `Esta dirección resume la serie reciente de Calamar y no pronostica el nivel de las próximas 24 horas: no se modelan el aporte local, la escorrentía, los caudales, los tiempos de tránsito ni la operación de embalses.${agedWarning}`,
      forecastHours: d.forecast ?? undefined,
      totalAreaKm2: d.totalAreaKm2,
      subzonesCount: d.subzonesCount,
      trendMotivo: d.trend.motivo,
      thresholdRows,
      documentos: [
        {
          label: "Pronóstico Open-Meteo (CC BY 4.0)",
          url: "https://open-meteo.com/",
        },
        {
          label: "Zonificación hidrográfica 2025 IDEAM",
          url: "https://dhime.ideam.gov.co/server/rest/services/Cartografia_Tematica/ZonificacionHidrografica/MapServer/0",
        },
      ],
      esDatoEnVivo: true,
    },
    {
      id: "bloque-boletin-estacion",
      tipo: "boletin_ideam",
      fuente: `IDEAM — Estación Limnimétrica ${station.codigoIdeam}`,
      titulo: `Estación ${station.nombre}, ${station.departamento}`,
      subtitulo: `${station.latitud.toFixed(6)}, ${station.longitud.toFixed(6)} · ${station.altitudMsnm} m s. n. m.`,
      estado: "estable",
      estadoLabel: "Referencia territorial",
      timestampIso: d.meta.fechaUlt,
      fechaActualizacionTexto: syncHoraTexto,
      ultimaSincronizacionTexto: "Hidrología Nacional Diaria · DHIME y FEWS",
      station,
      lectura,
      resumenCampo: "Ubicación oficial en Calamar, Bolívar y enlaces institucionales",
      accionSecundariaLabel: "Notas técnicas",
      textoExplicativo:
        `Fuente: IDEAM, Hidrología Nacional Diaria y exportaciones DHIME; estación limnimétrica ${station.codigoIdeam} – Calamar, Bolívar. ` +
        `El histórico local muestra nivel medio diario y las últimas observaciones FEWS pueden ser intradiarias. ` +
        `Las lecturas FEWS son preliminares y el IDEAM puede publicarlas con retraso o corregirlas después. ` +
        `Esta herramienta es informativa y no reemplaza los avisos oficiales del IDEAM, la UNGRD ni del Consejo Municipal de Gestión del Riesgo.`,
      documentos: [
        {
          label: "Abrir ubicación en OpenStreetMap",
          url: osmUrl,
        },
        {
          label: "Catálogo Nacional de Estaciones del IDEAM",
          url: "https://dhime.ideam.gov.co/server/rest/services/CNE/Estaciones/MapServer/0",
        },
        {
          label: "Visor FEWS nacional",
          url: d.config.fewsVisorUrl,
        },
      ],
      esDatoEnVivo: true,
    },
  ];
}
