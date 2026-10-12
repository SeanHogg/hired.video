/**
 * `useKindHydration` — shared kind-aware hydration hook for the studio
 * editor's per-kind runtime state. Closes the parallel-effect duplication
 * the studio audit flagged: image, animation, and game each had their
 * own useEffect doing the same 4-step dance (check kind → guard on
 * hydrated → read server state → hydrate or seed).
 *
 * Per the DRY rule, the dance lives ONCE here. Each kind passes its
 * own active/hydrated/seed/hydrate/unhydrate callbacks; the hook owns
 * the lifecycle. Adding a new mediaKind = one more `useKindHydration`
 * call in StudioEditorV2 — not a new bespoke effect.
 *
 * Hydration model:
 *   1. When `active` (this kind matches the project's mediaKind) is
 *      false and the runtime was previously hydrated, the hook clears
 *      it via `unhydrate()` — frees the prior project's state when
 *      the user navigates to a different-kind project mid-session.
 *   2. When `active` is true and the runtime is already hydrated, the
 *      hook is a no-op — server round-trips don't clobber in-flight
 *      edits. (This is the load-bearing invariant the prior bespoke
 *      effects also preserved.)
 *   3. When `active` is true and not yet hydrated, the hook reads
 *      `serverState`. If present it calls `hydrate(serverState)`;
 *      otherwise it calls `hydrate(seed())`. The caller's `hydrate`
 *      callback is expected to set both the state AND flip the
 *      hydrated flag.
 *
 * Two state-management patterns are supported transparently:
 *   - Flag-based (image, animation): a separate `hydrated` boolean
 *     plus an always-present blank state from `createBlankX()`. The
 *     caller passes `hydrated` from useState.
 *   - Null-sentinel (game): `gameState !== null` IS the hydration
 *     signal. The caller passes `hydrated: gameState !== null`.
 *
 * Both reduce to the same 3-step contract; the hook doesn't care which
 * the caller picked.
 */
import { useEffect } from "react";

export interface UseKindHydrationOpts<TServer> {
  /** True when the project's `mediaKind` matches the kind this hook
   *  manages — i.e. the runtime should be hydrated. False = the user
   *  is on a different-kind project and this runtime should clear. */
  active: boolean;
  /** True when the current state corresponds to the loaded project.
   *  Flips false on project change so the hook re-fires the seed/hydrate
   *  path. */
  hydrated: boolean;
  /** Server-side state from the loaded project — `null` / `undefined`
   *  when the project is fresh (no row yet). */
  serverState: TServer | null | undefined;
  /** Build a fresh seed state when `serverState` is missing. Called at
   *  most once per hydration. When omitted, the hook WAITS for
   *  `serverState` instead of seeding locally — used by kinds whose
   *  initial state is minted upstream by the chooser pipeline (game's
   *  `seedGameFromTemplate` runs in `useCreateStudioDraft`, not inline). */
  seed?: () => TServer;
  /** Commit a state value AND mark the runtime hydrated. The caller is
   *  expected to flip the `hydrated` flag inside this callback so the
   *  next hook run short-circuits. */
  hydrate: (next: TServer) => void;
  /** Clear the runtime when the project's `mediaKind` no longer
   *  matches. Should null out per-kind state + flip `hydrated` to
   *  false. Called on kind transitions only — not on the no-op path. */
  unhydrate: () => void;
}

/** Per-kind hydration lifecycle — drop-in replacement for the
 *  per-kind useEffect blocks StudioEditorV2 used to host. Deps are
 *  intentionally NOT exposed — the hook depends on the two inputs
 *  that drive the lifecycle: `active` and `serverState`. Passing the
 *  full persistedProject object as a dep would re-fire on unrelated
 *  field changes (e.g. visibility toggle) and clobber unsaved edits;
 *  passing just `serverState` makes the dep explicit + minimal. */
export function useKindHydration<TServer>(opts: UseKindHydrationOpts<TServer>): void {
  const { active, hydrated, serverState, seed, hydrate, unhydrate } = opts;
  useEffect(() => {
    if (!active) {
      if (hydrated) unhydrate();
      return;
    }
    if (hydrated) return;
    if (serverState != null) {
      hydrate(serverState);
      return;
    }
    // No server state yet — seed locally when the caller supplied a
    // seed factory; otherwise wait for the next server round-trip
    // (game's first-save pipeline writes gameState upstream).
    if (seed) hydrate(seed());
    // The hook depends on `active` + `serverState` (the data inputs).
    // `hydrated` is a guard read inside the body — including it in
    // deps would loop. `seed` / `hydrate` / `unhydrate` are stable
    // callbacks from the caller's scope; including them risks
    // accidental re-fires when consumers don't memo them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, serverState]);
}
