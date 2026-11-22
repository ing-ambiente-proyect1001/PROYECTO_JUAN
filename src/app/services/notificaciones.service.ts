import {
  Injectable,
  OnDestroy,
  computed,
  inject,
  signal,
} from "@angular/core";
import { SwPush } from "@angular/service-worker";
import { Subscription } from "rxjs";
import {
  PUSH_PUBLIC_CONFIG,
  isPushPublicConfigReady,
} from "../../environments/push.config";

export type NotificationCardMode =
  | "hidden"
  | "ios_install_hint"
  | "ask"
  | "enabled"
  | "blocked"
  | "unavailable";

const SNOOZE_STORAGE_KEY = "juan_push_snooze_until_ms";
const ENDPOINT_STORAGE_KEY = "juan_push_endpoint";
const SNOOZE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: "root" })
export class NotificacionesService implements OnDestroy {
  private readonly swPush = inject(SwPush);

  readonly isStandalone = signal<boolean>(false);
  readonly isIos = signal<boolean>(false);
  readonly isSupported = signal<boolean>(false);
  readonly configReady = signal<boolean>(isPushPublicConfigReady());
  readonly unavailableReason = signal<string | null>(null);
  readonly permission = signal<NotificationPermission | "unsupported">(
    "unsupported"
  );
  readonly activeEndpoint = signal<string | null>(null);
  readonly snoozedUntilMs = signal<number>(0);
  readonly busy = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly isSubscribed = computed(
    () =>
      this.activeEndpoint() !== null &&
      this.permission() === "granted" &&
      this.isSupported()
  );

  readonly isSnoozed = computed(() => Date.now() < this.snoozedUntilMs());

  readonly cardMode = computed<NotificationCardMode>(() => {
    if (typeof window === "undefined") return "hidden";

    if (!this.isStandalone()) {
      return this.isIos() ? "ios_install_hint" : "hidden";
    }

    if (!this.configReady() || !this.isSupported()) {
      return this.isSnoozed() ? "hidden" : "unavailable";
    }

    if (this.permission() === "denied") {
      return "blocked";
    }

    if (this.isSubscribed()) {
      return "enabled";
    }

    if (this.isSnoozed()) {
      return "hidden";
    }

    return "ask";
  });

