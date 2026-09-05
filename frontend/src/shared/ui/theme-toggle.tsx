import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/shared/theme";
import { AnimatedIcon } from "@/components/ui/animated-icon";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const label = theme === "light" ? "Theme: light. Switch to dark mode." : "Theme: dark. Switch to light mode.";
  const Icon = resolvedTheme === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " theme-toggle-compact" : ""}`}
      onClick={cycleTheme}
      aria-label={label}
      title={label}
    >
      <AnimatedIcon icon={Icon} size={17} aria-hidden />
      {!compact && <span>{theme === "light" ? "Light" : "Dark"}</span>}
    </button>
  );
}
