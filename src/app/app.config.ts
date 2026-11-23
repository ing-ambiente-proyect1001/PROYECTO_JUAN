import {
  ApplicationConfig,
  isDevMode,
  provideZoneChangeDetection,
} from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideServiceWorker } from "@angular/service-worker";

function shouldEnableServiceWorker(): boolean {
  if (isDevMode() || typeof window === "undefined") {
    return false;
  }
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return false;
  }
  try {
    if (window.self !== window.top) {
      return false;
    }
  } catch {
    return false;
  }
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith(".run.app")) {
    return false;
  }
  return true;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideServiceWorker("ngsw-worker.js", {
      enabled: shouldEnableServiceWorker(),
      registrationStrategy: "registerWhenStable:5000",
    }),
  ],
};
