import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CareerJourney } from "../sections/career-journey";

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => {
      const safe = { ...rest };
      delete safe.initial;
      delete safe.whileInView;
      delete safe.viewport;
      delete safe.transition;
      delete safe.style;
      return (
        <div className={className as string | undefined} {...safe}>
          {children}
        </div>
      );
    },
  },
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}));

vi.mock("@/shared/ui/parallax-layer", () => ({
  ParallaxLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("CareerJourney (FE-005)", () => {
  it("renders stage cards with stable data attributes and classes (not motion.div selectors)", () => {
    const { container } = render(<CareerJourney />);
    const cards = container.querySelectorAll("[data-journey-card]");
    expect(cards.length).toBe(6);
    cards.forEach((card) => {
      expect(card.classList.contains("journey-stage-card")).toBe(true);
    });
    const rows = container.querySelectorAll(".journey-stage-row[data-side]");
    expect(rows.length).toBe(6);
    expect(container.querySelector(".journey-progress-line")).toBeTruthy();
  });
});
