import { createContext, useContext } from "react";

export type ThemePreference = "light";

export type LightThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
  resolvedTheme: "light";
};

const DEFAULT_THEME_VALUE: LightThemeContextValue = {
  theme: "light",
  setTheme: () => undefined,
  cycleTheme: () => undefined,
  resolvedTheme: "light",
};

export const ThemeContext = createContext(DEFAULT_THEME_VALUE);

export function readStoredTheme(): ThemePreference {
  return "light";
}

export function applyThemeToDocument(theme: ThemePreference = readStoredTheme()): void {
  void theme;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
  }
}

export function resolveTheme(_theme: ThemePreference = readStoredTheme()): "light" {
  void _theme;
  return "light";
}

export function useTheme(): LightThemeContextValue {
  return useContext(ThemeContext);
}
