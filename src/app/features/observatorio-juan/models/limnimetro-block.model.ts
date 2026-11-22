import type {
  DashboardResponse,
  ForecastHour,
  RiverReading,
  ThresholdsInfo,
  TrendArrow,
  WeatherCurrent,
} from "../../../../types";
import type { AmbienteTipo } from "../../../../utils/format";

export type ObservatoryBlockType =
  | "nivel_actual"
  | "serie_historica"
  | "alerta_hidrologica"
  | "boletin_ideam";

export type HydroTrendStatus = "sube" | "baja" | "estable" | "alerta";

export type HistoricalRangeOption = "7d" | "30d" | "anual";

export type ObservatoryNavTab =
  | "bloques"
  | "niveles"
  | "historico"
  | "alertas"
  | "calamar";

export interface StationInfo {
  readonly codigoIdeam: string;
  readonly nombre: string;
  readonly municipio: string;
  readonly departamento: string;
  readonly cuenca: string;
  readonly latitud: number;
  readonly longitud: number;
  readonly altitudMsnm: number;
  readonly fuenteOficial: string;
}

export interface LimnimetricReading {
  readonly nivelMetros: number;
  readonly nivelCm: number;
  readonly variacionCm: number;
  readonly flecha: TrendArrow;
  readonly variacionTexto: string;
  readonly cotaReferenciaMetros: number;
  readonly cotaReferenciaCm: number;
  readonly cotaMurallaMetros: number;
  readonly cotaMurallaCm: number;
  readonly margenACriticaMetros: number;
  readonly estadoAlerta: DashboardResponse["alertState"];
  readonly notaEstado: string;
}

export interface ThresholdEntry {
  readonly clave: "amarilla" | "naranja" | "roja";
  readonly nombre: string;
  readonly valorCm: number | null;
  readonly origen: string;
}

export interface ObservatoryDocumentLink {
  readonly label: string;
  readonly url: string;
}

export interface RiverGaugeRenderContext {
  readonly estadoPeces: "calm" | "scared";
  readonly ambiente: AmbienteTipo;
  readonly climaTexto: string;
  readonly noche: boolean;
  readonly vientoKmh: number;
  readonly thresholds: ThresholdsInfo;
  readonly weather: WeatherCurrent | null;
}

export interface ObservatoryBlock {
  readonly id: string;
  readonly tipo: ObservatoryBlockType;
  readonly fuente: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly estado: HydroTrendStatus;
  readonly estadoLabel: string;
  readonly timestampIso: string;
  readonly fechaActualizacionTexto: string;
  readonly ultimaSincronizacionTexto: string;
  readonly station: StationInfo;
  readonly lectura: LimnimetricReading;
  readonly resumenCampo: string;
  readonly accionSecundariaLabel: string;
  readonly textoExplicativo?: string;
  readonly fichaTecnica?: ReadonlyArray<{
    readonly etiqueta: string;
    readonly valor: string;
  }>;
  readonly seriesPoints?: readonly RiverReading[];
  readonly latestReadings?: readonly RiverReading[];
  readonly forecastHours?: readonly ForecastHour[];
  readonly totalAreaKm2?: number;
  readonly subzonesCount?: number;
  readonly trendMotivo?: string;
  readonly thresholdRows?: readonly ThresholdEntry[];
  readonly gaugeContext?: RiverGaugeRenderContext;
  readonly documentos?: readonly ObservatoryDocumentLink[];
  readonly esDatoEnVivo: boolean;
}
