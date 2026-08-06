import { describe, it, expect } from "vitest";
import { isWebGLAvailable, projectGlobePoint } from "../globe-utils";

describe("globe-utils (cobe projection helpers)", () => {
  it("projects equator/prime meridian to a finite screen point", () => {
    const point = projectGlobePoint(0, 0, 0, 0);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(typeof point.visible).toBe("boolean");
    expect(Number.isFinite(point.depth)).toBe(true);
  });

  it("keeps depth/visibility stable for the same inputs", () => {
    const a = projectGlobePoint(12.97, 77.59, 0.3, 0.1);
    const b = projectGlobePoint(12.97, 77.59, 0.3, 0.1);
    expect(a).toEqual(b);
  });

  it("reports WebGL availability without throwing", () => {
    expect(typeof isWebGLAvailable()).toBe("boolean");
  });
});
