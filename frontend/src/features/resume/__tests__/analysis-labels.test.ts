import { describe, expect, it } from "vitest";
import { jdLabel, resumeLabel } from "../analysis-labels";

describe("resumeLabel", () => {
  it("shows filename and version from enriched payload", () => {
    expect(
      resumeLabel({
        resume: {
          title: "My Resume",
          original_filename: "cv.pdf",
          version_number: 2,
          unavailable: false,
        },
      }),
    ).toBe("cv.pdf · v2");
  });

  it("does not claim unavailable when nested resume is missing but version id exists", () => {
    const label = resumeLabel({ resume_version_id: "abcdef12-9999" });
    expect(label.toLowerCase()).not.toBe("resume unavailable");
    expect(label).toMatch(/resume version/i);
  });

  it("marks deleted/unavailable resumes while keeping the filename", () => {
    expect(
      resumeLabel({
        resume: {
          original_filename: "old.pdf",
          version_number: 1,
          unavailable: true,
        },
      }),
    ).toBe("old.pdf · v1 (unavailable)");
  });
});

describe("jdLabel", () => {
  it("shows title and company from enriched payload", () => {
    expect(
      jdLabel({
        job_description: {
          title: "Backend Engineer",
          company: "Acme",
          input_type: "text",
          unavailable: false,
        },
      }),
    ).toBe("Backend Engineer · Acme · text");
  });

  it("falls back when job block is missing", () => {
    expect(jdLabel({ job_description_id: "job-12345678" })).toMatch(/job description/i);
  });
});
