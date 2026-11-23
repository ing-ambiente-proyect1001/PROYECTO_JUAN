import fs from "node:fs";
import path from "node:path";

const ESTACION_CODIGO = "29037020";
const FEWS_NIVEL_URL =
  "https://fews.ideam.gov.co/visorfews/descargas/SeriesHM_conv.csv";
const ROOT_DIR = process.cwd();
const OUT_PATH = path.join(ROOT_DIR, "assets", "fews_calamar.json");
const DOCS_ASSETS_DIR = path.join(ROOT_DIR, "docs", "assets");

function parseCsvLine(line, delimiter = ";") {
  const result = [];
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

function parseTimestamp(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m =
    s.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    ) ||
    null;
  let year, month, day, hour = 0, minute = 0, second = 0, hasTime = false;

  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
    if (m[4] !== undefined && m[5] !== undefined) {
      hour = Number(m[4]);
      minute = Number(m[5]);
      second = m[6] ? Number(m[6]) : 0;
      hasTime = true;
    }
  } else {
    const m2 = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (!m2) return null;
    day = Number(m2[1]);
    month = Number(m2[2]);
    year = Number(m2[3]);
    if (m2[4] !== undefined && m2[5] !== undefined) {
      hour = Number(m2[4]);
      minute = Number(m2[5]);
      second = m2[6] ? Number(m2[6]) : 0;
      hasTime = true;
    }
  }

  const pad = (v) => String(v).padStart(2, "0");
  const datePart = `${year}-${pad(month)}-${pad(day)}`;
  const iso = hasTime
    ? `${datePart}T${pad(hour)}:${pad(minute)}:${pad(second)}`
    : datePart;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return { iso, ms };
}

function cleanNivel(val) {
  if (!Number.isFinite(val)) return null;
  let v = val;
  if (Math.abs(v) > 2000 && Math.abs(v) <= 200_000) v /= 100;
  if (v < 0 || v > 2000) return null;
  return Math.round(v * 100) / 100;
}

