/**
 * Smoke render test for <LocationFilterButton/> — the action-bar entry that
 * replaced the in-body "LOCATION" card on Jobs / Companies (+ any future
 * search surface). Verifies the button surfaces its label and visually marks
 * itself "active" when a filter is set, so the user can tell the popover
 * holds something without opening it.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LocationFilterButton from "@/components/location/LocationFilterButton";

describe("LocationFilterButton", () => {
  it("renders a button labelled 'Location' when the filter is empty", () => {
    render(<LocationFilterButton value={{}} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: /location filter/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toMatch(/Location/);
  });

  it("uses the default outline variant when no filter is set", () => {
    render(<LocationFilterButton value={{}} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: /location filter/i });
    // The shadcn outline variant is the empty state — the active state flips
    // to the primary "default" variant, which we assert in the active test.
    expect(button.className).not.toMatch(/bg-primary\b/);
  });

  it("marks the button active when text is set", () => {
    render(
      <LocationFilterButton
        value={{ text: "San Francisco, CA" }}
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /location filter/i });
    expect(button.className).toMatch(/bg-primary/);
  });

  it("marks the button active when only a structured id is set", () => {
    render(
      <LocationFilterButton value={{ cityId: "ct-sf" }} onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /location filter/i });
    expect(button.className).toMatch(/bg-primary/);
  });

  it("marks the button active when only the remote toggle is set", () => {
    render(<LocationFilterButton value={{ remote: true }} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: /location filter/i });
    expect(button.className).toMatch(/bg-primary/);
  });

  it("treats remote=false (on-site only) as an active filter, not 'unset'", () => {
    render(
      <LocationFilterButton value={{ remote: false }} onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /location filter/i });
    expect(button.className).toMatch(/bg-primary/);
  });
});
