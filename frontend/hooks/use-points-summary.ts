// Signed-in user's points summary (balance, streak, badges). The ONE reader
// of the ["points","me",userId] React Query entry (PointsPill, PointsHub,
// GamificationGauge, BadgeUnlockToaster, /rewards), so mounting it anywhere
// costs no extra request when another surface already loaded it. Seeded by
// /api/bootstrap for scoring roles; waits for api-ready so the seed lands
// before the first read.

import { useQuery } from "@tanstack/react-query";
import { useApiReady, useAuth } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { pointsService, type PointsSummary } from "@/lib/services/points-service";

export interface PointsSummaryOptions {
  refetchOnWindowFocus?: boolean;
}

export function usePointsSummary(enabled: boolean, options: PointsSummaryOptions = {}) {
  const { user } = useAuth();
  const apiReady = useApiReady();
  return useQuery<PointsSummary>({
    queryKey: queryKeys.points.me(user?.id),
    queryFn: () => pointsService.getMe(),
    enabled: enabled && apiReady,
    staleTime: 60_000,
    ...options,
  });
}
