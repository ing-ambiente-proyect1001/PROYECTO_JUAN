import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import { PlotlyChartComponent } from "../../../../components/plotly-chart/plotly-chart.component";
import { RiverGaugeComponent } from "../../../../components/river-gauge/river-gauge.component";
import { StationMapComponent } from "../../../../components/station-map/station-map.component";
import {
  fechaEs,
  formatNumberComma,
  iconoTiempo,
} from "../../../../../utils/format";
import type {
  HistoricalRangeOption,
  ObservatoryBlock,
  ObservatoryNavTab,
} from "../../models/limnimetro-block.model";

const RANGE_DAYS: Record<HistoricalRangeOption, number> = {
  "7d": 7,
  "30d": 30,
  anual: 365,
};

@Component({
  selector: "app-hydro-block-card",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlotlyChartComponent, RiverGaugeComponent, StationMapComponent],
  template: `
    @let b = block();
    <article
      class="hydro-block-card"
      [attr.id]="b.id"
      [attr.aria-labelledby]="b.id + '-title'"
    >
      <!-- 1. Cabecera del bloque -->
      <header class="block-header">
        <div class="block-header-main">
          <div class="block-source-line">
            <span>{{ b.fuente }}</span>
            <span aria-hidden="true">·</span>
            <time [attr.datetime]="b.timestampIso">{{
              b.fechaActualizacionTexto
            }}</time>
          </div>
          <h3 [attr.id]="b.id + '-title'" class="block-title">
            {{ b.titulo }}
          </h3>
          <p class="block-subtitle">{{ b.subtitulo }}</p>
        </div>

        <div class="block-header-aside">
          <span
            class="block-trend-indicator"
            [class.is-up]="b.estado === 'sube'"
            [class.is-down]="b.estado === 'baja'"
            [class.is-alert]="b.estado === 'alerta'"
          >
            @if (b.estado === "sube") {
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <polygon points="6,2 11,9.5 1,9.5" />
              </svg>
            } @else if (b.estado === "baja") {
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <polygon points="6,10 11,2.5 1,2.5" />
              </svg>
            } @else if (b.estado === "alerta") {
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 1.5 11.2 10.5H.8L6 1.5Z" />
              </svg>
            } @else {
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="2" y="5" width="8" height="2" rx="1" />
              </svg>
            }
            <span>{{ b.estadoLabel }}</span>
          </span>
        </div>
      </header>

      <!-- 2. Métrica limnimétrica principal (solo en el bloque inicial de nivel actual) -->
      @if (b.tipo === "nivel_actual") {
        <div class="block-metric-band">
          <div class="block-metric-primary">
            <span class="block-metric-kicker">NIVEL LIMNIMÉTRICO</span>
            <div class="block-metric-value-row">
              <span class="block-metric-value tabular-nums">
                {{ formatNumberComma(b.lectura.nivelCm, 1) }}
                <span class="block-metric-unit">cm</span>
              </span>

              @if (b.lectura.flecha === "▲") {
                <span
                  class="reading-trend-arrow reading-trend-up"
                  role="img"
                  aria-label="▲ El nivel del río subió"
                  title="▲ El nivel del río subió"
                >
                  <svg viewBox="0 0 20 28" fill="currentColor" aria-hidden="true">
                    <path d="M10 2L18 11.5H12.2V26H7.8V11.5H2L10 2Z" />
                  </svg>
                </span>
              } @else if (b.lectura.flecha === "▼") {
                <span
                  class="reading-trend-arrow reading-trend-down"
                  role="img"
                  aria-label="▼ El nivel del río bajó"
                  title="▼ El nivel del río bajó"
                >
                  <svg viewBox="0 0 20 28" fill="currentColor" aria-hidden="true">
                    <path d="M10 26L18 16.5H12.2V2H7.8V16.5H2L10 26Z" />
                  </svg>
                </span>
              } @else {
                <span
                  class="reading-trend-arrow reading-trend-steady"
                  role="img"
                  aria-label="▬ Sin cambio respecto a la lectura anterior"
                  title="▬ Sin cambio respecto a la lectura anterior"
                >
                  <svg viewBox="0 0 20 28" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="12" width="16" height="4" rx="1.5" />
                  </svg>
                </span>
              }

              <span class="block-metric-meters tabular-nums">
                ({{ b.lectura.nivelMetros.toFixed(2) }} m)
              </span>
            </div>
          </div>

          <div class="block-metric-context">
            <div class="block-variation-row">
              @if (b.lectura.flecha === "▲") {
                <svg
                  class="variation-delta reading-trend-up"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="5,1.5 9.5,8.5 0.5,8.5" />
                </svg>
              } @else if (b.lectura.flecha === "▼") {
                <svg
                  class="variation-delta reading-trend-down"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="5,8.5 9.5,1.5 0.5,1.5" />
                </svg>
              } @else {
                <svg
                  class="variation-delta reading-trend-steady"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="1" y="4" width="8" height="2" rx="1" />
                </svg>
              }
              <span class="tabular-nums">{{ b.lectura.variacionTexto }}</span>
            </div>
            <p class="block-field-summary">
              {{ b.resumenCampo }} · Cota crítica:
              <strong class="tabular-nums">
                {{ b.lectura.cotaReferenciaMetros.toFixed(2).replace(".", ",") }} m
              </strong>
            </p>
          </div>
        </div>
      }

      <!-- 3. Cuerpo visual / Contenido técnico según tipo de bloque -->
      <div class="block-body">
        @if (b.tipo === "nivel_actual") {
          <div class="nivel-actual-grid">
            <div class="nivel-gauge-column">
              @if (b.gaugeContext; as gc) {
                <app-river-gauge
                  [nivelCm]="b.lectura.nivelCm"
                  [umbrales]="gc.thresholds"
                  [estadoPeces]="gc.estadoPeces"
                  [ambiente]="gc.ambiente"
                  [climaTexto]="gc.climaTexto"
                  [noche]="gc.noche"
                  [vientoKmh]="gc.vientoKmh"
                  [estacionCodigo]="b.station.codigoIdeam"
                  [nivelReferenciaCm]="b.lectura.cotaReferenciaCm"
                  [nivelMurallaCm]="b.lectura.cotaMurallaCm"
                />
              }
            </div>

            <div class="nivel-info-column">
              @if (b.fichaTecnica; as specs) {
                <dl class="tech-spec-list">
                  @for (spec of specs; track spec.etiqueta) {
                    <div class="tech-spec-row">
                      <dt>{{ spec.etiqueta }}</dt>
                      <dd class="tabular-nums">{{ spec.valor }}</dd>
                    </div>
                  }
                </dl>
              }

              @if (b.gaugeContext; as gc) {
                @if (gc.weather; as w) {
                  <div class="weather-inline-row" aria-label="Clima actual en Calamar">
                    <span class="weather-inline-icon" aria-hidden="true">
                      {{ iconoTiempo(Math.round(w.weather_code), gc.noche) }}
                    </span>
                    <div class="weather-inline-text">
                      <strong>{{ gc.climaTexto }}</strong>
                      <span class="tabular-nums">
                        {{ w.temperature_2m.toFixed(1) }} °C · humedad
                        {{ Math.round(w.relative_humidity_2m) }}% · viento
                        {{ w.wind_speed_10m.toFixed(0) }} km/h
                      </span>
                    </div>
                  </div>
                }
              }

              <div class="reading-divider"></div>

              <p
                class="reading-status"
                [class.reading-status--normal]="b.lectura.estadoAlerta === 'verde'"
                [class.reading-status--warning]="
                  b.lectura.estadoAlerta === 'amarilla' ||
                  b.lectura.estadoAlerta === 'naranja'
                "
                [class.reading-status--critical]="b.lectura.estadoAlerta === 'roja'"
              >
                {{ b.lectura.notaEstado }}
              </p>

              <div class="nivel-inline-actions">
                <button
                  type="button"
                  class="btn-action"
                  [disabled]="refreshing()"
                  (click)="refreshRequested.emit()"
                >
                  {{ refreshing() ? "Actualizando..." : "Actualizar ahora" }}
                </button>
                @if (b.documentos; as docs) {
                  @if (docs.length > 0) {
                    <a
                      class="btn-link"
                      [href]="docs[0].url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ docs[0].label }}
                    </a>
                  }
                }
              </div>
            </div>
          </div>
        } @else if (b.tipo === "serie_historica") {
          <div class="series-controls-bar">
            <div
              class="range-segmented"
              role="group"
              aria-label="Rango temporal de la serie histórica"
            >
              @for (opt of rangeOptions; track opt.id) {
                <button
                  type="button"
                  class="range-seg-btn"
                  [class.is-active]="selectedRange() === opt.id"
                  (click)="selectedRange.set(opt.id)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>

            @if (filteredSeries().length > 0) {
              <span class="series-span-meta tabular-nums">
                {{ formatNumberComma(filteredSeries().length, 0) }} registros ·
                {{ fechaEs(filteredSeries()[0].fecha) }} –
                {{
                  fechaEs(filteredSeries()[filteredSeries().length - 1].fecha)
                }}
              </span>
            }
          </div>

          @if (historicalChartConfig(); as hChart) {
            <div class="chart-stage">
              <app-plotly-chart [data]="hChart.data" [layout]="hChart.layout" />
            </div>
          } @else {
            <div class="chart-empty-note">
              No hay suficientes observaciones para el período seleccionado.
            </div>
          }
        } @else if (b.tipo === "alerta_hidrologica") {
          @if (b.textoExplicativo) {
            <div class="editorial-copy-wrap">
              <p
                class="editorial-copy"
                [class.line-clamp-3]="!expandedText()"
              >
                {{ b.textoExplicativo }}
              </p>
              <button
                type="button"
                class="btn-text-expand"
                [attr.aria-expanded]="expandedText()"
                (click)="toggleExpandedText()"
              >
                {{ expandedText() ? "ver menos" : "...ver más" }}
              </button>
            </div>
          }

          <p
            class="reading-status"
            [class.reading-status--normal]="b.lectura.estadoAlerta === 'verde'"
            [class.reading-status--warning]="
              b.lectura.estadoAlerta === 'amarilla' ||
              b.lectura.estadoAlerta === 'naranja'
            "
            [class.reading-status--critical]="b.lectura.estadoAlerta === 'roja'"
          >
            {{ b.lectura.notaEstado }}
          </p>

          @if (b.thresholdRows; as rows) {
            @if (rows.length > 0) {
              <dl class="threshold-inline-grid">
                @for (row of rows; track row.clave) {
                  <div class="threshold-inline-item">
                    <dt>{{ row.nombre }}</dt>
                    <dd class="tabular-nums">
                      {{
                        row.valorCm === null
                          ? "—"
                          : row.valorCm.toFixed(0) + " cm"
                      }}
                      <span class="threshold-origin">({{ row.origen }})</span>
                    </dd>
                  </div>
                }
              </dl>
            }
          }

          @if (forecastChartConfig(); as fChart) {
            <div class="forecast-subblock">
              <div class="forecast-subblock-head">
                <span class="forecast-subblock-title">
                  Lluvia media acumulada en la cuenca · próximas 24 h
                </span>
                <strong class="forecast-subblock-total tabular-nums">
                  {{ fChart.totalMm.toFixed(1) }} mm
                </strong>
              </div>
              <app-plotly-chart [data]="fChart.data" [layout]="fChart.layout" />
            </div>
          }

          @if (b.documentos; as docs) {
            @if (docs.length > 0) {
              <div class="doc-links-row">
                @for (doc of docs; track doc.url) {
                  <a
                    class="doc-link-item"
                    [href]="doc.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ doc.label }}
                  </a>
                }
              </div>
            }
          }
        } @else if (b.tipo === "boletin_ideam") {
          @if (b.textoExplicativo) {
            <div class="editorial-copy-wrap">
              <p
                class="editorial-copy"
                [class.line-clamp-3]="!expandedText()"
              >
                {{ b.textoExplicativo }}
              </p>
              <button
                type="button"
                class="btn-text-expand"
                [attr.aria-expanded]="expandedText()"
                (click)="toggleExpandedText()"
              >
                {{ expandedText() ? "ver menos" : "...ver más" }}
              </button>
            </div>
          }

          <app-station-map
            [lat]="b.station.latitud"
            [lon]="b.station.longitud"
            [label]="b.station.nombre.toUpperCase() + ' [' + b.station.codigoIdeam + ']'"
            [altitud]="b.station.altitudMsnm"
          />

          @if (b.documentos; as docs) {
            @if (docs.length > 0) {
              <div class="doc-links-row">
                @for (doc of docs; track doc.url) {
                  <a
                    class="doc-link-item"
                    [href]="doc.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ doc.label }}
                  </a>
                }
              </div>
            }
          }
        }
      </div>

      <!-- 4. Pie de bloque -->
      <footer class="block-footer">
        <div class="block-footer-meta">
          <span>{{ b.station.fuenteOficial }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ b.station.municipio }} - {{ b.station.departamento }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ b.ultimaSincronizacionTexto }}</span>
        </div>

        <div class="block-footer-actions" role="group" aria-label="Acciones del bloque">
          <button
            type="button"
            class="block-action-btn"
            (click)="onShareClick(b)"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <circle cx="15" cy="4.5" r="2" />
              <circle cx="5" cy="10" r="2" />
              <circle cx="15" cy="15.5" r="2" />
              <path d="M6.8 9 13.2 5.5M6.8 11l6.4 3.5" />
            </svg>
            <span>{{ shareCopied() ? "Copiado" : "Compartir" }}</span>
          </button>

          <button
            type="button"
            class="block-action-btn"
            (click)="exportCsvRequested.emit()"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 3v9.5M6.5 9.5 10 13l3.5-3.5M4 15.5h12" />
            </svg>
            <span>Exportar dato</span>
          </button>
        </div>
      </footer>
    </article>
  `,
})
export class HydroBlockCardComponent {
  readonly block = input.required<ObservatoryBlock>();
  readonly refreshing = input<boolean>(false);

