import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/shared/theme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const label = theme === "system"
    ? `Theme: system (${resolvedTheme}). Switch to light mode.`
    : theme === "light"
      ? "Theme: light. Switch to dark mode."
      : "Theme: dark. Switch to system mode.";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " theme-toggle-compact" : ""}`}
      onClick={cycleTheme}
      aria-label={label}
      title={label}
    >
      <Icon size={17} aria-hidden />
      {!compact && <span>{theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}</span>}
    </button>
  );
}
