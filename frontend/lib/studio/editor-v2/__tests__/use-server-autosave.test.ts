/**
 * Tests for `useServerAutosave` — the v2 Studio editor's debounced, change-
 * detected background save. Pins the contract that work persists on edit but
 * never on open / unchanged content (#2241):
 *   1. First armed pass baselines the seeded state → no save on open.
 *   2. A real content change → one debounced save.
 *   3. Unchanged content (same snapshot) → no save even after the debounce.
 *   4. Disabled (signed-out) / not-ready (loading) → never saves.
 *   5. A manual save in flight (`isSaving`) → autosave defers.
 *   6. Save success flips status to "saved"; failure flips to "error".
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useServerAutosave } from "../use-server-autosave";

const DEBOUNCE = 1000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(initial: {
  enabled?: boolean;
  ready?: boolean;
  snapshot?: string;
  isSaving?: boolean;
  save?: () => Promise<unknown>;
}) {
  const save = initial.save ?? vi.fn(async () => ({ id: "p1" }));
  const props = {
    enabled: initial.enabled ?? true,
    ready: initial.ready ?? true,
    snapshot: initial.snapshot ?? "v0",
    isSaving: initial.isSaving ?? false,
    save,
  };
  const view = renderHook(
    (p: typeof props) =>
      useServerAutosave({
        enabled: p.enabled,
        ready: p.ready,
        debounceMs: DEBOUNCE,
        computeSnapshot: () => p.snapshot,
        isSaving: p.isSaving,
        save: p.save,
        // The snapshot string is the only content dep that should reschedule.
        deps: [p.snapshot],
      }),
    { initialProps: props },
  );
  return { view, save };
}

describe("useServerAutosave", () => {
  it("does not save on open (first armed pass baselines)", () => {
    const { save } = setup({ snapshot: "v0" });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves once after a content change, debounced", async () => {
    const { view, save } = setup({ snapshot: "v0" });
    view.rerender({
      enabled: true,
      ready: true,
      snapshot: "v1",
      isSaving: false,
      save,
    });
    expect(save).not.toHaveBeenCalled(); // still within the debounce window
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe("saved");
  });

  it("does not save when content is unchanged", () => {
    const { view, save } = setup({ snapshot: "v0" });
    // Re-render with the SAME snapshot (e.g. an unrelated parent re-render).
    view.rerender({ enabled: true, ready: true, snapshot: "v0", isSaving: false, save });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("never saves while disabled (signed-out)", () => {
    const { view, save } = setup({ enabled: false, snapshot: "v0" });
    view.rerender({ enabled: false, ready: true, snapshot: "v1", isSaving: false, save });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("never saves while not ready (loading)", () => {
    const { view, save } = setup({ ready: false, snapshot: "v0" });
    view.rerender({ enabled: true, ready: false, snapshot: "v1", isSaving: false, save });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("defers when a manual save is already in flight", () => {
    const { view, save } = setup({ snapshot: "v0" });
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: true, save });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("flips status to error when the save fails", async () => {
    const save = vi.fn(async () => null); // null = save failure
    const { view } = setup({ snapshot: "v0", save });
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: false, save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe("error");
  });
});
