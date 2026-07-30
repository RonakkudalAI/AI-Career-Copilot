import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeBuilder } from "./resume-flow";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("next/navigation", () => ({ useParams: () => ({ resumeId: "resume-1" }) }));

const resume = {
  id: "resume-1",
  title: "Master Resume",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  versions: [{
    id: "version-1",
    resume_id: "resume-1",
    version_number: 1,
    source_type: "uploaded",
    extraction_status: "confirmed",
    structured_content: { sections: { summary: ["Backend engineer"], skills: ["Python, FastAPI"] } },
    created_at: "2026-01-01T00:00:00Z",
  }],
};

function arrange(configured: boolean) {
  mocks.apiRequest.mockImplementation((path: string) => {
    if (path === "/resumes/resume-1") return Promise.resolve(resume);
    if (path === "/job-descriptions") return Promise.resolve([]);
    if (path === "/resume-improvements/capabilities") return Promise.resolve({
      nvidia_configured: configured,
      selected_model: configured ? "configured-model" : null,
      improvement_available: configured,
      export_formats: ["pdf", "docx"],
      manual_editing_available: true,
    });
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("resume builder", () => {
  beforeEach(() => { mocks.apiRequest.mockReset(); });

  it("keeps manual editing and export available when NVIDIA is unavailable", async () => {
    arrange(false);
    render(<ResumeBuilder />);
    expect(await screen.findByRole("heading", { name: "Master Resume" })).toBeVisible();
    expect(screen.getByText(/AI suggestions are unavailable/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Manual Version" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export DOCX" })).toBeEnabled();
  });

  it("generates only through the authenticated API when configured", async () => {
    arrange(true);
    mocks.apiRequest.mockImplementationOnce(() => Promise.resolve(resume))
      .mockImplementationOnce(() => Promise.resolve([]))
      .mockImplementationOnce(() => Promise.resolve({
        nvidia_configured: true,
        selected_model: "configured-model",
        improvement_available: true,
        export_formats: ["pdf", "docx"],
        manual_editing_available: true,
      }))
      .mockResolvedValueOnce({ run: { id: "run-1" }, suggestions: [], message: "No safe improvements were generated from the available evidence." });
    render(<ResumeBuilder />);
    const button = await screen.findByRole("button", { name: "Generate grounded suggestions" });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/resume-improvements", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText(/No safe improvements were generated/i)).toBeVisible();
  });
});
