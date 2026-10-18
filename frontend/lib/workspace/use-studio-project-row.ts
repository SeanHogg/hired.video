/**
 * useStudioProjectRow — the studio project row a workspace is (a kit's
 * project), for the ⋯ rows that act on the project (Details, templates,
 * clone / delete, embed) and the kit's document layers. ONE React Query
 * entry per id (`["studio-project", id]`), so KitHeader and
 * use-kit-document-layers share a single GET /api/studio/projects/:id.
 * `setProject` writes the cache so every reader stays in step after an edit.
 * Null until there is a project and it loaded (or when the read fails).
 * StudioWorkspace seeds the entry from its own first read of /studio/:id.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { studioService, type StudioProject } from "@/lib/services/studio-service";

/** A row this young counts as fresh — long enough to cover the seed → kit
 *  mount hand-off, short enough that any later kit open re-reads. */
const JUST_READ_MS = 5_000;

export function useStudioProjectRow(projectId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.studioProject.byId(projectId);
  const { data } = useQuery({
    queryKey,
    queryFn: async (): Promise<StudioProject | null> => {
      try {
        return (await studioService.getProject(projectId as string)).data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!projectId,
    // Re-read on each kit open (as before), but concurrent readers on the
    // same page share the one in-flight request, and a row read moments ago
    // (StudioWorkspace seeds it from its kit-vs-format read of /studio/:id)
    // isn't fetched a second time on the kit's first mount.
    staleTime: JUST_READ_MS,
  });

  const setProject = useCallback(
    (next: StudioProject | null) => {
      if (projectId) queryClient.setQueryData(queryKeys.studioProject.byId(projectId), next);
    },
    [queryClient, projectId],
  );

  return { project: projectId ? (data ?? null) : null, setProject };
}
