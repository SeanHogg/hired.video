/**
 * Mount once globally (in App.tsx next to other root-level providers).
 * Polls the points summary and fires a full-screen CELEBRATION for each
 * newly-earned badge — both first-time earns and repeatable re-earns
 * (e.g. rebuilt 7-day streak → another "On Fire", now with its ×N
 * multiplier). Detection lives here; the party lives in
 * [CelebrationOverlay](../points/CelebrationOverlay.tsx) via the shared
 * [celebration bus](../../lib/points/celebration.ts) so this stays the
 * single "what's newly earned?" diff.
 *
 * Self-gates on eligibility so the poll is a no-op for non-scoring
 * roles. Stores the last-seen earn-count map in `localStorage` keyed by
 * user id so the first load after sign-in doesn't spam the user with
 * historical earns.
 */

import { usePointsSummary } from "@/hooks/use-points-summary";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  isPointsEligible,
  type PointsBadge,
} from "@/lib/services/points-service";
import { BADGE_REFRESH_EVENT } from "@/lib/badges/refresh";
import { celebrate } from "@/lib/points/celebration";

const STORAGE_KEY_PREFIX = "hv.badge-earn-snapshot:";
const POLL_MS = 60_000;

type EarnSnapshot = Record<string, number>;

function loadSnapshot(userId: string): EarnSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    return raw ? (JSON.parse(raw) as EarnSnapshot) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(userId: string, snap: EarnSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(snap));
  } catch {
    /* storage full / privacy mode */
  }
}

function badgesToSnapshot(badges: PointsBadge[]): EarnSnapshot {
  const snap: EarnSnapshot = {};
  for (const b of badges) snap[b.id] = b.earnCount;
  return snap;
}

export function BadgeUnlockToaster() {
  const { user } = useAuth();
  const eligible = isPointsEligible(user);
  const userId = user?.id ?? null;
  const seenRef = useRef<EarnSnapshot | null>(null);

  const { data, refetch } = usePointsSummary(eligible && !!userId, {
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  // #1568 — listen for the cross-surface "I just earned something"
  // event so badge toasts surface within the same render cycle as the
  // completion dialog instead of lagging up to 60s on the poll tick.
  useEffect(() => {
    if (!eligible || !userId) return;
    const handler = () => { void refetch(); };
    window.addEventListener(BADGE_REFRESH_EVENT, handler);
    return () => window.removeEventListener(BADGE_REFRESH_EVENT, handler);
  }, [eligible, userId, refetch]);

  useEffect(() => {
    if (!userId || !data) return;
    const next = badgesToSnapshot(data.badges);
    const prev = seenRef.current ?? loadSnapshot(userId);

    if (prev) {
      // Diff: any badge whose count went up celebrates. For repeatable
      // re-earns we fire once with the NEW total so the streak shows its
      // ×N multiplier rather than N identical pop-ups.
      for (const b of data.badges) {
        const prevCount = prev[b.id] ?? 0;
        const newCount = next[b.id] ?? 0;
        if (newCount > prevCount) celebrateBadge(b, newCount);
      }
    }

    seenRef.current = next;
    saveSnapshot(userId, next);
  }, [data, userId]);

  return null;
}

/** A streak milestone badge (on_fire / streak_*) is a repeatable flame —
 *  surface it as a "streak" celebration so the overlay renders the ×N
 *  multiplier. Everything else is a plain badge unlock. */
function isStreakBadge(badge: PointsBadge): boolean {
  return badge.iconKey === "flame" || badge.slug === "on_fire" || badge.slug.startsWith("streak_");
}

function celebrateBadge(badge: PointsBadge, earnCount: number) {
  celebrate({
    kind: isStreakBadge(badge) ? "streak" : "badge",
    title: badge.name,
    description: badge.description,
    iconKey: badge.iconKey,
    tier: badge.tier,
    badgeId: badge.id,
    earnCount,
  });
}
