"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker in production builds only, so dev reloads stay fresh.
 * New versions land by themselves (Sky kept seeing old builds on the phone): it checks for an update whenever
 * the game comes back to the front, and when a new version takes over, the page reloads once to use it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        registration = r;
        void r.update();
      })
      .catch(() => {
        // Offline support is a bonus; the game works without it.
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
