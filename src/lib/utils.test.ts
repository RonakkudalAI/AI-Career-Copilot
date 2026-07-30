import { describe, expect, it } from "vitest";
import { completionScore, isValidCareerFile } from "./utils";

describe("career utilities", () => {
  it("calculates profile completion from present values", () => {
    expect(completionScore(["Aarav", "", "SQL", null])).toBe(50);
  });

  it("accepts supported resume formats under 10 MB", () => {
    expect(isValidCareerFile({ name: "resume.PDF", size: 1024 })).toBe(true);
    expect(isValidCareerFile({ name: "resume.docx", size: 10 * 1024 * 1024 })).toBe(true);
  });

  it("rejects unsupported or oversized files", () => {
    expect(isValidCareerFile({ name: "resume.txt", size: 1024 })).toBe(false);
    expect(isValidCareerFile({ name: "resume.pdf", size: 11 * 1024 * 1024 })).toBe(false);
  });
});
