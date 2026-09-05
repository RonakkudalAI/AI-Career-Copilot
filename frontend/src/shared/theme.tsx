import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
  resolvedTheme: ResolvedTheme;
};

const STORAGE_KEY = "career-copilot-theme";
const DEFAULT_THEME_VALUE: ThemeContextValue = {
  theme: "light",
  setTheme: () => undefined,
  cycleTheme: () => undefined,
  resolvedTheme: "light",
};

export const ThemeContext = createContext(DEFAULT_THEME_VALUE);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(theme: ThemePreference = readStoredTheme()): ResolvedTheme {
  return theme;
}

export function applyThemeToDocument(theme: ThemePreference = readStoredTheme()): void {
  if (typeof document !== "undefined") {
    const resolved = resolveTheme(theme);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
  }
}

function subscribeToThemeChanges(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  const onThemeChange = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener("career-copilot:theme-change", onThemeChange);
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("career-copilot:theme-change", onThemeChange);
    media?.removeEventListener?.("change", onChange);
  };
}

function storeTheme(theme: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The document still updates when storage is unavailable.
  }
  applyThemeToDocument(theme);
  window.dispatchEvent(new Event("career-copilot:theme-change"));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const getServerTheme = (): ThemePreference => "light";
  const theme = useSyncExternalStore(subscribeToThemeChanges, readStoredTheme, getServerTheme);
  const resolvedTheme = resolveTheme(theme);
  useEffect(() => applyThemeToDocument(theme), [theme]);
  const setTheme = useCallback((nextTheme: ThemePreference) => storeTheme(nextTheme), []);
  const cycleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
  }, [setTheme, theme]);
  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme, resolvedTheme }),
    [cycleTheme, resolvedTheme, setTheme, theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
