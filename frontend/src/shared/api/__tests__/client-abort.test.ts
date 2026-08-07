import { describe, expect, it } from "vitest";
import { isAbortError } from "@/shared/api/client";

describe("isAbortError", () => {
  it("detects DOMException AbortError", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("detects plain Error with AbortError name", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it("rejects network and generic errors", () => {
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAbortError(new Error("Could not reach the API"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("abort")).toBe(false);
  });
});
