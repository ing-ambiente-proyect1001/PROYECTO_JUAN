import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { SwPush } from "@angular/service-worker";
import { Subscription } from "rxjs";
import { NotificacionesPromptComponent } from "../../../../components/notificaciones-prompt/notificaciones-prompt.component";
import { PwaInstallComponent } from "../../../../components/pwa-install/pwa-install.component";
import { DashboardService } from "../../../../services/dashboard.service";
import type { DashboardResponse } from "../../../../../types";
import { formatNumberComma } from "../../../../../utils/format";
import {
  createSeedObservatoryBlocks,
  mapDashboardToObservatoryBlocks,
} from "../../data/calamar-seed-blocks";
import type {
  ObservatoryBlock,
  ObservatoryNavTab,
} from "../../models/limnimetro-block.model";
import { BottomNavComponent } from "../bottom-nav/bottom-nav.component";
import { HydroBlockCardComponent } from "../hydro-block-card/hydro-block-card.component";

const TAB_BLOCK_FILTER: Record<
  ObservatoryNavTab,
  ReadonlyArray<ObservatoryBlock["tipo"]>
> = {
  bloques: [
    "nivel_actual",
    "serie_historica",
    "alerta_hidrologica",
    "boletin_ideam",
  ],
  niveles: ["nivel_actual"],
  historico: ["serie_historica"],
  alertas: ["alerta_hidrologica"],
  calamar: ["boletin_ideam"],
};

