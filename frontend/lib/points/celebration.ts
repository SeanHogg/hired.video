/**
 * Celebration bus — the SSoT for "the user just earned something worth a
 * party". One place fans an earn event out to:
 *
 *   • [CelebrationOverlay](../../components/points/CelebrationOverlay.tsx)
 *     plays the full-screen burst, then shrinks the artwork into the
 *     badge gallery.
 *   • [BadgesGallery](../../components/badges/BadgesGallery.tsx) reads the
 *     glow set so a freshly-earned badge throbs once the artwork lands.
 *
 * Detection lives in [BadgeUnlockToaster](../../components/badges/BadgeUnlockToaster.tsx)
 * (the points-summary poll/diff) and in the redeem flow; both call
 * `celebrate()`. Keeping the bus separate from detection means any future
 * earn surface can fire a celebration without re-implementing the diff —
 * same rationale as [signalBadgeRefresh](../badges/refresh.ts).
 *
 * Plain module-level pub/sub (no extra dependency) — `subscribeGlow` /
 * `getGlowSnapshot` are shaped for `useSyncExternalStore`.
 */

import type { BadgeTier } from "@/components/badges/BadgeIcon";

export interface CelebrationPayload {
  /** Unique per fire so the overlay can key its queue. */
  id: string;
  kind: "badge" | "streak" | "reward";
  title: string;
  description?: string;
  iconKey?: string | null;
  tier?: BadgeTier;
  /** Badge row id — drives the post-celebration gallery throb + the
   *  shrink-into-gallery target. Absent for redemption ("reward") fires. */
  badgeId?: string;
  /** Times this repeatable badge has now been earned — rendered as the
   *  "×N" streak multiplier on streak celebrations. */
  earnCount?: number;
}

type CelebrationListener = (c: CelebrationPayload) => void;
const celebrationListeners = new Set<CelebrationListener>();

/** Fire a celebration. `id` is derived when omitted. */
export function celebrate(input: Omit<CelebrationPayload, "id"> & { id?: string }): void {
  const id =
    input.id ??
    `${input.badgeId ?? input.kind}:${input.earnCount ?? ""}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  const payload: CelebrationPayload = { ...input, id };
  for (const l of celebrationListeners) l(payload);
}

export function onCelebrate(listener: CelebrationListener): () => void {
  celebrationListeners.add(listener);
  return () => celebrationListeners.delete(listener);
}

// ── Glow set (freshly-earned badges throb in the gallery) ─────────────

let glowing: ReadonlySet<string> = new Set();
const glowListeners = new Set<() => void>();

function emitGlow(): void {
  for (const l of glowListeners) l();
}

/** Mark a badge as freshly earned so the gallery throbs it, then clear
 *  after `ms`. Replacing the Set (not mutating) keeps the snapshot
 *  reference-stable for `useSyncExternalStore`. */
export function markBadgeGlowing(badgeId: string, ms = 15_000): void {
  const next = new Set(glowing);
  next.add(badgeId);
  glowing = next;
  emitGlow();
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      const after = new Set(glowing);
      after.delete(badgeId);
      glowing = after;
      emitGlow();
    }, ms);
  }
}

export function subscribeGlow(listener: () => void): () => void {
  glowListeners.add(listener);
  return () => glowListeners.delete(listener);
}

export function getGlowSnapshot(): ReadonlySet<string> {
  return glowing;
}

// ── Shrink-into-gallery target ────────────────────────────────────────

let targetGetter: (() => DOMRect | null) | null = null;

/** The badge gallery registers a getter for its on-screen rect so the
 *  celebration overlay knows where to fly the artwork. Returns an
 *  unregister fn. Last mount wins (only one gallery is visible at a time). */
export function registerCelebrationTarget(getter: () => DOMRect | null): () => void {
  targetGetter = getter;
  return () => {
    if (targetGetter === getter) targetGetter = null;
  };
}

export function getCelebrationTargetRect(): DOMRect | null {
  return targetGetter?.() ?? null;
}
