export interface RawRecord {
  /** Fecha string: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS */
  f: string;
  /** Nivel en cm */
  n: number;
  /** Ultima_lectura string or null */
  u: string | null;
  /** Fuente: 0 = "Histórico IDEAM", 1 = "FEWS" */
  s: 0 | 1;
}

export interface RiverReading {
  fecha: string;
  fechaMs: number;
  nivelCm: number;
  ultimaLectura: string | null;
  ultimaLecturaMs: number | null;
  fuente: string;
}

export interface WeatherCurrent {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
}

export interface ForecastHour {
  fechaHora: string;
  precipitacionMm: number;
}

export interface ThresholdsInfo {
  valores: {
    amarilla: number | null;
    naranja: number | null;
    roja: number | null;
  };
  origen: {
    amarilla: string;
    naranja: string;
    roja: string;
  };
}

export type TrendArrow = "▲" | "▼" | "▬";

export interface ResumenLecturaJson {
  fechaHora: string;
  nivelCm: number;
  nivelMetros: number;
  nivelPrevioCm: number | null;
  deltaCm: number;
  variacion24hCm: number | null;
  flecha: TrendArrow;
  tendencia: "sube" | "baja" | "sin_cambio";
  cambioTexto: string;
  calculadoPor?: string;
  calculadoEn?: string;
}

export interface ReadingMeta {
  nivelCm: number;
  fechaUlt: string;
  tsUlt: string;
  tsUltHasTime: boolean;
  deltaCm: number;
  flecha: TrendArrow;
  cambioTexto: string;
  edadDias: number;
  fuente: string;
  estadoPeces: "calm" | "scared";
  estadoPecesTexto: string;
}

export interface DashboardResponse {
  records: RawRecord[];
  fewsCount: number;
  fewsRange: { start: string; end: string } | null;
  fewsError: string | null;
  meta: ReadingMeta;
  thresholds: ThresholdsInfo;
  alertState: "verde" | "amarilla" | "naranja" | "roja" | "sin_umbral";
  trend: {
    direccion: string;
    motivo: string;
  };
  weather: WeatherCurrent | null;
  weatherError: string | null;
  forecast: ForecastHour[] | null;
  forecastError: string | null;
  subzonesCount: number;
  totalAreaKm2: number;
  config: {
    estacionCodigo: string;
    estacionNombre: string;
    estacionLatitud: number;
    estacionLongitud: number;
    estacionAltitudMsnm: number;
    nivelReferenciaCm: number;
    nivelMurallaCm: number;
    diasMaxSinDatos: number;
    fewsVisorUrl: string;
    appUrl: string;
  };
}