@Component({
  selector: "app-observatory-shell",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BottomNavComponent,
    HydroBlockCardComponent,
    NotificacionesPromptComponent,
    PwaInstallComponent,
  ],
  template: `
    <div class="obs-shell">
      <!-- Barra superior de navegación (escritorio/tableta, sin texto JUAN duplicado) -->
      <header class="obs-topbar">
        <div class="obs-topbar-inner">
          <app-bottom-nav
            class="obs-desktop-nav-host"
            variant="desktop-links"
            [activeTab]="activeTab()"
            [hasActiveAlert]="hasActiveAlert()"
            (tabChange)="onTabChange($event)"
          />

          <div class="obs-topbar-action">
            <button
              type="button"
              class="obs-refresh-btn"
              [disabled]="refreshing()"
              (click)="fetchDashboard(true)"
            >
              {{ refreshing() ? "Sincronizando..." : "Actualizar" }}
            </button>
          </div>
        </div>
      </header>

      <!-- Contenedor principal sobre fondo neutro con bloques completos apilados -->
      <main
        class="obs-workspace"
        id="inicio"
        aria-label="Bloques del observatorio hidrológico"
      >
        <!-- Bloque de portada con el logo original de JUAN -->
        <section class="profile-card" aria-label="Perfil del proyecto JUAN">
          <div
            class="profile-cover"
            [style.--cover-image]="'url(assets/juan_portada.webp)'"
          ></div>
          <img
            class="profile-avatar"
            src="assets/juan_icon.png"
            alt="Imagen de JUAN"
            referrerpolicy="no-referrer"
          />
          <div class="profile-content">
            <h1>JUAN</h1>
            <h2>
              OBSERVATORIO MONITOREO DEL NIVEL DE RIO MAGDALENA EN CALAMAR
              BOLIVAR
            </h2>
            <p>
              {{ primaryStation().nombre }}, {{ primaryStation().departamento }}
              · Estación IDEAM {{ primaryStation().codigoIdeam }} · Nivel
              observado
            </p>
            <app-pwa-install />
          </div>
        </section>

        @if (errorMessage()) {
          <div class="obs-sync-notice" role="status">
            {{ errorMessage() }} Mostrando el último conjunto de datos
            disponible.
          </div>
        }

        <div class="obs-blocks-stack">
          @for (block of visibleBlocks(); track block.id) {
            <app-hydro-block-card
              [block]="block"
              [refreshing]="refreshing()"
              (refreshRequested)="fetchDashboard(true)"
              (exportCsvRequested)="downloadCsv()"
              (shareRequested)="shareBlock($event)"
              (navigateTabRequested)="onTabChange($event)"
            />
          }
        </div>

        <app-notificaciones-prompt />

        <footer class="obs-legal-footer">
          <p>
            <strong>Fuente:</strong> IDEAM, Hidrología Nacional Diaria y
            exportaciones DHIME; estación limnimétrica
            {{ primaryStation().codigoIdeam }} – Calamar, Bolívar. Herramienta
            ciudadana informativa; no reemplaza los avisos oficiales del IDEAM,
            la UNGRD ni del Consejo Municipal de Gestión del Riesgo.
          </p>
        </footer>
      </main>

      <!-- Barra de navegación inferior fija en móvil -->
      <app-bottom-nav
        class="obs-mobile-nav-host"
        variant="mobile-bar"
        [activeTab]="activeTab()"
        [hasActiveAlert]="hasActiveAlert()"
        (tabChange)="onTabChange($event)"
      />
    </div>
  `,
})
export class ObservatoryShellComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly swPush = inject(SwPush);
  private readonly subs = new Subscription();

  readonly blocks = signal<ObservatoryBlock[]>(createSeedObservatoryBlocks());
  readonly rawDashboard = signal<DashboardResponse | null>(null);
  readonly activeTab = signal<ObservatoryNavTab>("bloques");
  readonly refreshing = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly visibleBlocks = computed(() => {
    const allowedTypes = TAB_BLOCK_FILTER[this.activeTab()];
    return this.blocks().filter((block) => allowedTypes.includes(block.tipo));
  });

  readonly primaryBlock = computed(() => this.blocks()[0]);

  readonly primaryStation = computed(() => this.primaryBlock().station);

  readonly primaryReading = computed(() => this.primaryBlock().lectura);

  readonly hasActiveAlert = computed(() => {
    const state = this.primaryReading().estadoAlerta;
    return state === "amarilla" || state === "naranja" || state === "roja";
  });

  ngOnInit(): void {
    void this.fetchDashboard(false);
    if (this.swPush.isEnabled) {
      this.subs.add(
        this.swPush.notificationClicks.subscribe(() => {
          this.onTabChange("bloques");
          void this.fetchDashboard(true);
        })
      );
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onBrandClick(event: Event): void {
    event.preventDefault();
    this.onTabChange("bloques");
  }

  onTabChange(tab: ObservatoryNavTab): void {
    this.activeTab.set(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async fetchDashboard(refreshFews = false): Promise<void> {
    this.refreshing.set(true);
    try {
      const payload = await this.dashboardService.getDashboard(refreshFews);
      this.rawDashboard.set(payload);
      this.blocks.set(mapDashboardToObservatoryBlocks(payload));
      this.errorMessage.set(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudo consultar el servicio de datos.";
      this.errorMessage.set(msg);
    } finally {
      this.refreshing.set(false);
    }
  }

  async shareBlock(block: ObservatoryBlock): Promise<void> {
    if (typeof window === "undefined") return;
    const shareUrl = window.location.href;
    const text =
      `JUAN · Río Magdalena en Calamar (${block.station.codigoIdeam}): ` +
      `${formatNumberComma(block.lectura.nivelCm, 1)} cm ` +
      `(${block.lectura.nivelMetros.toFixed(2)} m) · ${block.estadoLabel}.`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `JUAN · ${block.titulo}`,
          text,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy below if user cancels or browser blocks share
      }
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      } catch {
        // Ignore clipboard errors gracefully
      }
    }
  }

  downloadCsv(): void {
    const raw = this.rawDashboard();
    const lines = ["Fecha,Nivel_cm,Fuente,Ultima_lectura"];

    if (raw && raw.records.length > 0) {
      const fmtIso = (iso: string): string => {
        const [datePart, timePart] = iso.split("T");
        const hhmm = timePart ? timePart.slice(0, 5) : "00:00";
        return `${datePart} ${hhmm}`;
      };
      for (const r of raw.records) {
        const ult = r.u ? fmtIso(r.u) : "";
        lines.push(`${fmtIso(r.f)},${r.n},${r.s === 1 ? "FEWS" : "Histórico IDEAM"},${ult}`);
      }
    } else {
      const series =
        this.blocks().find((b) => b.seriesPoints?.length)?.seriesPoints ?? [];
      for (const r of series) {
        lines.push(`${r.fecha},${r.nivelCm},${r.fuente},${r.ultimaLectura ?? ""}`);
      }
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nivel_calamar.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
