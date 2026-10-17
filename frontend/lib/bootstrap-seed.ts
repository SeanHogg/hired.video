/**
 * Bootstrap seed slots — the handoff between the /api/bootstrap aggregate
 * and the `useGatedResource` consumers (inbox, token budget, subscription).
 * React Query consumers are seeded directly via `queryClient.setQueryData`.
 *
 * Bootstrap writes each slice once; the consuming hook reads it on mount
 * through its `seedFn` and skips its own first round-trip. Slots carry a
 * short TTL so a much-later mount fetches fresh instead of painting a stale
 * snapshot. Typeless at this layer (producer + consumer cast) so `lib/`
 * never imports from `hooks/`.
 */

export type BootstrapSeedKey = "inbox" | "tokenBudget" | "subscription";

// 60 s — covers sign-in → first page render even on a slow connection.
const SEED_TTL_MS = 60_000;

interface SeedSlot {
  payload: unknown;
  receivedAt: number;
}

const slots = new Map<BootstrapSeedKey, SeedSlot>();

/** Producer side (bootstrap-service). The inbox slice also broadcasts
 *  `inbox:hydrate` so an already-mounted hub adopts it live. */
export function setBootstrapSeed(key: BootstrapSeedKey, payload: unknown): void {
  slots.set(key, { payload, receivedAt: Date.now() });
  if (key === "inbox" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("inbox:hydrate", { detail: payload }));
  }
}

/** Consumer side — the seed while fresh, else null. Not cleared on read:
 *  sibling consumers mounting within the TTL share it. */
export function readBootstrapSeed<T>(key: BootstrapSeedKey): T | null {
  const slot = slots.get(key);
  if (!slot) return null;
  if (Date.now() - slot.receivedAt > SEED_TTL_MS) {
    slots.delete(key);
    return null;
  }
  return slot.payload as T;
}

/** Logout / account switch — the next viewer must never see these. */
export function clearBootstrapSeeds(): void {
  slots.clear();
}
