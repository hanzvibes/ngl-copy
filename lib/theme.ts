// Light/dark theme, persisted in localStorage. The <html> element carries
// data-theme="light"; the default (no value) is the original dark look.
// app/layout.tsx inlines a tiny script that applies the saved value before
// first paint, so there is no dark flash on reload.
export type ThemeMode = "dark" | "light";

export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem("ngl-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function setThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem("ngl-theme", mode);
  } catch {
    // Private mode: theme just won't persist.
  }
  document.documentElement.dataset.theme = mode === "light" ? "light" : "";
  if (mode === "dark") delete document.documentElement.dataset.theme;
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = getThemeMode() === "light" ? "dark" : "light";
  setThemeMode(next);
  return next;
}
