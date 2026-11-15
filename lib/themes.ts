// Profile colour themes. One id is stored on ngl_profiles.theme and shared by
// the public page, the dashboard preview and the Story share card, so a theme
// picked once looks the same everywhere. No new dependency: plain CSS colours.
export type ThemeId = "pink" | "purple" | "orange" | "mint" | "midnight";

export const THEME_IDS: ThemeId[] = ["pink", "purple", "orange", "mint", "midnight"];

export const THEMES: Record<
  ThemeId,
  { label: string; gradient: string; bg: string; bg2: string; accent: string }
> = {
  pink: {
    label: "Pink",
    gradient: "linear-gradient(145deg,#ff6b9d,#ffa778)",
    bg: "#ff5b91",
    bg2: "#ff9b6a",
    accent: "#ff6598",
  },
  purple: {
    label: "Purple",
    gradient: "linear-gradient(145deg,#a78bff,#ff6b9d)",
    bg: "#8b7cff",
    bg2: "#ff6b9d",
    accent: "#a78bff",
  },
  orange: {
    label: "Orange",
    gradient: "linear-gradient(145deg,#ffb347,#ff6b6b)",
    bg: "#ff9e4f",
    bg2: "#ff6b6b",
    accent: "#ffab6b",
  },
  mint: {
    label: "Mint",
    gradient: "linear-gradient(145deg,#34d399,#5eead4)",
    bg: "#2fbf8f",
    bg2: "#5eead4",
    accent: "#4ade9d",
  },
  midnight: {
    label: "Midnight",
    gradient: "linear-gradient(145deg,#6366f1,#0ea5e9)",
    bg: "#5b6cff",
    bg2: "#0ea5e9",
    accent: "#7c8cff",
  },
};

export type ThemeDef = { label: string; gradient: string; bg: string; bg2: string; accent: string };

/** A fully custom theme from two hex colours the owner picked. */
export function customTheme(bg: string, bg2: string): ThemeDef {
  return {
    label: "Custom",
    gradient: `linear-gradient(145deg,${bg},${bg2})`,
    bg,
    bg2,
    accent: bg,
  };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value);
}

export function themeOrDefault(value: unknown): ThemeId {
  return isThemeId(value) ? value : "pink";
}
