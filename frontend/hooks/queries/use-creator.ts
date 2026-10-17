import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { creatorService } from "@/lib/services/creator-service";
import { REREAD_ON_MOUNT, useViewerId, type ViewerQueryOptions } from "./use-viewer-id";

/** The viewer's creator enrollment (`GET /api/creators/me`), `null` when not
 *  enrolled, keyed `["creator-mine", userId]`. Disabled while signed out.
 *  After a write that changes enrollment, invalidate `queryKeys.creatorMine.all`. */
export function useCreatorMine(options: ViewerQueryOptions = {}) {
  const userId = useViewerId();
  return useQuery({
    queryKey: queryKeys.creatorMine.byUser(userId),
    queryFn: () => creatorService.getMine(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: REREAD_ON_MOUNT,
  });
}
