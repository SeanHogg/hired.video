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
 * destination that fails says so on its own row, and a prepare (save /
 * render) that fails fails every row with its reason instead of leaving
 * them on "Preparing" forever.
 *
 * The run reports itself to the diagnostics report (section `postRun`):
 * when it started, each phase change, the project it posts, and each
 * destination's start / finish / outcome — so a post stuck on "Posting…"
 * can be triaged from one copied report (with the requests still waiting,
 * see api-client getPendingApiRequests).
 */
import { useCallback, useRef, useState } from "react";
import { useDiagnosticsSection } from "@/lib/diagnostics/diagnostics-sections";
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

function failed(err: unknown): PublishOutcome {
  return { ok: false, url: null, reason: "failed", message: err instanceof Error ? err.message : String(err) };
}

/** What the diagnostics report says about the last run. */
interface PostTrace {
  startedAt: string;
  channels: ShareChannelId[];
  /** Each phase as it began (render / cut progress is in `progress`). */
  phases: Array<{ phase: PostPhase | "prepare-failed" | "no-project"; at: string; detail?: string }>;
  projectId: string | null;
  /** The hosted MP4 the destinations pull (null = nothing rendered). */
  videoUrl: string | null;
  status: string | null;
  cuts: ChannelCuts;
  destinations: Partial<Record<ShareChannelId, { startedAt?: string; finishedAt?: string; outcome?: PublishOutcome }>>;
}

const now = () => new Date().toISOString();
const secondsSince = (iso: string | undefined) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 1000) : null);

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
  const traceRef = useRef<PostTrace | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useDiagnosticsSection("postRun", () => {
    const trace = traceRef.current;
    if (!trace) return { phase: "idle", ran: false };
    const p = progressRef.current;
    return {
      phase: p.phase,
      running: runningRef.current,
      elapsedSec: secondsSince(trace.startedAt),
      render: p.render,
      cut: p.cut,
      ...trace,
      destinations: Object.fromEntries(
        trace.channels.map((c) => {
          const d = trace.destinations[c] ?? {};
          return [c, { state: p.channels[c]?.state ?? null, ...d, waitingSec: d.finishedAt ? null : secondsSince(d.startedAt) }];
        }),
      ),
    };
  });

  const setChannel = (channel: ShareChannelId, next: ChannelPostState) =>
    setProgress((p) => ({ ...p, channels: { ...p.channels, [channel]: next } }));

  /** Resolves with every destination's outcome (empty when preparing failed). */
  const run = useCallback(
    async ({ channels, prepare, bakeCuts, postOne, onOutcome }: RunArgs): Promise<Partial<Record<ShareChannelId, PublishOutcome>>> => {
      if (runningRef.current || channels.length === 0) return {};
      runningRef.current = true;
      const trace: PostTrace = {
        startedAt: now(),
        channels: [...channels],
        phases: [{ phase: "preparing", at: now() }],
        projectId: null,
        videoUrl: null,
        status: null,
        cuts: {},
        destinations: {},
      };
      traceRef.current = trace;
      try {
        const queued = Object.fromEntries(channels.map((c) => [c, { state: "queued" }])) as PostProgress["channels"];
        setProgress({ phase: "preparing", render: null, channels: queued, cut: null });
        let project: StudioProject | null;
        try {
          project = await prepare((render) => setProgress((p) => ({ ...p, render })));
        } catch (err) {
          // Save / render failed: every destination says so (never stuck on "Preparing").
          const outcome = failed(err);
          trace.phases.push({ phase: "prepare-failed", at: now(), detail: outcome.message });
          const done = Object.fromEntries(channels.map((c) => [c, { state: "done", outcome }])) as PostProgress["channels"];
          setProgress({ phase: "done", render: null, channels: done, cut: null });
          return Object.fromEntries(channels.map((c) => [c, outcome]));
        }
        if (!project) {
          trace.phases.push({ phase: "no-project", at: now() });
          setProgress(IDLE);
          return {};
        }
        trace.projectId = project.id;
        trace.videoUrl = project.videoUrl ?? null;
        trace.status = project.status;
        const cuts: ChannelCuts = bakeCuts
          ? await bakeCuts(project, (cut) => setProgress((p) => ({ ...p, render: null, cut }))).catch((): ChannelCuts => ({}))
          : {};
        trace.cuts = cuts;
        trace.phases.push({ phase: "posting", at: now() });
        setProgress((p) => ({ ...p, phase: "posting", render: null, cut: null }));
        const outcomes: Partial<Record<ShareChannelId, PublishOutcome>> = {};
        await Promise.all(
          channels.map(async (channel) => {
            trace.destinations[channel] = { startedAt: now() };
            setChannel(channel, { state: "posting" });
            const outcome = await postOne(channel, project, cuts[channel]).catch(failed);
            trace.destinations[channel] = { ...trace.destinations[channel], finishedAt: now(), outcome };
            outcomes[channel] = outcome;
            setChannel(channel, { state: "done", outcome });
            onOutcome?.(channel, outcome);
          }),
        );
        trace.phases.push({ phase: "done", at: now() });
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
