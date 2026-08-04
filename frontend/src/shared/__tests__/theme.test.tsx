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

describe("Light-only theme", () => {
  beforeEach(() => document.documentElement.removeAttribute("data-theme"));
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("always applies light mode", () => {
    applyThemeToDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("provides light mode without system preference or storage", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(readStoredTheme()).toBe("light");
    expect(resolveTheme()).toBe("light");
  });
});
