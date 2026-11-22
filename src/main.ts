import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, appConfig)
  .then(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            const url = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? "";
            if (url.endsWith("/sw.js")) {
              void reg.unregister();
            }
          }
        })
        .catch(() => undefined);
    }
  })
  .catch((err) => console.error(err));
