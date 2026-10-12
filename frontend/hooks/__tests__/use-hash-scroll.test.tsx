import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { scrollToHash, useHashScroll } from "../use-hash-scroll";

let navigateRef: ReturnType<typeof useNavigate> | null = null;

function Harness() {
  useHashScroll();
  navigateRef = useNavigate();
  return <section id="watch">wall</section>;
}

describe("scrollToHash", () => {
  let spy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    spy = vi.fn();
    Element.prototype.scrollIntoView = spy as unknown as Element["scrollIntoView"];
    document.body.innerHTML = '<div id="how-it-works"></div>';
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls the matching element and reports success", () => {
    expect(scrollToHash("#how-it-works", "smooth")).toBe(true);
    expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("returns false for a missing target or an empty hash", () => {
    expect(scrollToHash("#nope", "auto")).toBe(false);
    expect(scrollToHash("#", "auto")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useHashScroll", () => {
  let spy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    spy = vi.fn();
    Element.prototype.scrollIntoView = spy as unknown as Element["scrollIntoView"];
    navigateRef = null;
  });

  it("jumps (no animation) to the section when the page loads with a hash", () => {
    render(
      <MemoryRouter initialEntries={["/#watch"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(spy).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("smooth-scrolls when a hash link is followed on the same page", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(spy).not.toHaveBeenCalled();
    act(() => navigateRef?.("/#watch"));
    expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("scrolls again when the same hash link is clicked twice", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Harness />
      </MemoryRouter>,
    );
    act(() => navigateRef?.("/#watch"));
    act(() => navigateRef?.("/#watch"));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
