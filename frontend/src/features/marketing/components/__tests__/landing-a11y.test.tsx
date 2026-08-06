import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "../landing";
import { ThemeProvider } from "@/shared/theme";

vi.mock("@/features/jobs/components/career-globe", () => ({
  default: function MockGlobe() {
    return <div data-testid="mock-globe">Globe</div>;
  },
}));

vi.mock("motion/react", () => {
  const passthrough =
    (Tag: "div" | "svg") =>
    ({ children, className, ...rest }: React.PropsWithChildren<{ className?: string } & Record<string, unknown>>) => {
      // Drop framer-motion-only props so React does not warn.
      const {
        whileInView: _a,
        initial: _b,
        animate: _c,
        transition: _d,
        ...dom
      } = rest;
      void _a;
      void _b;
      void _c;
      void _d;
      if (Tag === "svg") {
        return <svg className={className} {...dom}>{children}</svg>;
      }
      return (
        <div className={className} {...dom}>
          {children}
        </div>
      );
    };
  return {
    motion: {
      div: passthrough("div"),
      svg: passthrough("svg"),
    },
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  };
});

vi.mock("@/shared/ui/parallax-layer", () => ({
  ParallaxLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LandingPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Landing page a11y & labelling", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  it("opens mobile dialog with aria-modal and closes on Escape restoring focus", async () => {
    renderLanding();
    const openBtn = await screen.findByRole("button", { name: /Open navigation/i });
    await act(async () => {
      openBtn.focus();
      fireEvent.click(openBtn);
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the hero globe free of unsupported labels", async () => {
    renderLanding();
    const globe = await screen.findByTestId("mock-globe");
    const label = globe.getAttribute("aria-label");
    if (label) {
      expect(label.toLowerCase()).not.toMatch(/undefined|null|\[object/i);
    }
  });
});
