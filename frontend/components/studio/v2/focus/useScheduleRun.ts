/**
 * useScheduleRun — the Post dock's "Schedule" (#2047): the same preparation
 * a post now does (save, render + host the master, then each distinct
 * fitted cut once — encoding only ever happens in the browser), then ONE
 * call that queues a job per destination with the cut it should post. The
 * queue sends them at the chosen time (the 5-minute cron).
 *
 * `progress` has the usePostRun shape (no per-destination rows) so the
 * dock's PostProgressList shows the render and cut progress unchanged.
 */
import { useCallback, useRef, useState } from "react";
import type { StudioProject } from "@/lib/services/studio-service";
import { distributionService, type ScheduleDestination, type ScheduleResult } from "@/lib/services/distribution-service";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import type { ChannelCuts, CutProgress, PostProgress } from "./usePostRun";

const IDLE: PostProgress = { phase: "idle", render: null, channels: {}, cut: null };

export interface ScheduledOutcome {
  at: Date;
  result: ScheduleResult;
}

interface ScheduleArgs {
  channels: readonly ShareChannelId[];
  at: Date;
  caption: string;
  prepare: (onRender: (progress: number) => void) => Promise<StudioProject | null>;
  bakeCuts: (project: StudioProject, report: (cut: CutProgress | null) => void) => Promise<ChannelCuts>;
  /** The job for one destination (lane, settings), given its cut. */
  destinationFor: (channel: ShareChannelId, project: StudioProject, cut: string | undefined) => ScheduleDestination;
}

export function useScheduleRun() {
  const [progress, setProgress] = useState<PostProgress>(IDLE);
  const [scheduled, setScheduled] = useState<ScheduledOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async ({ channels, at, caption, prepare, bakeCuts, destinationFor }: ScheduleArgs) => {
    if (runningRef.current || channels.length === 0) return;
    runningRef.current = true;
    setError(null);
    try {
      setProgress({ phase: "preparing", render: null, channels: {}, cut: null });
      const project = await prepare((render) => setProgress((p) => ({ ...p, render })));
      if (!project) return;
      const cuts = await bakeCuts(project, (cut) => setProgress((p) => ({ ...p, render: null, cut }))).catch((): ChannelCuts => ({}));
      const result = await distributionService.schedule({
        projectId: project.id,
        caption,
        scheduledAt: at.toISOString(),
        destinations: channels.map((c) => destinationFor(c, project, cuts[c])),
      });
      setScheduled({ at, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(IDLE);
      runningRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (runningRef.current) return;
    setScheduled(null);
    setError(null);
  }, []);

  return { progress, scheduled, error, running: progress.phase !== "idle", run, reset };
}
