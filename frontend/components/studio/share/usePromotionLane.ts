/**
 * usePromotionLane — Lane A (hired.video's brand channels, #2046) for one
 * project: the submissions so far and which brand accounts are live. ONE
 * query shared by the lane chooser (is there a Lane A to offer?) and the
 * PromotionCard (submit / status), so neither re-fetches or prop-drills it.
 * Inactive for a signed-out visitor or an unsaved draft.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { promotionService } from "@/lib/services/promotion-service";

export function promotionQueryKey(projectId: string | null) {
  return ["promotions", projectId] as const;
}

export function usePromotionLane(projectId: string | null) {
  const { isAuthenticated } = useAuth();
  const enabled = isAuthenticated && !!projectId;
  const q = useQuery({
    queryKey: promotionQueryKey(projectId),
    queryFn: () => promotionService.forProject(projectId!),
    enabled,
  });
  const ready = q.data?.platforms.filter((p) => p.ready) ?? [];
  return {
    query: q,
    /** Brand accounts that can take a submission right now. */
    ready,
    /** Lane A is on offer for this project. */
    available: enabled && ready.length > 0,
  };
}
