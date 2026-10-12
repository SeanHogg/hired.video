/**
 * useResumeLineage — where the open résumé sits: ★ master, a version of
 * the master (title, % different, stale?) or standalone. Drives the review
 * bar badge, the staleness banner, compare's default ("Master ↔ version")
 * and where merges / saves go. Signed-in, saved résumés only.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { resumeVersionsService } from "@/lib/services/resume-versions-service";

const key = (resumeId: string | null) => ["resume-lineage", resumeId] as const;

export function useResumeLineage(resumeId: string | null) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: key(resumeId),
    queryFn: () => resumeVersionsService.lineage(resumeId as string),
    enabled: !!resumeId && isAuthenticated,
    staleTime: 60_000,
  });
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["resume-lineage"] });
  }, [queryClient]);
  return { lineage: query.data ?? null, refresh };
}
