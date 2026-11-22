import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { NotificacionesService } from "../../services/notificaciones.service";

@Component({
  selector: "app-notificaciones-prompt",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let mode = notif.cardMode();
    @if (mode !== "hidden") {
      <section
        class="obs-notif-card"
        aria-label="Avisos de lecturas del río"
      >
        <div class="obs-notif-head">
          <span class="obs-notif-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>

          <div class="obs-notif-copy">
            @switch (mode) {
              @case ("ios_install_hint") {
                <h3 class="obs-notif-title">Avisos del nivel del río</h3>
                <p class="obs-notif-text">
                  Agrega la app a la pantalla de inicio para recibir avisos.
                </p>
              }

              @case ("ask") {
                <h3 class="obs-notif-title">
                  ¿Quieres recibir un aviso cuando haya una lectura nueva del río?
                </h3>
                <p class="obs-notif-text">
                  Incluye el valor observado en Calamar y su flecha de subida o bajada.
                  Puedes desactivar los avisos cuando quieras.
                </p>
              }

              @case ("enabled") {
                <h3 class="obs-notif-title">Avisos activados en este dispositivo</h3>
                <p class="obs-notif-text">
                  Te notificaremos cuando el IDEAM publique una lectura nueva, un cambio rápido
                  o un cruce de cota configurada.
                </p>
              }

              @case ("blocked") {
                <h3 class="obs-notif-title">Avisos bloqueados en el navegador</h3>
                <p class="obs-notif-text">
                  Para reactivarlos: abre el candado o menú de configuración junto a la dirección,
                  entra a <strong>Permisos → Notificaciones</strong>, elige
                  <strong>Permitir</strong> y recarga la aplicación.
                </p>
              }

              @case ("unavailable") {
                <h3 class="obs-notif-title">Avisos no disponibles en este dispositivo</h3>
                <p class="obs-notif-text">
                  {{
                    notif.unavailableReason() ||
                      "Tu navegador actual no soporta notificaciones Web Push o el Service Worker aún no está activo."
                  }}
                </p>
              }
            }
          </div>
        </div>

        @if (notif.feedbackMessage(); as msg) {
          <p class="obs-notif-feedback" role="status">{{ msg }}</p>
        }

        @if (notif.errorMessage(); as err) {
          <p class="obs-notif-error" role="alert">{{ err }}</p>
        }

        @if (mode === "ask") {
          <div class="obs-notif-actions">
            <button
              type="button"
              class="btn-action"
              [disabled]="notif.busy()"
              (click)="notif.enableNotifications()"
            >
              {{ notif.busy() ? "Activando..." : "Sí, avisarme" }}
            </button>
            <button
              type="button"
              class="btn-link"
              [disabled]="notif.busy()"
              (click)="notif.snoozePrompt()"
            >
              Ahora no
            </button>
          </div>
        } @else if (mode === "enabled") {
          <div class="obs-notif-actions">
            <button
              type="button"
              class="btn-link"
              [disabled]="notif.busy()"
              (click)="notif.disableNotifications()"
            >
              {{ notif.busy() ? "Desactivando..." : "Desactivar avisos" }}
            </button>
          </div>
        } @else if (mode === "unavailable") {
          <div class="obs-notif-actions">
            <button
              type="button"
              class="btn-link"
              (click)="notif.snoozePrompt()"
            >
              Ocultar por 7 días
            </button>
          </div>
        }
      </section>
    }
  `,
})
export class NotificacionesPromptComponent {
  readonly notif = inject(NotificacionesService);
}
