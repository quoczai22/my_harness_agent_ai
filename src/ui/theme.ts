export const THEME_STORAGE_KEY = "harness-atlas-theme-v1";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function readThemePreference(storage?: Pick<Storage, "getItem">): ThemePreference {
  if (!storage) return "system";
  try {
    return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}
