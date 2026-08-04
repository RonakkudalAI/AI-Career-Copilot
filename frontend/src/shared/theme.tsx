"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ThemePreference = "light";

type LightThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
  resolvedTheme: ThemePreference;
};

const LIGHT_THEME_VALUE: LightThemeContextValue = {
  theme: "light",
  setTheme: () => undefined,
  cycleTheme: () => undefined,
  resolvedTheme: "light",
};

const LightThemeContext = createContext(LIGHT_THEME_VALUE);

export function applyThemeToDocument(): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", "light");
  }
}

export function readStoredTheme(): ThemePreference {
  return "light";
}

export function resolveTheme(): ThemePreference {
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <LightThemeContext.Provider value={LIGHT_THEME_VALUE}>{children}</LightThemeContext.Provider>;
}

export function useTheme(): LightThemeContextValue {
  return useContext(LightThemeContext);
}
