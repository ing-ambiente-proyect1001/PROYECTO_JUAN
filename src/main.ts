import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, appConfig)
  .then(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          let removedLegacy = false;
          for (const reg of registrations) {
            const url = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? "";
            if (url.endsWith("/sw.js")) {
              const ok = await reg.unregister().catch(() => false);
              if (ok) removedLegacy = true;
            }
          }
          if (removedLegacy && "caches" in window) {
            const keys = await caches.keys().catch(() => [] as string[]);
            await Promise.all(
              keys
                .filter((k) => k.startsWith("juan-pwa-"))
                .map((k) => caches.delete(k))
            );
            const guardKey = "juan_sw_migrated_v1";
            if (!window.sessionStorage.getItem(guardKey)) {
              window.sessionStorage.setItem(guardKey, "1");
              window.location.reload();
            }
          }
        })
        .catch(() => undefined);
    }
  })
  .catch((err) => console.error(err));
