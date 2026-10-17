import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { jobService } from "@/lib/services/job-service";
import { REREAD_ON_MOUNT, useViewerId, type ByIdQueryOptions, type ViewerQueryOptions } from "./use-viewer-id";

/** One job by id or slug, keyed `["job", id]`. Disabled without an id. */
export function useJob(id: string | null | undefined, options: ByIdQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.job.byId(id),
    queryFn: () => jobService.getJobById(id as string),
    enabled: !!id && (options.enabled ?? true),
    staleTime: options.staleTime ?? REREAD_ON_MOUNT,
  });
}

/** The viewer's saved jobs (`GET /api/jobs/saved`), keyed
 *  `["saved-jobs", userId]`. Disabled while signed out. */
export function useSavedJobs(options: ViewerQueryOptions = {}) {
  const userId = useViewerId();
  return useQuery({
    queryKey: queryKeys.savedJobs.byUser(userId),
    queryFn: () => jobService.getSavedJobs(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: REREAD_ON_MOUNT,
  });
}
