// useCrossJobPipeline — fetch + optimistic mutations for the cross-job
// recruiter kanban (#405). Mirrors useJobPipeline, but reads the aggregate
// `/api/pipeline/all` board and routes each move/remove to the entry's OWN
// job (`entry.jobId`) since a single board spans many jobs. The pure
// snapshot mutations are reused from lib/recruit/pipeline-mutations so the
// optimistic logic isn't duplicated.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
  jobPipelineService,
  type CrossJobPipelineSnapshot,
  type PipelineEntry,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";
import { moveEntry, removeEntry } from "@/lib/recruit/pipeline-mutations";

export interface CrossJobPipelineFilters {
  stage?: PipelineStage;
  jobId?: string;
}

export interface UseCrossJobPipelineResult {
  snapshot: CrossJobPipelineSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  moveStage: (entryId: string, stage: PipelineStage) => Promise<void>;
  removeCandidate: (entryId: string) => Promise<void>;
}

/** Locate an entry across every stage column (cross-job entries carry their
 *  own jobId, which the mutation handlers need to target the right job). */
function findEntry(
  snapshot: CrossJobPipelineSnapshot | null,
  entryId: string,
): PipelineEntry | null {
  if (!snapshot) return null;
  for (const group of snapshot.stages) {
    const found = group.entries.find((e) => e.id === entryId);
    if (found) return found;
  }
  return null;
}

export function useCrossJobPipeline(
  filters: CrossJobPipelineFilters,
): UseCrossJobPipelineResult {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<CrossJobPipelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const { stage, jobId } = filters;

  const load = useCallback(async () => {
    return jobPipelineService.listAll({ stage, jobId });
  }, [stage, jobId]);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await load());
    } catch {
      toast({
        title: t("crossJobPipeline.loadFailedTitle"),
        description: t("crossJobPipeline.loadFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [load, t, toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await load();
        if (!cancelled) setSnapshot(next);
      } catch {
        if (!cancelled) {
          toast({
            title: t("crossJobPipeline.loadFailedTitle"),
            description: t("crossJobPipeline.loadFailedDesc"),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, t, toast]);

  const moveStage = useCallback(
    async (entryId: string, nextStage: PipelineStage) => {
      const entry = findEntry(snapshot, entryId);
      if (!entry) return;
      setSnapshot((prev) => prev && (moveEntry(prev, entryId, nextStage) as CrossJobPipelineSnapshot));
      try {
        await jobPipelineService.moveStage(entry.jobId, entryId, nextStage);
      } catch (e) {
        toast({
          title: t("crossJobPipeline.moveFailedTitle"),
          description: (e as Error)?.message ?? t("crossJobPipeline.reverting"),
          variant: "destructive",
        });
        await refresh();
      }
    },
    [snapshot, refresh, t, toast],
  );

  const removeCandidate = useCallback(
    async (entryId: string) => {
      const entry = findEntry(snapshot, entryId);
      if (!entry) return;
      setSnapshot((prev) => prev && (removeEntry(prev, entryId) as CrossJobPipelineSnapshot));
      try {
        await jobPipelineService.remove(entry.jobId, entryId);
      } catch (e) {
        toast({
          title: t("crossJobPipeline.removeFailedTitle"),
          description: (e as Error)?.message ?? t("crossJobPipeline.reverting"),
          variant: "destructive",
        });
        await refresh();
      }
    },
    [snapshot, refresh, t, toast],
  );

  return { snapshot, loading, refresh, moveStage, removeCandidate };
}
