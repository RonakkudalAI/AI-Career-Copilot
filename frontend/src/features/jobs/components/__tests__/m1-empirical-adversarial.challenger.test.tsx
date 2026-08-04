import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, renderHook } from "@testing-library/react";
import CareerGlobe, {
  calculatePinLifecycle,
  isWebGLAvailable,
  usePrefersReducedMotion,
} from "../career-globe";

// Mock IntersectionObserver
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
  Canvas: ({
    children,
    frameloop,
    ...rest
  }: {
    children: React.ReactNode;
    frameloop?: string;
    "aria-label"?: string;
    "data-testid"?: string;
  }) => (
    <div
      data-testid={rest["data-testid"] ?? "r3f-canvas"}
      data-frameloop={frameloop}
      aria-label={rest["aria-label"]}
    >
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

describe("M1 Empirical Adversarial Stress Test Suite", () => {
  const originalCreateElement = document.createElement.bind(document);
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    window.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe("1. Globe Pin Modulo Lifecycle Mathematical Rigor", () => {
    it("handles large elapsed timestamps (t = 86400s / 24 hours) without precision decay or NaN", () => {
      const state = calculatePinLifecycle(86400.0, 0, 6.0, 4.0);
      expect(state.t).toBeCloseTo(0, 5);
      expect(state.opacity).toBe(0);
      expect(state.offset).toBeCloseTo(-0.1, 5);
      expect(Number.isNaN(state.emissiveIntensity)).toBe(false);
    });

    it("handles negative stagger offset differences cleanly via double modulo wrap", () => {
      // elapsed = 1.0, staggerOffset = 3.5 -> rawTime = -2.5
      // -2.5 % 6.0 = -2.5; + 6.0 = 3.5; % 6.0 = 3.5
      const state = calculatePinLifecycle(1.0, 3.5, 6.0, 4.0);
      expect(state.t).toBeCloseTo(3.5, 5);
      expect(state.opacity).toBeGreaterThanOrEqual(0);
      expect(state.opacity).toBeLessThanOrEqual(1);
    });

    it("verifies smooth opacity transition thresholds (fadeIn, hold, fadeOut, dormant)", () => {
      // 1. Fade-in start (t = 0.1s)
      const stateFadeIn = calculatePinLifecycle(0.1, 0, 6.0, 4.0);
      expect(stateFadeIn.opacity).toBeCloseTo(0.2, 5);
      expect(stateFadeIn.labelVisible).toBe(false);

      // 2. Full opacity & label visible (t = 1.0s)
      const stateHold = calculatePinLifecycle(1.0, 0, 6.0, 4.0);
      expect(stateHold.opacity).toBe(1.0);
      expect(stateHold.labelVisible).toBe(true);

      // 3. Fade-out (t = 3.8s)
      const stateFadeOut = calculatePinLifecycle(3.8, 0, 6.0, 4.0);
      expect(stateFadeOut.opacity).toBeCloseTo(0.4, 5);
      expect(stateFadeOut.labelVisible).toBe(false);

      // 4. Dormant (t = 4.5s)
      const stateDormant = calculatePinLifecycle(4.5, 0, 6.0, 4.0);
      expect(stateDormant.opacity).toBe(0);
      expect(stateDormant.labelVisible).toBe(false);
    });

    it("ensures emissive intensity stays bounded in [0.13, 0.43] during hold phase", () => {
      for (let t = 0.5; t <= 3.5; t += 0.1) {
        const state = calculatePinLifecycle(t, 0, 6.0, 4.0);
        expect(state.emissiveIntensity).toBeGreaterThanOrEqual(0.13);
        expect(state.emissiveIntensity).toBeLessThanOrEqual(0.43);
      }
    });
  });

  describe("2. WebGL Fallback & Context Loss Failure Modes", () => {
    it("handles WebGL detection when document.createElement throws unexpected error", () => {
      document.createElement = vi.fn((tagName: string) => {
        if (tagName === "canvas") throw new Error("DOM Exception: Canvas creation forbidden");
        return originalCreateElement(tagName);
      });

      expect(isWebGLAvailable()).toBe(false);
    });

    it("switches frameloop to 'demand' when component is scrolled off-screen", async () => {
      let observerCallback: IntersectionObserverCallback | null = null;
      class MockObserver {
        observe = vi.fn((target: Element) => {
          // Fire initial intersecting callback so observer wiring is exercised
          observerCallback?.(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
        });
        unobserve = vi.fn();
        disconnect = vi.fn();
        constructor(cb: IntersectionObserverCallback) {
          observerCallback = cb;
        }
      }
      window.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver;

      // Ensure WebGL detection succeeds so the Canvas path is rendered
      const mockGetContext = vi.fn((ctx: string) => {
        if (ctx === "webgl2" || ctx === "webgl" || ctx === "experimental-webgl") {
          return {} as WebGLRenderingContext;
        }
        return null;
      });
      document.createElement = vi.fn((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === "canvas") {
          Object.defineProperty(el, "getContext", {
            configurable: true,
            value: mockGetContext,
          });
        }
        return el;
      }) as typeof document.createElement;

      await act(async () => {
        render(<CareerGlobe />);
      });

      // rAF is sync in beforeEach; flush React state for webGLSupported
      await act(async () => {
        await Promise.resolve();
      });

      const canvas = await screen.findByTestId("r3f-canvas");
      expect(canvas.getAttribute("data-frameloop")).toBe("always");

      await act(async () => {
        observerCallback?.(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
      expect(screen.getByTestId("r3f-canvas").getAttribute("data-frameloop")).toBe("demand");

      await act(async () => {
        observerCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
      expect(screen.getByTestId("r3f-canvas").getAttribute("data-frameloop")).toBe("always");
    });
  });

  describe("3. Undefined window.matchMedia Robustness", () => {
    it("handles window.matchMedia being null or undefined without throwing error", async () => {
      Object.defineProperty(window, "matchMedia", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => usePrefersReducedMotion());
      expect(result.current).toBe(false);

      expect(() => {
        render(<CareerGlobe />);
      }).not.toThrow();
    });

    it("handles window.matchMedia returning object without addEventListener or addListener", () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
      })) as unknown as typeof window.matchMedia;

      expect(() => {
        renderHook(() => usePrefersReducedMotion());
      }).not.toThrow();
    });
  });
});