  readonly refreshRequested = output<void>();
  readonly exportCsvRequested = output<void>();
  readonly shareRequested = output<ObservatoryBlock>();
  readonly navigateTabRequested = output<ObservatoryNavTab>();

  readonly expandedText = signal<boolean>(false);
  readonly selectedRange = signal<HistoricalRangeOption>("30d");
  readonly shareCopied = signal<boolean>(false);

  readonly Math = Math;
  readonly fechaEs = fechaEs;
  readonly formatNumberComma = formatNumberComma;
  readonly iconoTiempo = iconoTiempo;

  readonly rangeOptions: ReadonlyArray<{
    readonly id: HistoricalRangeOption;
    readonly label: string;
  }> = [
    { id: "7d", label: "7d" },
    { id: "30d", label: "30d" },
    { id: "anual", label: "Anual" },
  ];

  readonly filteredSeries = computed(() => {
    const b = this.block();
    const list = b.seriesPoints ?? [];
    if (list.length === 0) return [];
    const days = RANGE_DAYS[this.selectedRange()];
    const latestMs = list[list.length - 1].fechaMs;
    const cutoff = latestMs - days * 86_400_000;
    const filtered = list.filter((r) => r.fechaMs >= cutoff);
    return filtered.length > 0 ? filtered : list;
  });

