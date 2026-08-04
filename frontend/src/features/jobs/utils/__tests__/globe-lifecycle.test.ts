import { describe, it, expect } from "vitest";
import { calculatePinLifecycle } from "../globe-lifecycle";

describe("calculatePinLifecycle (FE-001)", () => {
  it("repeats via modulo so pins reappear after a full cycle", () => {
    const first = calculatePinLifecycle(1.0, 0, 6.0, 4.0);
    const secondCycle = calculatePinLifecycle(1.0 + 6.0, 0, 6.0, 4.0);
    expect(secondCycle.t).toBeCloseTo(first.t, 5);
    expect(secondCycle.opacity).toBeCloseTo(first.opacity, 5);
    expect(secondCycle.labelVisible).toBe(first.labelVisible);
  });

  it("keeps opacity in [0, 1] across a dense sample of the cycle", () => {
    for (let t = 0; t <= 12; t += 0.25) {
      const state = calculatePinLifecycle(t, 0.3, 6.0, 4.0);
      expect(state.opacity).toBeGreaterThanOrEqual(0);
      expect(state.opacity).toBeLessThanOrEqual(1);
      expect(state.t).toBeGreaterThanOrEqual(0);
      expect(state.t).toBeLessThan(6.0);
    }
  });

  it("shows label only when opacity is high", () => {
    const hold = calculatePinLifecycle(1.0, 0, 6.0, 4.0);
    expect(hold.labelVisible).toBe(true);
    const dormant = calculatePinLifecycle(5.0, 0, 6.0, 4.0);
    expect(dormant.labelVisible).toBe(false);
  });
});
