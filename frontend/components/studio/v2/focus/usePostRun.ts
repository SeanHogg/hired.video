/**
 * One "Post" run across several destinations, with a status for each:
 *
 *   preparing — the video is saved, rendered (render progress 0..1) and
 *               hosted once; then each distinct fitted cut a destination
 *               needs (#2045) is reused or rendered once (`cut`) — a
 *               destination with a cut posts it, the rest post the master;
 *   posting   — every destination posts AT THE SAME TIME, each moving
 *               queued → posting → done (its own outcome) on its own;
 *   done      — all of them have answered.
 *
 * The run lives in the hook, not the UI: closing the Post panel doesn't stop
 * it, and reopening shows where each destination is. Never throws — a
 * destination that fails says so on its own row.
 */
import { useCallback, useRef, useState } from "react";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import type { PublishOutcome } from "@/lib/studio/use-publish-handlers";
import type { StudioProject } from "@/lib/services/studio-service";

export type ChannelPostState =
  | { state: "queued" }
  | { state: "posting" }
  | { state: "done"; outcome: PublishOutcome };

export type PostPhase = "idle" | "preparing" | "posting" | "done";

export interface PostProgress {
  phase: PostPhase;
  /** Render progress (0..1) while preparing; null when there is no render. */
  render: number | null;
  channels: Partial<Record<ShareChannelId, ChannelPostState>>;
  /** The fitted cut being made while preparing; null otherwise. */
  cut: CutProgress | null;
}

export interface CutProgress {
  /** "9:16" or "9:16 · 2:20" (useChannelFit `cutLabel`). */
  label: string;
  /** The destinations this cut feeds. */
  channels: ShareChannelId[];
  /** Render progress 0..1; null while checking for a stored cut. */
  progress: number | null;
}

/** Each destination's fitted cut (its `videos` id); absent = post the master. */
export type ChannelCuts = Partial<Record<ShareChannelId, string>>;

const IDLE: PostProgress = { phase: "idle", render: null, channels: {}, cut: null };
const FAILED: PublishOutcome = { ok: false, url: null, reason: "failed" };

interface RunArgs {
  channels: readonly ShareChannelId[];
  /** Save (+ render + host) the project every destination posts. */
  prepare: (onRender: (progress: number) => void) => Promise<StudioProject | null>;
  /** Make (or reuse) the fitted cuts the destinations need. Never throws:
   *  a cut that fails is left out and its destination posts the master. */
  bakeCuts?: (project: StudioProject, report: (cut: CutProgress | null) => void) => Promise<ChannelCuts>;
  postOne: (channel: ShareChannelId, project: StudioProject, variantVideoId?: string) => Promise<PublishOutcome>;
  /** After each destination answers (e.g. a lost connection → reload it). */
  onOutcome?: (channel: ShareChannelId, outcome: PublishOutcome) => void;
}

export function usePostRun() {
  const [progress, setProgress] = useState<PostProgress>(IDLE);
  const runningRef = useRef(false);

  const setChannel = (channel: ShareChannelId, next: ChannelPostState) =>
    setProgress((p) => ({ ...p, channels: { ...p.channels, [channel]: next } }));

  /** Resolves with every destination's outcome (empty when preparing failed). */
  const run = useCallback(
    async ({ channels, prepare, bakeCuts, postOne, onOutcome }: RunArgs): Promise<Partial<Record<ShareChannelId, PublishOutcome>>> => {
      if (runningRef.current || channels.length === 0) return {};
      runningRef.current = true;
      try {
        const queued = Object.fromEntries(channels.map((c) => [c, { state: "queued" }])) as PostProgress["channels"];
        setProgress({ phase: "preparing", render: null, channels: queued, cut: null });
        const project = await prepare((render) => setProgress((p) => ({ ...p, render })));
        if (!project) {
          setProgress(IDLE);
          return {};
        }
        const cuts: ChannelCuts = bakeCuts
          ? await bakeCuts(project, (cut) => setProgress((p) => ({ ...p, render: null, cut }))).catch((): ChannelCuts => ({}))
          : {};
        setProgress((p) => ({ ...p, phase: "posting", render: null, cut: null }));
        const outcomes: Partial<Record<ShareChannelId, PublishOutcome>> = {};
        await Promise.all(
          channels.map(async (channel) => {
            setChannel(channel, { state: "posting" });
            const outcome = await postOne(channel, project, cuts[channel]).catch(() => FAILED);
            outcomes[channel] = outcome;
            setChannel(channel, { state: "done", outcome });
            onOutcome?.(channel, outcome);
          }),
        );
        setProgress((p) => ({ ...p, phase: "done" }));
        return outcomes;
      } finally {
        runningRef.current = false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    if (!runningRef.current) setProgress(IDLE);
  }, []);

  return { progress, run, reset };
}
