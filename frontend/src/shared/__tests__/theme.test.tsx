import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, applyThemeToDocument, readStoredTheme, resolveTheme, useTheme } from "../theme";

function ThemeProbe() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
    </>
  );
}

describe("theme preferences", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.removeItem("career-copilot-theme");
  });
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("applies an explicit dark preference", () => {
    applyThemeToDocument("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("defaults to system preference when storage is empty", () => {
    applyThemeToDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("provides a system preference without storage", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(readStoredTheme()).toBe("system");
    expect(resolveTheme()).toBe("light");
  });
});
