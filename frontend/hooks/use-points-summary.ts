// Signed-in user's points summary (balance, streak, badges). The ONE reader
// of the ["points","me"] React Query cache entry (PointsPill, PointsHub,
// GamificationGauge, BadgeUnlockToaster, /rewards), so mounting it anywhere
// costs no extra request when another surface already loaded it.

import { useQuery } from "@tanstack/react-query";
import { pointsService, type PointsSummary } from "@/lib/services/points-service";

export const POINTS_SUMMARY_QUERY_KEY = ["points", "me"] as const;

export interface PointsSummaryPolling {
  /** Poll interval in ms (badge-unlock toaster). Omit for no polling. */
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
}

export function usePointsSummary(enabled: boolean, polling: PointsSummaryPolling = {}) {
  return useQuery<PointsSummary>({
    queryKey: POINTS_SUMMARY_QUERY_KEY,
    queryFn: () => pointsService.getMe(),
    enabled,
    staleTime: 60_000,
    ...polling,
  });
}
