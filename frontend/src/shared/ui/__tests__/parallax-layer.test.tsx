import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ParallaxLayer } from "../parallax-layer";

describe("ParallaxLayer pending-frame guard", () => {
  let rafQueue: FrameRequestCallback[];
  let rafId: number;

  beforeEach(() => {
    rafQueue = [];
    rafId = 1;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        rafQueue.push(cb);
        return rafId++;
      })
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        void id;
      })
    );
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
    // Layout geometry so the layer is considered visible
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("schedules at most one animation frame while scroll events stack", () => {
    render(
      <ParallaxLayer speed={0.5}>
        <span>content</span>
      </ParallaxLayer>
    );

    // Initial handleScroll from mount may queue one frame
    const initialQueued = rafQueue.length;
    expect(initialQueued).toBeLessThanOrEqual(1);

    // Stack many scroll events before the frame runs
    act(() => {
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new Event("scroll"));
      }
    });

    // Guard: still only one pending frame beyond what already flushed
    expect(rafQueue.length).toBeLessThanOrEqual(1);

    // Flush the pending frame, then fire more scrolls → one more schedule
    act(() => {
      const cbs = [...rafQueue];
      rafQueue.length = 0;
      cbs.forEach((cb) => cb(0));
    });

    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });

    expect(rafQueue.length).toBe(1);
  });
});
