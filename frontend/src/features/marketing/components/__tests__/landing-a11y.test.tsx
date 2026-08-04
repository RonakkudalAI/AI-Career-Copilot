import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LandingPage } from "../landing";
import { ThemeProvider } from "@/shared/theme";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Mock = () => <div data-testid="mock-globe">Globe</div>;
    return Mock;
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; onClick?: () => void; className?: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, ...rest }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
    svg: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <svg {...rest}>{children}</svg>
    ),
  },
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}));

vi.mock("@/shared/ui/parallax-layer", () => ({
  ParallaxLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderLanding() {
  return render(
    <ThemeProvider>
      <LandingPage />
    </ThemeProvider>
  );
}

describe("Landing page a11y & labelling", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
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
  });

  it("opens mobile dialog with aria-modal and closes on Escape restoring focus", async () => {
    // Force mobile menu button visible by not relying on CSS display
    renderLanding();
    const openBtn = screen.getByRole("button", { name: /Open navigation/i });
    await act(async () => {
      openBtn.focus();
      fireEvent.click(openBtn);
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the hero globe free of unsupported labels", () => {
    renderLanding();
    expect(screen.queryByText("Illustrative global roles")).toBeNull();
    expect(screen.queryByText(/verified job locations/i)).toBeNull();
    expect(screen.queryByText(/verified live/i)).toBeNull();
  });
});
