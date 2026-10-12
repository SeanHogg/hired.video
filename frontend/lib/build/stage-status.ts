/**
 * What the kit stepper says about each stage (its "Details" line and fix
 * badge) and the readiness meter, derived from what is known about the draft
 * — never stored. Pure: the stepper translates `key` with `values`.
 */
import type { BuildStageId } from "./build-stages";
import type { ToolRun } from "./use-tool-runs";

export interface StageStatus {
  key: string;
  values?: Record<string, string | number>;
  /** Things left to fix at this stage (shown as a badge). */
  badge?: number;
}

export interface JourneyFacts {
  /** i18n key of the draft's seniority, once it is read. */
  seniorityKey: string | null;
  seconds: number;
  scenes: number;
  runs: readonly ToolRun[];
  /** Fixes still flagged on the page (page-findings.ts) — a fix the chat
   *  already made drops off, so the badge never counts it. Null: count the
   *  latest scoring run's own list. */
  openFixes: number | null;
  /** The job the résumé is aimed at (job-match.ts), once there is one. */
  jobMatch: { jobLabel: string | null; score: number } | null;
}

/** Tools whose 0–100 score says how ready the résumé is. */
const SCORING_TOOLS: ReadonlySet<string> = new Set(["ai-resume-scorer", "resume-optimizer", "resume-roast"]);

/** The latest finished scoring run: its score and how many fixes it found. */
export function latestScore(runs: readonly ToolRun[]): { score: number; fixes: number } | null {
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run.status !== "done" || !SCORING_TOOLS.has(run.toolId)) continue;
    const { overallScore, weaknesses, recommendations } = run.result;
    if (typeof overallScore !== "number") continue;
    return {
      score: Math.round(Math.max(0, Math.min(100, overallScore))),
      fixes: weaknesses?.length ?? recommendations?.length ?? 0,
    };
  }
  return null;
}

/** Readiness to promote (0–100): the mean of the latest score from each
 *  scoring tool that has run (scorer, ATS optimizer, roast) — so one harsh
 *  or kind read doesn't swing it alone — and, once the résumé is aimed at a
 *  job, its match score (tailoring moves it). Null until scored. A nudge
 *  only; it never blocks posting. */
export function readiness(runs: readonly ToolRun[], jobMatchScore: number | null = null): number | null {
  const latestByTool = new Map<string, number>();
  for (const run of runs) {
    if (run.status !== "done" || !SCORING_TOOLS.has(run.toolId)) continue;
    const { overallScore } = run.result;
    if (typeof overallScore === "number") latestByTool.set(run.toolId, Math.max(0, Math.min(100, overallScore)));
  }
  if (latestByTool.size === 0) return null;
  const scores = [...latestByTool.values()];
  if (jobMatchScore !== null) scores.push(Math.max(0, Math.min(100, jobMatchScore)));
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

function targetStatus(match: JourneyFacts["jobMatch"]): StageStatus {
  if (!match) return { key: "build.stages.status.target" };
  return match.jobLabel
    ? { key: "build.stages.status.targetJob", values: { job: match.jobLabel, score: match.score } }
    : { key: "build.stages.status.targetScore", values: { score: match.score } };
}

export function stageStatuses(facts: JourneyFacts): Record<BuildStageId, StageStatus> {
  const scored = latestScore(facts.runs);
  const fixes = scored ? (facts.openFixes ?? scored.fixes) : 0;
  return {
    create: facts.seniorityKey
      ? { key: "build.stages.status.create", values: { levelKey: facts.seniorityKey } }
      : { key: "build.stages.status.createPending" },
    strengthen: scored
      ? {
          key: "build.stages.status.strengthen",
          values: { score: scored.score, count: fixes },
          badge: fixes > 0 ? fixes : undefined,
        }
      : { key: "build.stages.status.strengthenPending" },
    target: targetStatus(facts.jobMatch),
    video: { key: "build.stages.status.video", values: { seconds: facts.seconds, scenes: facts.scenes } },
    promote: { key: "build.stages.status.promote" },
  };
}