async function main() {
  const response = await fetch(FEWS_NIVEL_URL, {
    headers: {
      "User-Agent": "JUAN-RioCalamar/1.0 (Node; IDEAM FEWS fetcher)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} desde FEWS`);
  }

  const text = (await response.text()).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("FEWS devolvió una respuesta vacía.");
  }

  const header = parseCsvLine(lines[0], ";").map((h) => h.trim());
  const iEst = header.indexOf("ID_ESTACION");
  const iFecha = header.indexOf("FECHA_HORA");
  const iNivel = header.indexOf("NIVEL_INST");
  if (iEst === -1 || iFecha === -1 || iNivel === -1) {
    throw new Error("Formato inesperado en SeriesHM_conv.csv.");
  }

  const targetCode = ESTACION_CODIGO.replace(/^0+/, "");
  const dedup = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line, ";");
    const rowCode = (cols[iEst] || "").trim().replace(/^0+/, "");
    if (rowCode !== targetCode) continue;

    const ts = parseTimestamp(cols[iFecha]);
    const nivelM = Number(String(cols[iNivel] || "").trim().replace(",", "."));
    if (!ts || !Number.isFinite(nivelM)) continue;

    const nivelCm = cleanNivel(nivelM * 100);
    if (nivelCm === null) continue;

    dedup.set(ts.iso, {
      ms: ts.ms,
      record: { f: ts.iso, n: nivelCm, u: ts.iso, s: 1 },
    });
  }

  const sorted = Array.from(dedup.values())
    .sort((a, b) => a.ms - b.ms)
    .map((item) => item.record);

  if (sorted.length === 0) {
    throw new Error("No se encontraron registros válidos en FEWS para Calamar.");
  }

  let tolerancia = 0.05;
  try {
    const cfgPath = path.join(ROOT_DIR, "config_alertas.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      const tol = Number(cfg?.notificaciones?.tolerancia_sin_cambio_cm);
      if (Number.isFinite(tol) && tol >= 0) tolerancia = tol;
    }
  } catch {
    // Usar tolerancia por defecto
  }

  const combinedMap = new Map();
  const csvPath = path.join(ROOT_DIR, "nivel_calamar.csv");
  if (fs.existsSync(csvPath)) {
    const csvLines = fs
      .readFileSync(csvPath, "utf-8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);
    if (csvLines.length > 1) {
      const csvHdr = parseCsvLine(csvLines[0], ",").map((h) => h.trim());
      const idxF = csvHdr.indexOf("Fecha");
      const idxN = csvHdr.indexOf("Nivel_cm");
      if (idxF !== -1 && idxN !== -1) {
        for (let i = 1; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;
          const cols = parseCsvLine(line, ",");
          const ts = parseTimestamp(cols[idxF]);
          const nivelCm = cleanNivel(Number(String(cols[idxN] || "").replace(",", ".")));
          if (ts && nivelCm !== null) {
            combinedMap.set(ts.iso, { iso: ts.iso, ms: ts.ms, nivelCm });
          }
        }
      }
    }
  }

  for (const r of sorted) {
    const ts = parseTimestamp(r.f);
    if (ts) combinedMap.set(r.f, { iso: r.f, ms: ts.ms, nivelCm: r.n });
  }

  const combined = Array.from(combinedMap.values()).sort((a, b) => a.ms - b.ms);
  let resumenLectura = null;
  if (combined.length >= 1) {
    const ultimo = combined[combined.length - 1];
    const previo = combined.length >= 2 ? combined[combined.length - 2] : null;
    const deltaCm = previo ? Math.round((ultimo.nivelCm - previo.nivelCm) * 10) / 10 : 0;
    const flecha = deltaCm > tolerancia ? "▲" : deltaCm < -tolerancia ? "▼" : "▬";
    const tendencia = deltaCm > tolerancia ? "sube" : deltaCm < -tolerancia ? "baja" : "sin_cambio";
    const nivelMetros = Math.round((ultimo.nivelCm / 100) * 100) / 100;

    // Variación aproximada en 24 h (lectura más cercana hace ~24h dentro de [18h, 30h])
    let variacion24hCm = null;
    const targetMs = ultimo.ms - 24 * 3600 * 1000;
    let best24 = null;
    let bestDist = Infinity;
    for (let i = combined.length - 2; i >= 0; i--) {
      const diffHours = (ultimo.ms - combined[i].ms) / 3600000;
      if (diffHours < 18) continue;
      if (diffHours > 36) break;
      const dist = Math.abs(combined[i].ms - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        best24 = combined[i];
      }
    }
    if (best24) {
      variacion24hCm = Math.round((ultimo.nivelCm - best24.nivelCm) * 10) / 10;
    }

    const fmtDelta = Math.abs(deltaCm).toFixed(1).replace(/\.0$/, "");
    const cambioTexto =
      flecha === "▬"
        ? "Sin cambio"
        : `${flecha === "▲" ? "Subió" : "Bajó"} ${fmtDelta} cm vs. lectura anterior`;

    resumenLectura = {
      fechaHora: ultimo.iso,
      nivelCm: ultimo.nivelCm,
      nivelMetros,
      nivelPrevioCm: previo ? previo.nivelCm : null,
      deltaCm,
      variacion24hCm,
      flecha,
      tendencia,
      cambioTexto,
      calculadoPor: "scripts/update-fews.mjs",
      calculadoEn: new Date().toISOString(),
    };
  }

  let hasMeaningfulChange = true;
  if (fs.existsSync(OUT_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
      const stripMeta = (r) => {
        if (!r || typeof r !== "object") return null;
        const { calculadoEn: _ce, calculadoPor: _cp, ...rest } = r;
        return rest;
      };
      const sameRecords = JSON.stringify(prev?.records ?? null) === JSON.stringify(sorted);
      const sameResumen =
        JSON.stringify(stripMeta(prev?.resumenLectura)) ===
        JSON.stringify(stripMeta(resumenLectura));
      if (sameRecords && sameResumen) {
        hasMeaningfulChange = false;
      }
    } catch {
      hasMeaningfulChange = true;
    }
  }

  if (!hasMeaningfulChange) {
    console.log(
      `FEWS sin cambios nuevos (${sorted.length} registros; última: ${sorted[sorted.length - 1].f}).`
    );
    return;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    station: ESTACION_CODIGO,
    resumenLectura,
    records: sorted,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const serialized = JSON.stringify(payload, null, 2) + "\n";
  fs.writeFileSync(OUT_PATH, serialized, "utf-8");

  if (fs.existsSync(DOCS_ASSETS_DIR)) {
    fs.writeFileSync(
      path.join(DOCS_ASSETS_DIR, "fews_calamar.json"),
      serialized,
      "utf-8"
    );
    const csvSrc = path.join(ROOT_DIR, "nivel_calamar.csv");
    if (fs.existsSync(csvSrc)) {
      fs.copyFileSync(csvSrc, path.join(DOCS_ASSETS_DIR, "nivel_calamar.csv"));
    }
    const cfgSrc = path.join(ROOT_DIR, "config_alertas.json");
    if (fs.existsSync(cfgSrc)) {
      fs.copyFileSync(cfgSrc, path.join(DOCS_ASSETS_DIR, "config_alertas.json"));
    }
  }

  console.log(
    `FEWS actualizado: ${sorted.length} registros (${sorted[0].f} -> ${sorted[sorted.length - 1].f})`
  );
}

main().catch((err) => {
  console.error("Error actualizando FEWS:", err);
  process.exitCode = 1;
});