  readonly historicalChartConfig = computed(() => {
    const b = this.block();
    const filtered = this.filteredSeries();
    if (b.tipo !== "serie_historica" || filtered.length === 0) {
      return null;
    }

    const x = filtered.map((r) => r.fecha.replace("T", " "));
    const y = filtered.map((r) => r.nivelCm);
    const customdata = filtered.map((r) => [
      fechaEs(r.fecha, r.fuente.startsWith("FEWS")),
      r.fuente,
    ]);

    const refCm = b.lectura.cotaReferenciaCm;
    const refMetros = (refCm / 100).toFixed(2).replace(".", ",");
    const yVals = [...y, refCm];

    const shapes: Record<string, unknown>[] = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: refCm,
        y1: refCm,
        line: { color: "#c62828", width: 1.4, dash: "dash" },
      },
    ];

    const annotations: Record<string, unknown>[] = [
      {
        xref: "paper",
        x: 0.01,
        xanchor: "left",
        yref: "y",
        y: refCm,
        yanchor: "bottom",
        text: `Cota crítica · ${refCm} cm (${refMetros} m)`,
        showarrow: false,
        font: { color: "#c62828", size: 11 },
      },
    ];

    let minY = yVals[0];
    let maxY = yVals[0];
    for (const v of yVals) {
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    }
    const rango = Math.max(maxY - minY, 1);
    const spanDays =
      (filtered[filtered.length - 1].fechaMs - filtered[0].fechaMs) /
      86_400_000;

