import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { studioService } from "@/lib/services/studio-service";
import { REREAD_ON_MOUNT, useViewerId, type ViewerQueryOptions } from "./use-viewer-id";

/** Every studio project the viewer can see (all workspaces, no subject
 *  filter), keyed `["studio-projects", userId]`; resolves to the bare array.
 *  Disabled while signed out. */
export function useStudioProjects(options: ViewerQueryOptions = {}) {
  const userId = useViewerId();
  return useQuery({
    queryKey: queryKeys.studioProjects.byUser(userId),
    queryFn: async () => (await studioService.getProjects()).data ?? [],
    enabled: !!userId && (options.enabled ?? true),
    staleTime: REREAD_ON_MOUNT,
  });
}
