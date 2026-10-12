/**
 * useCompareSource — what the compare panel's left column shows.
 *
 *   review    the open review's "Before" (default while reviewing)
 *   master    the ★ master (default when a version is open)
 *   saved     the open résumé as last saved
 *   version   another version of the same master
 *
 * Stored résumés load on demand through react-query (cached per id); the
 * version list comes from the master groups the résumé list already uses.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ResumeContent } from "@shared/resume";
import type { ResumeLineage } from "@shared/resume-lineage";
import { resumeService } from "@/lib/services/resume-service";

export type CompareWith = { kind: "review" } | { kind: "master" } | { kind: "saved" } | { kind: "version"; id: string };

export function useCompareSource(args: {
  open: boolean;
  reviewBaseline: ResumeContent | null;
  lineage: ResumeLineage | null;
  resumeId: string | null;
}) {
  const { open, reviewBaseline, lineage, resumeId } = args;
  const masterId = lineage?.master && lineage.master.id !== resumeId ? lineage.master.id : null;
  const fallback: CompareWith = reviewBaseline ? { kind: "review" } : masterId ? { kind: "master" } : { kind: "saved" };
  const [picked, setPicked] = useState<CompareWith | null>(null);
  const choice = picked ?? fallback;

  const storedId =
    choice.kind === "master" ? masterId : choice.kind === "saved" ? resumeId : choice.kind === "version" ? choice.id : null;
  const stored = useQuery({
    queryKey: ["resume", storedId],
    queryFn: () => resumeService.getResumeById(storedId as string),
    enabled: open && !!storedId,
    staleTime: 30_000,
  });
  const groups = useQuery({
    queryKey: ["resume-master-groups"],
    queryFn: () => resumeService.getMasterResumeGroups(),
    enabled: open && !!lineage?.master,
    staleTime: 60_000,
  });

  const versions = useMemo(() => {
    const group = groups.data?.find((g) => g.masterResume.id === lineage?.master?.id);
    return (group?.variations ?? []).filter((v) => v.id !== resumeId).map((v) => ({ id: v.id, title: v.title }));
  }, [groups.data, lineage?.master?.id, resumeId]);

  const content: ResumeContent | null =
    choice.kind === "review" ? reviewBaseline : ((stored.data?.content as unknown as ResumeContent | undefined) ?? null);

  return {
    choice,
    setChoice: setPicked,
    content,
    loading: choice.kind !== "review" && stored.isLoading,
    canMaster: !!masterId,
    canSaved: !!resumeId,
    canReview: !!reviewBaseline,
    versions,
  };
}
