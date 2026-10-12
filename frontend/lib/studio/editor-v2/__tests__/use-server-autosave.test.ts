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
 *   7. A failed save retries in the background; a blocked one runs once the
 *      manual save finishes; hiding the tab flushes a pending write.
 *   8. Multi-tab (#2242): a save refused as stale (409 STALE_REVISION) or
 *      another tab saving the same document pauses autosave with a conflict;
 *      "keep mine" overwrites. Offline failures go to the offline queue and
 *      are retried the moment the browser is back online.
 *   9. maxWaitMs writes during non-stop edits; initialBaseline null saves a
 *      restored draft; unmount flushes; rebaseline adopts a saved state.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Cross-tab channel + offline queue are module singletons: replace them with
// spies so a test can play "the other tab" and inspect queued writes.
const channel = vi.hoisted(() => ({
  announced: [] as string[],
  listeners: new Map<string, () => void>(),
}));
vi.mock("@/lib/autosave/autosave-channel", () => ({
  announceAutosave: (key: string) => channel.announced.push(key),
  onRemoteAutosave: (key: string, cb: () => void) => {
    channel.listeners.set(key, cb);
    return () => channel.listeners.delete(key);
  },
}));
const queue = vi.hoisted(() => ({
  enqueue: vi.fn(async (_w: unknown) => {}),
  remove: vi.fn(async (_k: string) => {}),
  claim: vi.fn((_k: string) => () => {}),
  flush: vi.fn(async () => 0),
}));
vi.mock("@/lib/autosave/offline-save-queue", () => ({
  offlineSaveQueue: queue,
  isOfflineFailure: () => typeof navigator !== "undefined" && navigator.onLine === false,
}));

import { useServerAutosave } from "../use-server-autosave";
import { hasUnsavedWork } from "@/hooks/use-unsaved-work";

const DEBOUNCE = 1000;

beforeEach(() => {
  vi.useFakeTimers();
  channel.announced.length = 0;
  channel.listeners.clear();
  queue.enqueue.mockClear();
  queue.remove.mockClear();
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
  it("retries a failed save in the background without waiting for another edit", async () => {
    const save = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(null) // first attempt fails
      .mockResolvedValue({ id: "p1" });
    const { view } = setup({ snapshot: "v0", save });
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: false, save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(view.result.current.status).toBe("error");
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe("saved");
  });

  it("saves once the manual save that blocked it has finished", async () => {
    const { view, save } = setup({ snapshot: "v0" });
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: true, save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).not.toHaveBeenCalled();
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: false, save });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending write when the tab is hidden", async () => {
    const { view, save } = setup({ snapshot: "v0" });
    view.rerender({ enabled: true, ready: true, snapshot: "v1", isSaving: false, save });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

/** A save the server refused because another tab saved first. */
function staleError() {
  return Object.assign(new Error("Stale"), { context: { serverCode: "STALE_REVISION" } });
}

const DOC_KEY = "studio:6b1f9a52-1c0e-4c1e-9a55-0d6f3b2e8c41";

interface KeyedProps {
  snapshot: string;
  save: () => Promise<unknown>;
  overwrite?: () => Promise<unknown>;
}

function setupKeyed(initial: KeyedProps, extra: { maxWaitMs?: number; initialBaseline?: string | null } = {}) {
  return renderHook(
    (p: KeyedProps) =>
      useServerAutosave({
        enabled: true,
        ready: true,
        debounceMs: DEBOUNCE,
        computeSnapshot: () => p.snapshot,
        isSaving: false,
        save: p.save,
        overwrite: p.overwrite,
        deps: [p.snapshot],
        documentKey: DOC_KEY,
        offlineWrite: () => ({ method: "POST", path: "/api/studio/save-draft", body: { name: p.snapshot } }),
        ...extra,
      }),
    { initialProps: initial },
  );
}

describe("useServerAutosave — never lose work across tabs (#2242)", () => {
  it("a stale write (409) pauses autosave with a conflict; keep mine overwrites", async () => {
    const save = vi.fn(async () => {
      throw staleError();
    });
    const overwrite = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save, overwrite });
    view.rerender({ snapshot: "v1", save, overwrite });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(view.result.current.status).toBe("conflict");
    expect(view.result.current.conflict).toBe("stale");
    expect(hasUnsavedWork()).toBe(true);

    // Further edits do not write while the user hasn't chosen.
    view.rerender({ snapshot: "v2", save, overwrite });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE * 3);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.result.current.keepMine();
    });
    expect(overwrite).toHaveBeenCalledTimes(1);
    expect(view.result.current.conflict).toBeNull();
    expect(view.result.current.status).toBe("saved");
    expect(hasUnsavedWork()).toBe(false);
  });

  it("another tab saving the same document raises a remote conflict", async () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save });
    const otherTabSaved = channel.listeners.get(DOC_KEY);
    expect(otherTabSaved).toBeDefined();
    act(() => otherTabSaved?.());
    expect(view.result.current.conflict).toBe("remote");
    view.rerender({ snapshot: "v1", save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(save).not.toHaveBeenCalled();
    act(() => view.result.current.dismissConflict());
    expect(view.result.current.conflict).toBeNull();
  });

  it("announces a successful save to the other tabs and clears its queued write", async () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save });
    view.rerender({ snapshot: "v1", save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(channel.announced).toEqual([DOC_KEY]);
    expect(queue.remove).toHaveBeenCalledWith(DOC_KEY);
  });

  it("queues an offline failure and retries as soon as the browser is back online", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const save = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ id: "p1" });
    const view = setupKeyed({ snapshot: "v0", save });
    view.rerender({ snapshot: "v1", save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(view.result.current.status).toBe("error");
    expect(queue.enqueue).toHaveBeenCalledWith({
      key: DOC_KEY,
      method: "POST",
      path: "/api/studio/save-draft",
      body: { name: "v1" },
    });
    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(save).toHaveBeenCalledTimes(2); // well before the 5 s backoff
    expect(view.result.current.status).toBe("saved");
    online.mockRestore();
  });
});

describe("useServerAutosave — cadence and baselines", () => {
  it("maxWaitMs writes during non-stop edits", async () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save }, { maxWaitMs: DEBOUNCE * 2 });
    for (let i = 1; i <= 6; i++) {
      view.rerender({ snapshot: `v${i}`, save });
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE / 2);
      });
    }
    expect(save).toHaveBeenCalled();
  });

  it("initialBaseline null saves a restored draft on the first pass", async () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    setupKeyed({ snapshot: "restored", save }, { initialBaseline: null });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending write on unmount", () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save });
    view.rerender({ snapshot: "v1", save });
    view.unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rebaseline makes the given snapshot the saved state", async () => {
    const save = vi.fn(async () => ({ id: "p1" }));
    const view = setupKeyed({ snapshot: "v0", save });
    act(() => view.result.current.rebaseline("v1"));
    view.rerender({ snapshot: "v1", save });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
