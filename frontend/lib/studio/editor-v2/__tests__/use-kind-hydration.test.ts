/**
 * Tests for `useKindHydration` — pins the 3-step lifecycle contract
 * the studio editor's per-kind runtime state depends on:
 *   1. Active + not hydrated + serverState present → hydrate(serverState)
 *   2. Active + not hydrated + serverState absent + seed present → hydrate(seed())
 *   3. Active + not hydrated + serverState absent + no seed → no-op (wait for server)
 *   4. Active + already hydrated → no-op (preserves edits across server round-trips)
 *   5. Not active + was hydrated → unhydrate
 *   6. Not active + not hydrated → no-op
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKindHydration } from "../use-kind-hydration";

interface MockState {
  value: string;
}

describe("useKindHydration", () => {
  it("hydrates from serverState when active + not hydrated + server present", () => {
    const hydrate = vi.fn();
    const unhydrate = vi.fn();
    const seed = vi.fn(() => ({ value: "seed" }));
    renderHook(() =>
      useKindHydration<MockState>({
        active: true,
        hydrated: false,
        serverState: { value: "server" },
        seed,
        hydrate,
        unhydrate,
      }),
    );
    expect(hydrate).toHaveBeenCalledWith({ value: "server" });
    expect(seed).not.toHaveBeenCalled();
    expect(unhydrate).not.toHaveBeenCalled();
  });

  it("falls back to seed() when active + serverState is null", () => {
    const hydrate = vi.fn();
    const seed = vi.fn(() => ({ value: "fresh" }));
    renderHook(() =>
      useKindHydration<MockState>({
        active: true,
        hydrated: false,
        serverState: null,
        seed,
        hydrate,
        unhydrate: vi.fn(),
      }),
    );
    expect(seed).toHaveBeenCalled();
    expect(hydrate).toHaveBeenCalledWith({ value: "fresh" });
  });

  it("waits for server when no seed is supplied (game-runtime pattern)", () => {
    const hydrate = vi.fn();
    const unhydrate = vi.fn();
    renderHook(() =>
      useKindHydration<MockState>({
        active: true,
        hydrated: false,
        serverState: null,
        // no `seed` — caller's first-save pipeline will populate
        // serverState on the next round-trip.
        hydrate,
        unhydrate,
      }),
    );
    expect(hydrate).not.toHaveBeenCalled();
    expect(unhydrate).not.toHaveBeenCalled();
  });

  it("is a no-op when already hydrated (preserves in-flight edits)", () => {
    const hydrate = vi.fn();
    renderHook(() =>
      useKindHydration<MockState>({
        active: true,
        hydrated: true,
        serverState: { value: "server" },
        seed: () => ({ value: "seed" }),
        hydrate,
        unhydrate: vi.fn(),
      }),
    );
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("clears state when active flips false after being hydrated", () => {
    const unhydrate = vi.fn();
    renderHook(() =>
      useKindHydration<MockState>({
        active: false,
        hydrated: true,
        serverState: null,
        seed: () => ({ value: "seed" }),
        hydrate: vi.fn(),
        unhydrate,
      }),
    );
    expect(unhydrate).toHaveBeenCalled();
  });

  it("is a no-op when inactive AND not hydrated (the common non-matching-kind case)", () => {
    const hydrate = vi.fn();
    const unhydrate = vi.fn();
    renderHook(() =>
      useKindHydration<MockState>({
        active: false,
        hydrated: false,
        serverState: null,
        seed: () => ({ value: "seed" }),
        hydrate,
        unhydrate,
      }),
    );
    expect(hydrate).not.toHaveBeenCalled();
    expect(unhydrate).not.toHaveBeenCalled();
  });

  it("re-hydrates when serverState changes (project navigation)", () => {
    const hydrate = vi.fn();
    const { rerender } = renderHook(
      ({ server, hydrated }: { server: MockState | null; hydrated: boolean }) =>
        useKindHydration<MockState>({
          active: true,
          hydrated,
          serverState: server,
          seed: () => ({ value: "seed" }),
          hydrate,
          unhydrate: vi.fn(),
        }),
      { initialProps: { server: { value: "project-a" }, hydrated: false } },
    );
    expect(hydrate).toHaveBeenCalledWith({ value: "project-a" });
    hydrate.mockClear();
    // Caller flips hydrated → true inside its hydrate callback; we
    // simulate that here so the hook sees the hydrated state.
    rerender({ server: { value: "project-a" }, hydrated: true });
    expect(hydrate).not.toHaveBeenCalled();
    // Project navigation flips hydrated → false (caller clears) +
    // server points at the new project.
    rerender({ server: { value: "project-b" }, hydrated: false });
    expect(hydrate).toHaveBeenCalledWith({ value: "project-b" });
  });
});
