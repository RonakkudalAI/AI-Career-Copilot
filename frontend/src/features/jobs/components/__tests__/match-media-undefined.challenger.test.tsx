import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, renderHook } from "@testing-library/react";
import CareerGlobe, { usePrefersReducedMotion } from "../career-globe";
import { ParallaxLayer } from "../../../../shared/ui/parallax-layer";
import { LandingPage } from "../../../marketing/components/landing";
import { ThemeProvider } from "@/shared/theme";

// Mock IntersectionObserver for JSDOM environment
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly scrollMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(private callback: IntersectionObserverCallback) {}
  observe = vi.fn((target: Element) => {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

// Mock Three.js / R3F Canvas components
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, ariaLabel }: { children: React.ReactNode; ariaLabel?: string }) => (
    <div data-testid="r3f-canvas" aria-label={ariaLabel}>
      {children}
    </div>
  ),
  useFrame: vi.fn(),
  useLoader: vi.fn(() => ({
    clone: () => ({ colorSpace: "", anisotropy: 1, needsUpdate: false }),
  })),
}));

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrbitControls: () => <div data-testid="orbit-controls" />,
}));

vi.mock("three", () => ({
  Vector3: class {
    constructor(public x = 0, public y = 0, public z = 0) {}
    copy() { return this; }
    add() { return this; }
    clone() { return this; }
    normalize() { return this; }
    multiplyScalar() { return this; }
  },
  TextureLoader: class {},
  SRGBColorSpace: "srgb",
  BackSide: 2,
}));

describe("Empirical Challenge: Component Rendering when window.matchMedia is undefined", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Explicitly set window.matchMedia to undefined simulating bare JSDOM / Node environments
    Object.defineProperty(window, "matchMedia", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    window.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("ensures window.matchMedia is undefined in test context", () => {
    expect(window.matchMedia).toBeUndefined();
  });

  it("usePrefersReducedMotion safely returns false when window.matchMedia is undefined", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("renders ParallaxLayer without throwing when window.matchMedia is undefined", () => {
    expect(() => {
      render(
        <ParallaxLayer speed={0.5}>
          <div>Parallax Content</div>
        </ParallaxLayer>
      );
    }).not.toThrow();

    expect(screen.getByText("Parallax Content")).toBeDefined();
  });

  it("renders CareerGlobe without throwing when window.matchMedia is undefined", async () => {
    expect(() => {
      render(<CareerGlobe />);
    }).not.toThrow();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify it renders loading/canvas or fallback without throwing error
    expect(screen.queryByTestId("r3f-canvas") || screen.queryByRole("img")).not.toBeNull();
  });

  it("renders LandingPage cleanly when window.matchMedia is undefined", async () => {
    expect(() => {
      render(
        <ThemeProvider>
          <LandingPage />
        </ThemeProvider>
      );
    }).not.toThrow();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(
      screen.getByRole("heading", {
        name: /Navigate your career with evidence, not guesswork./i,
      })
    ).toBeDefined();
  });
});