  private standaloneMq: MediaQueryList | null = null;
  private readonly subs = new Subscription();
  private readonly onDisplayModeChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      this.isStandalone.set(true);
    }
  };
  private readonly onAppInstalled = () => {
    this.isStandalone.set(true);
  };

  constructor() {
    if (typeof window !== "undefined") {
      this.detectEnvironment();
      void this.syncCurrentSubscription();
      this.listenToServiceWorkerEvents();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (typeof window !== "undefined") {
      this.standaloneMq?.removeEventListener("change", this.onDisplayModeChange);
      window.removeEventListener("appinstalled", this.onAppInstalled);
    }
  }

  private detectEnvironment(): void {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || "";

    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    this.isIos.set(ios);

    this.standaloneMq = window.matchMedia("(display-mode: standalone)");
    const isPwaDisplay =
      this.standaloneMq.matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      Boolean(nav.standalone);
    this.isStandalone.set(isPwaDisplay);
    this.standaloneMq.addEventListener("change", this.onDisplayModeChange);
    window.addEventListener("appinstalled", this.onAppInstalled);

    const hasNotif = "Notification" in window;
    const hasSw = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const swEnabled = this.swPush.isEnabled;

    const hasApis = hasNotif && hasSw && hasPush && swEnabled;
    this.isSupported.set(hasApis);

    if (!this.configReady()) {
      this.unavailableReason.set(
        "Falta validar la clave pública VAPID, la URL o la clave sb_publishable_ en push.config.ts."
      );
    } else if (!window.isSecureContext) {
      this.unavailableReason.set(
        "Web Push requiere conexión segura HTTPS (usa la URL de GitHub Pages)."
      );
    } else if (!hasNotif || !hasPush || !hasSw) {
      this.unavailableReason.set(
        "Este navegador no expone la API de notificaciones Push (PushManager)."
      );
    } else if (!swEnabled) {
      this.unavailableReason.set(
        "El Service Worker de producción (ngsw-worker.js) no está activo en modo desarrollo; compila para producción o abre la versión publicada en GitHub Pages."
      );
    } else {
      this.unavailableReason.set(null);
    }

    this.permission.set(
      hasNotif ? Notification.permission : "unsupported"
    );

    try {
      const savedSnooze = Number(
        window.localStorage.getItem(SNOOZE_STORAGE_KEY) || "0"
      );
      if (Number.isFinite(savedSnooze) && savedSnooze > 0) {
        this.snoozedUntilMs.set(savedSnooze);
      }
      const savedEndpoint = window.localStorage.getItem(ENDPOINT_STORAGE_KEY);
      if (savedEndpoint) {
        this.activeEndpoint.set(savedEndpoint);
      }
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }

  private listenToServiceWorkerEvents(): void {
    this.subs.add(
      this.swPush.subscription.subscribe((sub) => {
        if (sub) {
          this.activeEndpoint.set(sub.endpoint);
          this.saveEndpointLocally(sub.endpoint);
        } else if (this.permission() !== "granted") {
          this.activeEndpoint.set(null);
          this.saveEndpointLocally(null);
        }
      })
    );

    this.subs.add(
      this.swPush.pushSubscriptionChanges.subscribe(({ oldSubscription, newSubscription }) => {
        if (oldSubscription && (!newSubscription || oldSubscription.endpoint !== newSubscription.endpoint)) {
          void this.deactivateInSupabase(oldSubscription.endpoint);
        }
        if (newSubscription) {
          void this.saveToSupabase(newSubscription);
        }
      })
    );
  }

  private async syncCurrentSubscription(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager?.getSubscription();
      if (existing) {
        this.activeEndpoint.set(existing.endpoint);
        this.saveEndpointLocally(existing.endpoint);
      } else {
        this.activeEndpoint.set(null);
        this.saveEndpointLocally(null);
      }
    } catch {
      // Silencioso si no hay registro aún
    }
  }

  async enableNotifications(): Promise<void> {
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    if (!this.configReady()) {
      this.errorMessage.set(
        "Falta configurar las claves públicas de avisos en la compilación."
      );
      return;
    }

    if (!this.isSupported()) {
      this.errorMessage.set(
        "Este dispositivo o navegador no permite notificaciones Web Push."
      );
      return;
    }

    this.busy.set(true);
    try {
      const sub = await this.swPush.requestSubscription({
        serverPublicKey: PUSH_PUBLIC_CONFIG.vapidPublicKey,
      });

      this.permission.set(
        "Notification" in window ? Notification.permission : "unsupported"
      );

      await this.saveToSupabase(sub);
      this.activeEndpoint.set(sub.endpoint);
      this.saveEndpointLocally(sub.endpoint);
      this.clearSnooze();
      this.feedbackMessage.set(
        "Avisos activados. Recibirás una notificación cuando cambie o suba una lectura nueva."
      );
    } catch (err) {
      if ("Notification" in window) {
        this.permission.set(Notification.permission);
      }
      if (this.permission() === "denied") {
        this.errorMessage.set(
          "El permiso fue bloqueado en el navegador. Puedes reactivarlo desde la configuración del sitio."
        );
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : "No se pudo completar la suscripción a los avisos.";
        this.errorMessage.set(msg);
      }
    } finally {
      this.busy.set(false);
    }
  }

  snoozePrompt(): void {
    const until = Date.now() + SNOOZE_DAYS_MS;
    this.snoozedUntilMs.set(until);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    try {
      window.localStorage.setItem(SNOOZE_STORAGE_KEY, String(until));
    } catch {
      // Ignorar si localStorage falla
    }
  }

  async disableNotifications(): Promise<void> {
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    this.busy.set(true);

    const endpoint = this.activeEndpoint();
    try {
      if (this.swPush.isEnabled) {
        await this.swPush.unsubscribe().catch(() => undefined);
      } else if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        await sub?.unsubscribe().catch(() => undefined);
      }

      if (endpoint) {
        await this.deactivateInSupabase(endpoint);
      }

      this.activeEndpoint.set(null);
      this.saveEndpointLocally(null);
      this.feedbackMessage.set("Avisos desactivados en este dispositivo.");
    } catch {
      this.errorMessage.set(
        "No se pudo desactivar el aviso en el servidor; intenta de nuevo con conexión."
      );
    } finally {
      this.busy.set(false);
    }
  }

  private clearSnooze(): void {
    this.snoozedUntilMs.set(0);
    try {
      window.localStorage.removeItem(SNOOZE_STORAGE_KEY);
    } catch {
      // Ignorar
    }
  }

  private saveEndpointLocally(endpoint: string | null): void {
    try {
      if (endpoint) {
        window.localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
      } else {
        window.localStorage.removeItem(ENDPOINT_STORAGE_KEY);
      }
    } catch {
      // Ignorar
    }
  }

  private async saveToSupabase(sub: PushSubscription): Promise<void> {
    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.["p256dh"];
    const auth = json.keys?.["auth"];

    if (!endpoint || !p256dh || !auth) {
      throw new Error("El navegador generó una suscripción push incompleta.");
    }

    const baseUrl = PUSH_PUBLIC_CONFIG.supabaseUrl.replace(/\/+$/, "");
    const response = await fetch(
      `${baseUrl}/rest/v1/rpc/registrar_suscripcion_push`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: PUSH_PUBLIC_CONFIG.supabasePublishableKey,
        },
        body: JSON.stringify({
          p_endpoint: endpoint,
          p_p256dh: p256dh,
          p_auth: auth,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `No se pudo guardar la suscripción (${response.status}).`
      );
    }
  }

  private async deactivateInSupabase(endpoint: string): Promise<void> {
    if (!this.configReady()) return;
    const baseUrl = PUSH_PUBLIC_CONFIG.supabaseUrl.replace(/\/+$/, "");
    const response = await fetch(
      `${baseUrl}/rest/v1/rpc/desactivar_suscripcion_push`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: PUSH_PUBLIC_CONFIG.supabasePublishableKey,
        },
        body: JSON.stringify({
          p_endpoint: endpoint,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Error al desactivar (${response.status}).`);
    }
  }
}
