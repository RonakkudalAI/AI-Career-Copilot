import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewAnalysis } from "./resume-flow";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

describe("new ATS upload flow", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.push.mockReset();
    // Initial recovery fetch for resumes + job descriptions
    mocks.apiRequest.mockImplementation((path: string) => {
      if (path === "/resumes") return Promise.resolve([]);
      if (path === "/job-descriptions") return Promise.resolve([]);
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it("stores a pasted job description through the API", async () => {
    mocks.apiRequest.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/resumes") return Promise.resolve([]);
      if (path === "/job-descriptions" && !init) return Promise.resolve([]);
      if (path === "/job-descriptions" && init?.method === "POST") {
        return Promise.resolve({
          id: "jd-1",
          title: "Evidence Engineer",
          role_title: "Evidence Engineer",
          company: null,
          extraction_status: "review_required",
          structured_content: { sections: { requirements: ["Python", "SQL"] } },
          raw_text: "Evidence Engineer role requiring Python, SQL, accessibility, and secure data persistence.",
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<NewAnalysis />);
    fireEvent.change(await screen.findByLabelText("Paste text"), {
      target: {
        value: "Evidence Engineer role requiring Python, SQL, accessibility, and secure data persistence.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Store job description" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        "/job-descriptions",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText(/Detected role: Evidence Engineer/i)).toBeVisible();
  });

  it("shows upload steps and disabled proceed until both inputs exist", async () => {
    render(<NewAnalysis />);
    expect(await screen.findByRole("heading", { name: "1. Upload resume" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. Upload job description" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Proceed" })).toBeDisabled();
  });
});
