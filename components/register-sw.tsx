"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds only, so dev reloads stay fresh. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus; the game works without it.
    });
  }, []);
  return null;
}
