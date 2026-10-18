import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { graphService, type MutualConnectionsResult } from "@/lib/services/graph-service";
import { useViewerId } from "./use-viewer-id";

/** Mutuals don't move within a profile visit; one read per minute is plenty. */
const MUTUALS_STALE_MS = 60_000;

/** Mutual connections between the signed-in viewer and `targetUserId`
 *  (`GET /api/graph/mutuals/:id`), keyed `["graph-mutuals", viewerId, target]`.
 *  The ONE reader for every surface on a profile (MutualConnectionsRow,
 *  WarmIntroRequestButton) so they share a single in-flight request + cache.
 *  Disabled while signed out (the endpoint is auth-only) or when `enabled`
 *  is false (e.g. viewing your own profile). */
export function useMutualConnections(targetUserId: string | null | undefined, enabled = true) {
  const viewerId = useViewerId();
  return useQuery<MutualConnectionsResult>({
    queryKey: queryKeys.graphMutuals.byTarget(viewerId, targetUserId),
    queryFn: () => graphService.mutuals(targetUserId ?? ""),
    enabled: enabled && !!viewerId && !!targetUserId,
    staleTime: MUTUALS_STALE_MS,
    retry: false,
  });
}
