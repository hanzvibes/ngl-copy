"use client";

import { useEffect } from "react";

/** Registers /sw.js and captures the PWA install prompt for InstallAppButton. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __nglInstallPrompt?: Event }).__nglInstallPrompt = e;
      window.dispatchEvent(new CustomEvent("ngl:install-ready"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);
  return null;
}
