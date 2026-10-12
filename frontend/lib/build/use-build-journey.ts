/**
 * The kit's Create → Promote journey, in one place: the AI Tools run in the
 * chat (useToolRuns), the tool open in the slide-out (useToolPanel), the
 * open stage's "Let AI do this step" plan (useStagePlan), what the runs
 * flag on the page (page-findings.ts), the job the résumé is aimed at
 * (job-match.ts), and what the stepper says about each stage
 * (stage-status.ts). The page renders
 * `<ProGateSheet {...toolGateSheet} />` once.
 */
import { useCallback, useMemo } from "react";
import type { ResumeContent } from "@shared/resume";
import type { BuildStageId } from "./build-stages";
import { deriveJobMatch, type MatchReviewInput } from "./job-match";
import { pageFindings } from "./page-findings";
import { stageToolMode } from "./stage-tools";
import { readiness, stageStatuses } from "./stage-status";
import { useStagePlan } from "./use-stage-plan";
import { useToolPanel } from "./use-tool-panel";
import { useToolRuns } from "./use-tool-runs";

interface Args {
  stage: BuildStageId;
  draftKey: unknown;
  /** The saved résumé the journey (runs, checkmarks) is remembered under. */
  resumeId: string | null;
  ensureSaved: () => Promise<string>;
  requireAccount: (reasonKey: string) => boolean;
  /** Send a change request to the page's chat. */
  revise: (text: string) => Promise<void>;
  seniorityKey: string | null;
  seconds: number;
  scenes: number;
  /** The draft the runs' findings are pinned on. */
  content: ResumeContent | null;
  /** The open review (a tailor names the job and its score). */
  review: MatchReviewInput | null;
  /** The studio session the AI Tool runs are saved on (/studio/<id>). */
  projectId: string | null;
  ensureProjectId: () => Promise<string | null>;
}

export function useBuildJourney({
  stage,
  draftKey,
  resumeId,
  ensureSaved,
  requireAccount,
  revise,
  seniorityKey,
  seconds,
  scenes,
  content,
  review,
  projectId,
  ensureProjectId,
}: Args) {
  const tools = useToolRuns({ draftKey, resumeId, projectId, ensureProjectId, ensureSaved, requireAccount });
  const panel = useToolPanel(ensureSaved);
  const { run, reuse, runs } = tools;
  const { show } = panel;
  const plan = useStagePlan({ stage, draftKey, resumeId, runs, runTool: run, reuseTool: reuse, revise, openPanel: show });

  /** A tool chip: run it in the chat, or open it in the slide-out. */
  const openTool = useCallback(
    (toolId: string) => {
      if (stageToolMode(toolId) === "run") void run(toolId);
      else void show(toolId);
    },
    [run, show],
  );

  // Scoring findings pinned on the lines they criticise.
  const findings = useMemo(() => (content ? pageFindings(runs, content) : []), [runs, content]);
  const jobMatch = useMemo(() => deriveJobMatch(review, runs), [review, runs]);
  const statuses = useMemo(
    () =>
      stageStatuses({
        seniorityKey,
        seconds,
        scenes,
        runs,
        openFixes: content ? findings.length : null,
        jobMatch,
      }),
    [seniorityKey, seconds, scenes, runs, content, findings, jobMatch],
  );
  const ready = useMemo(() => readiness(runs, jobMatch?.score ?? null), [runs, jobMatch]);

  return {
    runs,
    /** Run a registry tool on the draft as a chat card (a finding's wand). */
    runTool: run,
    openTool,
    plan,
    panel: { open: panel.open, close: panel.close },
    /** A run that finished in the slide-out. */
    record: tools.record,
    findings,
    jobMatch,
    statuses,
    readiness: ready,
    toolGateSheet: tools.proGateSheet,
  };
}
