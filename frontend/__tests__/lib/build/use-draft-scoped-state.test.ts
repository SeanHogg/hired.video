/**
 * useDraftScopedState — the kit's per-draft state (chat, tool runs, plan
 * checkmarks, stage, dismissed findings): comes back after a reload of the
 * same résumé, starts over for a new draft, is written once an unsaved
 * draft gets its row, and never leaks one résumé's state into another's.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDraftScopedState } from "@/lib/build/use-draft-scoped-state";

const RESUME_A = "a6032907-ce37-4339-a886-b5e22dbbd32c";
const RESUME_B = "5d1c0b8e-2f4a-4e7b-9c3d-1a2b3c4d5e6f";
const EMPTY: string[] = [];
const revive = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
const persist = (v: string[]) => v.filter((x) => x !== "running");
const key = (id: string) => `hv:build:session:v1:${id}:log`;

function useLog(draftKey: unknown, resumeId: string | null) {
  return useDraftScopedState({ draftKey, resumeId, slice: "log", empty: EMPTY, revive, persist });
}

beforeEach(() => localStorage.clear());

describe("useDraftScopedState", () => {
  it("restores what a saved résumé had after a reload", () => {
    const first = renderHook(() => useLog("draft-1", RESUME_A));
    act(() => first.result.current.set(["scored"]));
    first.unmount();

    const reloaded = renderHook(() => useLog({ kind: "existing" }, RESUME_A));
    expect(reloaded.result.current.value).toEqual(["scored"]);
  });

  it("keeps only what `persist` keeps", () => {
    const { result } = renderHook(() => useLog("draft-1", RESUME_A));
    act(() => result.current.set(["scored", "running"]));
    expect(JSON.parse(localStorage.getItem(key(RESUME_A)) ?? "null")).toEqual(["scored"]);
    expect(result.current.value).toEqual(["scored", "running"]);
  });

  it("re-adopting the same résumé (a new draft identity) restores it", () => {
    const { result, rerender } = renderHook(({ draft }) => useLog(draft, RESUME_A), { initialProps: { draft: {} as object } });
    act(() => result.current.set(["scored"]));
    rerender({ draft: {} });
    expect(result.current.value).toEqual(["scored"]);
  });

  it("starts over for a new unsaved draft", () => {
    const { result, rerender } = renderHook(({ draft, id }) => useLog(draft, id), {
      initialProps: { draft: "draft-1" as unknown, id: RESUME_A as string | null },
    });
    act(() => result.current.set(["scored"]));
    rerender({ draft: "draft-2", id: null });
    expect(result.current.value).toEqual([]);
  });

  it("writes an unsaved draft's state once it gets its row", () => {
    const { result, rerender } = renderHook(({ id }) => useLog("draft-1", id), {
      initialProps: { id: null as string | null },
    });
    act(() => result.current.set(["asked"]));
    expect(localStorage.length).toBe(0);
    rerender({ id: RESUME_A });
    expect(result.current.value).toEqual(["asked"]);
    expect(JSON.parse(localStorage.getItem(key(RESUME_A)) ?? "null")).toEqual(["asked"]);
  });

  it("never writes one résumé's state under another's id", () => {
    localStorage.setItem(key(RESUME_B), JSON.stringify(["b's own"]));
    const { result, rerender } = renderHook(({ draft, id }) => useLog(draft, id), {
      initialProps: { draft: "draft-a" as unknown, id: RESUME_A },
    });
    act(() => result.current.set(["a's"]));
    rerender({ draft: "draft-b", id: RESUME_B });
    expect(result.current.value).toEqual(["b's own"]);
    expect(JSON.parse(localStorage.getItem(key(RESUME_B)) ?? "null")).toEqual(["b's own"]);
    expect(JSON.parse(localStorage.getItem(key(RESUME_A)) ?? "null")).toEqual(["a's"]);
  });

  it("ignores stored values that don't revive", () => {
    localStorage.setItem(key(RESUME_A), JSON.stringify({ not: "a list" }));
    const { result } = renderHook(() => useLog("draft-1", RESUME_A));
    expect(result.current.value).toEqual([]);
  });
});
