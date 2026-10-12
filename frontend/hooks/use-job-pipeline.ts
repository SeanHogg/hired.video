// useJobPipeline — encapsulates fetch + optimistic mutations for one job's
// kanban. The component layer (JobPipelineKanban) becomes thin transport
// once it consumes this; mutations themselves live in lib/recruit/
// pipeline-mutations so they're testable in isolation.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  jobPipelineService,
  type AddPipelineEntryInput,
  type PipelineEntry,
  type PipelineSnapshot,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";
import { PIPELINE_STAGE_LABELS } from "@shared/recruiter-pipeline";
import {
  insertEntry,
  moveEntry,
  removeEntry,
} from "@/lib/recruit/pipeline-mutations";

export interface UseJobPipelineResult {
  snapshot: PipelineSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  moveStage: (entryId: string, stage: PipelineStage) => Promise<void>;
  bulkMoveStage: (entryIds: string[], stage: PipelineStage) => Promise<void>;
  addCandidate: (input: AddPipelineEntryInput) => Promise<PipelineEntry>;
  removeCandidate: (entryId: string) => Promise<void>;
}

export function useJobPipeline(
  jobId: string,
  onCountChange?: (total: number) => void,
): UseJobPipelineResult {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await jobPipelineService.list(jobId);
      setSnapshot(next);
      onCountChange?.(next.total);
    } catch {
      toast({
        title: "Failed to load pipeline",
        description: "Refresh the page or check your connection.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [jobId, onCountChange, toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await jobPipelineService.list(jobId);
        if (cancelled) return;
        setSnapshot(next);
        onCountChange?.(next.total);
      } catch {
        if (!cancelled) {
          toast({
            title: "Failed to load pipeline",
            description: "Refresh the page or check your connection.",
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
  }, [jobId, onCountChange, toast]);

  const moveStage = useCallback(
    async (entryId: string, stage: PipelineStage) => {
      setSnapshot((prev) => prev && moveEntry(prev, entryId, stage));
      try {
        await jobPipelineService.moveStage(jobId, entryId, stage);
      } catch (e) {
        toast({
          title: "Move failed",
          description: (e as Error)?.message ?? "Reverting.",
          variant: "destructive",
        });
        await refresh();
      }
    },
    [jobId, refresh, toast],
  );

  const bulkMoveStage = useCallback(
    async (entryIds: string[], stage: PipelineStage) => {
      if (entryIds.length === 0) return;
      setSnapshot((prev) => {
        if (!prev) return prev;
        let next = prev;
        for (const id of entryIds) next = moveEntry(next, id, stage);
        return next;
      });
      try {
        await Promise.all(entryIds.map((id) => jobPipelineService.moveStage(jobId, id, stage)));
        toast({
          title: "Bulk move complete",
          description: `${entryIds.length} candidate(s) → ${PIPELINE_STAGE_LABELS[stage]}.`,
        });
      } catch (e) {
        toast({
          title: "Bulk move failed",
          description: (e as Error)?.message ?? "Reverting.",
          variant: "destructive",
        });
        await refresh();
      }
    },
    [jobId, refresh, toast],
  );

  const addCandidate = useCallback(
    async (input: AddPipelineEntryInput) => {
      try {
        const entry = await jobPipelineService.add(jobId, input);
        setSnapshot((prev) => {
          const next = prev ? insertEntry(prev, entry) : prev;
          if (next) onCountChange?.(next.total);
          return next;
        });
        toast({
          title: "Candidate added",
          description: `${entry.candidateName} → ${PIPELINE_STAGE_LABELS[entry.stage]}.`,
        });
        return entry;
      } catch (e) {
        toast({
          title: "Add failed",
          description: (e as Error)?.message ?? "Try again.",
          variant: "destructive",
        });
        throw e;
      }
    },
    [jobId, onCountChange, toast],
  );

  const removeCandidate = useCallback(
    async (entryId: string) => {
      setSnapshot((prev) => prev && removeEntry(prev, entryId));
      try {
        await jobPipelineService.remove(jobId, entryId);
      } catch (e) {
        toast({
          title: "Remove failed",
          description: (e as Error)?.message ?? "Reverting.",
          variant: "destructive",
        });
        await refresh();
      }
    },
    [jobId, refresh, toast],
  );

  return {
    snapshot,
    loading,
    refresh,
    moveStage,
    bulkMoveStage,
    addCandidate,
    removeCandidate,
  };
}
