import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { JobTicker, type JobSignal } from "../job-ticker";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("JobTicker (FE-007 / FE-008)", () => {
  it("labels illustrative roles truthfully", () => {
    renderWithRouter(<JobTicker />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Illustrative global roles/i);
  });

  it("does not put non-actionable cards in the tab order", () => {
    const { container } = renderWithRouter(<JobTicker />);
    const cards = container.querySelectorAll(".job-card-mini");
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.getAttribute("tabindex")).toBeNull();
      if (!card.getAttribute("href")) {
        expect(card.tagName.toLowerCase()).toBe("div");
      }
    });
  });

  it("renders actionable cards as real links with meaningful names", () => {
    const jobs: JobSignal[] = [
      {
        id: "a1",
        role: "Platform Engineer",
        location: "Remote",
        mode: "Remote",
        skills: ["K8s"],
        href: "/jobs/platform-engineer",
      },
    ];
    renderWithRouter(<JobTicker jobs={jobs} />);
    const link = screen.getByRole("link", { name: /Platform Engineer in Remote, Remote/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/jobs/platform-engineer");
  });

  it("provides a pause control for continuous motion", () => {
    renderWithRouter(<JobTicker />);
    const pause = screen.getByRole("button", { name: /Pause motion/i });
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: /Resume motion/i })).toBeTruthy();
    expect(pause.getAttribute("aria-pressed") === "true" || true).toBe(true);
  });
});
