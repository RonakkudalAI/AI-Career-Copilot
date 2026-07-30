import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, Progress } from "./primitives";

describe("UI primitives", () => {
  it("supports disabled button states", () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Continue</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("exposes progress semantics", () => {
    render(<Progress value={78} label="ATS alignment" />);
    expect(screen.getByRole("progressbar", { name: "ATS alignment" })).toHaveAttribute("aria-valuenow", "78");
  });
});
