"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "theme";
const validThemes = new Set<Theme>(["light", "dark", "system"]);

function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved && validThemes.has(saved as Theme) ? (saved as Theme) : "system";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("career-copilot-theme-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("career-copilot-theme-change", onStoreChange);
  };
}

function getServerTheme(): Theme {
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);

  useEffect(() => {
    if (!mounted) return;

    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme, mounted]);

  // Handle system theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  if (!mounted) {
    return (
      <button className="icon-button" aria-label="Toggle theme" style={{ visibility: "hidden" }}>
        <Sun size={19} />
      </button>
    );
  }

  const cycleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    window.localStorage.setItem(THEME_KEY, nextTheme);
    window.dispatchEvent(new Event("career-copilot-theme-change"));
  };

  const getIcon = () => {
    if (theme === "light") return <Sun size={19} />;
    if (theme === "dark") return <Moon size={19} />;
    return <Monitor size={19} />;
  };

  return (
    <button className="icon-button" onClick={cycleTheme} aria-label={`Current theme: ${theme}. Click to toggle.`}>
      {getIcon()}
    </button>
  );
}
