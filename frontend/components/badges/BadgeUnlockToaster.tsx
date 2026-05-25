/**
 * Mount once globally (in App.tsx next to other root-level providers).
 * Polls the points summary and fires a toast for each newly-earned
 * badge — both first-time earns and repeatable re-earns (e.g. rebuilt
 * 7-day streak → another "On Fire" toast).
 *
 * Self-gates on eligibility so the poll is a no-op for non-scoring
 * roles. Stores the last-seen earn-count map in `localStorage` keyed by
 * user id so the first load after sign-in doesn't spam the user with
 * historical earns.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  isPointsEligible,
  pointsService,
  type PointsBadge,
  type PointsSummary,
} from "@/lib/services/points-service";
import { BadgeIcon } from "./BadgeIcon";

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

  const { data } = useQuery<PointsSummary>({
    queryKey: ["points", "me"],
    queryFn: () => pointsService.getMe(),
    enabled: eligible && !!userId,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!userId || !data) return;
    const next = badgesToSnapshot(data.badges);
    const prev = seenRef.current ?? loadSnapshot(userId);

    if (prev) {
      // Diff: any badge whose count went up triggers a toast per delta.
      for (const b of data.badges) {
        const prevCount = prev[b.id] ?? 0;
        const newEarns = (next[b.id] ?? 0) - prevCount;
        if (newEarns > 0) {
          for (let i = 0; i < newEarns; i += 1) showBadgeToast(b);
        }
      }
    }

    seenRef.current = next;
    saveSnapshot(userId, next);
  }, [data, userId]);

  return null;
}

function showBadgeToast(badge: PointsBadge) {
  toast.success(`Badge unlocked: ${badge.name}`, {
    description: badge.description,
    icon: (
      <BadgeIcon
        iconKey={badge.iconKey}
        tier={badge.tier}
        earned
        size="sm"
      />
    ),
    duration: 6000,
  });
}
