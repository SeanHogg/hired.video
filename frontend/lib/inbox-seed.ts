/**
 * Inbox seed cache — handoff slot between the /api/bootstrap aggregate
 * and the CommHub consumers (gap #1368).
 *
 * Bootstrap writes the unfiltered inbox payload here once on mount;
 * `useCommHub` reads it on first render so the hub paints from memory
 * instead of waiting for its own /api/inbox round-trip. The slot has a
 * short TTL so a slow user-navigation (e.g. multi-minute idle, then click
 * /outreach) doesn't render a stale snapshot.
 *
 * The shape is intentionally `unknown`-typed at this layer — both producer
 * (bootstrap-service) and consumer (use-comm-hub) cast to their local
 * `InboxResponse` interface. Keeping the seed module typeless avoids a
 * circular import between `lib/` and `hooks/`.
 */

// 60 s — long enough to cover sign-in → first page render even on a slow
// connection, short enough that revisiting a route after a coffee break
// triggers a real fetch.
const SEED_TTL_MS = 60_000;

interface SeedSlot {
  payload: unknown;
  receivedAt: number;
}

let slot: SeedSlot | null = null;

/** Producer side — called from bootstrap-service after a successful
 *  /api/bootstrap response. Stores the payload and broadcasts a
 *  window event so any already-mounted consumer can hydrate live. */
export function setInboxSeed(payload: unknown): void {
  slot = { payload, receivedAt: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("inbox:hydrate", { detail: payload }),
    );
  }
}

/** Consumer side — called by `useCommHub` on mount. Returns the seed
 *  if it's still fresh, otherwise null. Does NOT clear the slot; the
 *  TTL is what bounds staleness. Re-mounts within the TTL still get
 *  the same payload, which is fine because the polling cycle will
 *  replace it within `POLL_INTERVAL_MS`. */
export function consumeInboxSeed(): unknown | null {
  if (!slot) return null;
  if (Date.now() - slot.receivedAt > SEED_TTL_MS) {
    slot = null;
    return null;
  }
  return slot.payload;
}

/** Explicit clear — used by logout flows so the next signed-in user
 *  doesn't briefly see the previous user's inbox. */
export function clearInboxSeed(): void {
  slot = null;
}
