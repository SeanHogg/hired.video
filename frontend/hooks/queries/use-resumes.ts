import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { resumeService } from "@/lib/services/resume-service";
import { REREAD_ON_MOUNT, useViewerId, type ByIdQueryOptions, type ViewerQueryOptions } from "./use-viewer-id";

/** The viewer's own résumés (`GET /api/resumes/getresumesownedbyauthuser`),
 *  keyed `["resumes", userId]`. Disabled while signed out. */
export function useUserResumes(options: ViewerQueryOptions = {}) {
  const userId = useViewerId();
  return useQuery({
    queryKey: queryKeys.resumes.byUser(userId),
    queryFn: () => resumeService.getUserResumes(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: REREAD_ON_MOUNT,
  });
}

/** One résumé by id, keyed `["resume", id]`. Disabled without an id. */
export function useResume(id: string | null | undefined, options: ByIdQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.resume.byId(id),
    queryFn: () => resumeService.getResumeById(id as string),
    enabled: !!id && (options.enabled ?? true),
    staleTime: options.staleTime ?? REREAD_ON_MOUNT,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });
}
