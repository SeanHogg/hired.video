/**
 * The ONE inspector pattern (A2 boards): rows `Label <small>hint</small> ›`;
 * Simple shows the simple rows, Advanced APPENDS the advanced ones (the
 * simple rows never move); a row opens its drill in place, and the slot
 * header names the drill under the inspector's title with ‹ back. The open
 * drill belongs to its subject and closes when it stops showing.
 */
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import type { TFunction } from "i18next";
import { defineDrills, drillIdsAt, isDrillShown } from "../inspector-drills";
import InspectorRows from "../InspectorRows";
import InspectorBody, { drillSlotHeader } from "../InspectorBody";
import { useInspectorDrill } from "../use-inspector-drill";
import { notBlank, useFieldDraft } from "../use-field-draft";

interface Ctx {
  count: number;
  set: boolean;
}

function DrillA({ count }: Ctx) {
  return <p>view a · {count}</p>;
}
function DrillB() {
  return <p>view b</p>;
}

// Unknown keys render as themselves (the test catalogue doesn't hold them).
const REGISTRY = defineDrills<"a" | "b" | "c", Ctx>(["a", "b", "c"], {
  a: { labelKey: "test.row.a", depth: "simple", hint: ({ count }) => `${count} found`, View: DrillA },
  b: { labelKey: "test.row.b", depth: "simple", View: DrillB },
  c: { labelKey: "test.row.c", depth: "advanced", tagKey: "test.tag", isSet: ({ set }) => set, View: DrillB },
});
const CTX: Ctx = { count: 3, set: true };
const fakeT = ((key: string) => `t:${key}`) as unknown as TFunction;

describe("inspector drill registry", () => {
  it("splits rows by depth, in order", () => {
    expect(drillIdsAt(REGISTRY, "simple")).toEqual(["a", "b"]);
    expect(drillIdsAt(REGISTRY, "advanced")).toEqual(["c"]);
  });

  it("never shows an advanced row under Simple", () => {
    expect(isDrillShown(REGISTRY, "a", false)).toBe(true);
    expect(isDrillShown(REGISTRY, "c", false)).toBe(false);
    expect(isDrillShown(REGISTRY, "c", true)).toBe(true);
  });
});

describe("InspectorRows", () => {
  it("Simple: the simple rows with their hints, no advanced row", () => {
    render(<InspectorRows registry={REGISTRY} ctx={CTX} advanced={false} onOpen={() => {}} label="This line" />);
    const nav = screen.getByRole("navigation", { name: "This line" });
    const rows = within(nav).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual(["test.row.a3 found", "test.row.b"]);
    expect(screen.queryByText("test.row.c")).toBeNull();
  });

  it("Advanced appends its rows after the simple ones, with tag and changed dot", () => {
    render(<InspectorRows registry={REGISTRY} ctx={CTX} advanced onOpen={() => {}} label="This line" />);
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("test.row.a");
    expect(rows[2].textContent).toContain("test.row.c");
    expect(rows[2].textContent).toContain("test.tag");
    expect(within(rows[2]).getByRole("img")).toBeTruthy();
  });

  it("a row opens its drill", () => {
    const onOpen = vi.fn();
    render(<InspectorRows registry={REGISTRY} ctx={CTX} advanced onOpen={onOpen} label="Rows" />);
    fireEvent.click(screen.getByRole("button", { name: /test\.row\.c/ }));
    expect(onOpen).toHaveBeenCalledWith("c");
  });
});

describe("InspectorBody", () => {
  it("shows the rows, framed by before / after", () => {
    render(<InspectorBody registry={REGISTRY} ctx={CTX} advanced={false} drill={null} onOpen={() => {}} label="Rows" before={<p>note</p>} />);
    expect(screen.getByText("note")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Rows" })).toBeTruthy();
  });

  it("an open drill replaces the rows with its view, given the context", () => {
    render(<InspectorBody registry={REGISTRY} ctx={CTX} advanced={false} drill="a" onOpen={() => {}} label="Rows" before={<p>note</p>} />);
    expect(screen.getByText("view a · 3")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("note")).toBeNull();
  });
});

describe("drillSlotHeader", () => {
  it("rows: the inspector's kicker and title, no back", () => {
    expect(drillSlotHeader({ t: fakeT, registry: REGISTRY, drill: null, onBack: () => {}, kicker: "This line", title: "Experience · CIO" })).toEqual({
      kicker: "This line",
      title: "Experience · CIO",
    });
  });

  it("drill: its label under the inspector's title, with ‹ back", () => {
    const onBack = vi.fn();
    const header = drillSlotHeader({ t: fakeT, registry: REGISTRY, drill: "b", onBack, kicker: "This line", title: "Experience · CIO" });
    expect(header).toMatchObject({ kicker: "Experience · CIO", title: "t:test.row.b" });
    header.onBack?.();
    expect(onBack).toHaveBeenCalled();
  });
});

describe("useInspectorDrill", () => {
  it("opens and goes back", () => {
    const { result } = renderHook(() => useInspectorDrill(REGISTRY, "line-1", false));
    act(() => result.current.open("a"));
    expect(result.current.drill).toBe("a");
    act(() => result.current.back());
    expect(result.current.drill).toBeNull();
  });

  it("belongs to its subject: another subject shows the rows", () => {
    const { result, rerender } = renderHook(({ subject }) => useInspectorDrill(REGISTRY, subject, true), { initialProps: { subject: "hook" } });
    act(() => result.current.open("c"));
    expect(result.current.drill).toBe("c");
    rerender({ subject: "proof" });
    expect(result.current.drill).toBeNull();
  });

  it("an advanced drill closes when the depth goes back to Simple", () => {
    const { result, rerender } = renderHook(({ advanced }) => useInspectorDrill(REGISTRY, "s", advanced), { initialProps: { advanced: true } });
    act(() => result.current.open("c"));
    rerender({ advanced: false });
    expect(result.current.drill).toBeNull();
  });
});

describe("useFieldDraft", () => {
  const change = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;

  it("can be cleared while typing, commits only valid text, and blur puts back the last valid value", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldDraft("Dear team,", commit));
    act(() => result.current.onChange(change("")));
    expect(result.current.value).toBe("");
    expect(commit).not.toHaveBeenCalled();
    act(() => result.current.onChange(change("Hello")));
    expect(commit).toHaveBeenCalledWith("Hello");
    act(() => result.current.onChange(change("   ")));
    act(() => result.current.onBlur());
    expect(result.current.value).toBe("Dear team,");
  });

  it("notBlank rejects whitespace", () => {
    expect(notBlank("  ")).toBe(false);
    expect(notBlank(" a ")).toBe(true);
  });
});
