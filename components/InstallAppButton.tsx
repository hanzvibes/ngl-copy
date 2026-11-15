"use client";

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { tr, type Lang } from "@/lib/i18n";

type InstallPrompt = {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
};

/**
 * Install button for Settings. Three states:
 * - prompt ready (Chrome/Edge): real install button via beforeinstallprompt
 * - already installed (standalone mode): confirmation note
 * - otherwise (e.g. iOS Safari, where no prompt event exists): manual steps
 */
export default function InstallAppButton({ lang }: { lang: Lang }) {
  const t = (key: string) => tr(lang, key);
  const [state, setState] = useState<"hidden" | "ready" | "installed" | "manual">("hidden");

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setState("installed");
      return;
    }
    const w = window as unknown as { __nglInstallPrompt?: InstallPrompt };
    if (w.__nglInstallPrompt) {
      setState("ready");
      return;
    }
    const onReady = () => setState("ready");
    const onInstalled = () => setState("installed");
    window.addEventListener("ngl:install-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    // If no prompt arrives shortly, the browser can't offer one — show manual steps.
    const timer = window.setTimeout(() => setState((s) => (s === "hidden" ? "manual" : s)), 2500);
    return () => {
      window.removeEventListener("ngl:install-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  if (state === "hidden") return null;
  if (state === "installed") {
    return (
      <p className="install-note">
        <Check size={14} /> {t("settings.installed")}
      </p>
    );
  }
  if (state === "manual") return <p className="install-note">{t("settings.installManual")}</p>;
  return (
    <button
      type="button"
      className="secondary-button"
      onClick={async () => {
        const w = window as unknown as { __nglInstallPrompt?: InstallPrompt };
        const p = w.__nglInstallPrompt;
        if (!p) return;
        await p.prompt();
        const choice = await p.userChoice?.catch(() => undefined);
        if (choice?.outcome === "accepted") setState("installed");
      }}
    >
      <Download size={15} /> {t("settings.installBtn")}
    </button>
  );
}
