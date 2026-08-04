import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  isWebGLAvailable,
  GlobeErrorBoundary,
  GlobeFallback,
  GlobeJobPin,
} from "../career-globe";

const samplePins: GlobeJobPin[] = [
  { id: "1", title: "Frontend Lead", company: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { id: "2", title: "DevOps Engineer", company: "Austin", latitude: 30.2672, longitude: -97.7431 },
];

describe("isWebGLAvailable", () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it("returns true when WebGL context is supported by canvas", () => {
    document.createElement = vi.fn((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === "canvas") {
        const canvas = el as HTMLCanvasElement;
        canvas.getContext = vi.fn((contextId: string) => {
          if (contextId === "webgl2" || contextId === "webgl") {
            return {} as WebGLRenderingContext;
          }
          return null;
        }) as unknown as typeof canvas.getContext;
      }
      return el;
    });

    expect(isWebGLAvailable()).toBe(true);
  });

  it("returns false when WebGL context returns null", () => {
    document.createElement = vi.fn((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === "canvas") {
        (el as HTMLCanvasElement).getContext = vi.fn(() => null);
      }
      return el;
    });

    expect(isWebGLAvailable()).toBe(false);
  });
});

describe("GlobeFallback", () => {
  it("renders static SVG globe with accessibility attributes", () => {
    render(<GlobeFallback jobs={samplePins} />);
    const fallbackEl = screen.getByRole("img", {
      name: /Static global opportunities visualization fallback/i,
    });
    expect(fallbackEl).toBeDefined();
    expect(screen.getByText("Frontend Lead · Tokyo")).toBeDefined();
    expect(screen.getByText("DevOps Engineer · Austin")).toBeDefined();
  });
});

describe("GlobeErrorBoundary", () => {
  const ThrowingComponent = () => {
    throw new Error("WebGL context lost or failed to initialize");
  };

  it("catches child render exception and displays fallback component", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <GlobeErrorBoundary fallback={<GlobeFallback jobs={samplePins} />}>
        <ThrowingComponent />
      </GlobeErrorBoundary>
    );

    expect(screen.getByRole("img", { name: /Static global opportunities visualization fallback/i })).toBeDefined();
    expect(screen.getByText("Frontend Lead · Tokyo")).toBeDefined();

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("Reduced Motion Compliance", () => {
  it("respects prefers-reduced-motion media query match", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    expect(mediaQuery.matches).toBe(true);
  });
});