    return {
      data: [
        {
          type: "scatter",
          x,
          y,
          name: "Nivel observado (cm)",
          mode: filtered.length <= 240 ? "lines+markers" : "lines",
          line: { color: "#0e6b80", width: 1.6 },
          marker: { size: 3.5, color: "#0e6b80" },
          customdata,
          hovertemplate:
            "<b>%{customdata[0]}</b><br>Nivel: <b>%{y:.1f} cm</b>" +
            "<br>Fuente: %{customdata[1]}<extra></extra>",
        },
      ],
      layout: {
        height: 320,
        margin: { l: 54, r: 16, t: 36, b: 36 },
        hovermode: "x",
        dragmode: false,
        shapes,
        annotations,
        xaxis: {
          fixedrange: true,
          tickformat: spanDays > 365 ? "%Y" : "%d %b",
        },
        yaxis: {
          fixedrange: true,
          title: "Nivel (cm)",
          range: [minY - 0.08 * rango, maxY + 0.14 * rango],
        },
      },
    };
  });

  readonly forecastChartConfig = computed(() => {
    const b = this.block();
    const forecast = b.forecastHours;
    if (!forecast || forecast.length === 0) return null;
    let cum = 0;
    const x = forecast.map((h) => h.fechaHora.replace("T", " "));
    const y = forecast.map((h) => {
      cum += h.precipitacionMm;
      return cum;
    });
    return {
      totalMm: cum,
      data: [
        {
          type: "scatter",
          x,
          y,
          name: "Lluvia acumulada (mm)",
          mode: "lines+markers",
          line: { color: "#0e6b80", width: 1.4 },
          marker: { size: 3, color: "#0e6b80" },
          fill: "tozeroy",
          fillcolor: "rgba(14, 107, 128, 0.08)",
          hovertemplate: "%{y:.1f} mm<extra></extra>",
        },
      ],
      layout: {
        height: 240,
        margin: { l: 54, r: 14, t: 28, b: 34 },
        hovermode: "x unified",
        xaxis: { title: "Hora local", tickformat: "%H:%M", fixedrange: true },
        yaxis: {
          title: "Precipitación (mm)",
          rangemode: "tozero",
          fixedrange: true,
        },
      },
    };
  });

  toggleExpandedText(): void {
    this.expandedText.update((v) => !v);
  }

  onShareClick(block: ObservatoryBlock): void {
    this.shareRequested.emit(block);
    this.shareCopied.set(true);
    setTimeout(() => this.shareCopied.set(false), 2000);
  }
}
