/**
 * What "Let AI do this step" does at each kit stage, as data: an ordered
 * list of steps, each one of
 *   tool   — run a registry tool on the open draft; its result lands in the
 *            chat as a card (and any change it makes is an Undo step);
 *   revise — send a change request to the page's chat (/api/resumes/revise),
 *            which edits the draft in place;
 *   panel  — a tool that needs input only you have (a job post, a file):
 *            it opens in the slide-out over the résumé.
 * "Do it for me" runs the tool + revise steps in order; "Show me first" runs
 * only the tool steps, so you see the findings before anything changes — but
 * not an `afterChanges` tool (a re-score), which only means something once
 * the changes are made. A new
 * step is one entry here — never a branch in a component.
 */
import type { BuildStageId } from "./build-stages";

export type PlanStep =
  | { kind: "tool"; toolId: string; labelKey: string; afterChanges?: true }
  | { kind: "revise"; labelKey: string; promptKey: string }
  | { kind: "panel"; toolId: string; labelKey: string };

export interface StagePlan {
  titleKey: string;
  steps: readonly PlanStep[];
}

export const STAGE_PLANS: Record<BuildStageId, StagePlan> = {
  create: {
    titleKey: "build.plan.create.title",
    steps: [
      // Its page is the result (wheel, readiness, gaps), saved: review and re-run there.
      { kind: "panel", toolId: "career-360", labelKey: "build.plan.create.target" },
      { kind: "revise", labelKey: "build.plan.create.fill", promptKey: "build.stages.create.aiPrompt" },
    ],
  },
  strengthen: {
    titleKey: "build.plan.strengthen.title",
    steps: [
      { kind: "tool", toolId: "ai-resume-scorer", labelKey: "build.plan.strengthen.score" },
      { kind: "tool", toolId: "resume-roast", labelKey: "build.plan.strengthen.roast" },
      { kind: "revise", labelKey: "build.plan.strengthen.fix", promptKey: "build.stages.strengthen.aiPrompt" },
      // #990 — every bullet, summary and title as XYZ, decided one by one.
      { kind: "panel", toolId: "xyz-resume-review", labelKey: "build.plan.strengthen.xyz" },
      // Score the fixed résumé, so the score and the readiness meter move.
      { kind: "tool", toolId: "ai-resume-scorer", labelKey: "build.plan.strengthen.rescore", afterChanges: true },
    ],
  },
  target: {
    titleKey: "build.plan.target.title",
    steps: [
      { kind: "panel", toolId: "job-resume-match", labelKey: "build.plan.target.match" },
      { kind: "panel", toolId: "resume-tailor", labelKey: "build.plan.target.tailor" },
      { kind: "panel", toolId: "value-proposition", labelKey: "build.plan.target.why" },
      { kind: "panel", toolId: "interview-questions", labelKey: "build.plan.target.questions" },
    ],
  },
  video: {
    titleKey: "build.plan.video.title",
    steps: [
      { kind: "tool", toolId: "video-pitch-lab", labelKey: "build.plan.video.script" },
      { kind: "revise", labelKey: "build.plan.video.opening", promptKey: "build.stages.video.aiPrompt" },
      { kind: "panel", toolId: "interview-coach", labelKey: "build.plan.video.practice" },
    ],
  },
  promote: {
    titleKey: "build.plan.promote.title",
    steps: [
      { kind: "tool", toolId: "profile-audit", labelKey: "build.plan.promote.audit" },
      { kind: "tool", toolId: "vendor-sync", labelKey: "build.plan.promote.linkedin" },
      { kind: "revise", labelKey: "build.plan.promote.caption", promptKey: "build.stages.promote.aiPrompt" },
    ],
  },
};

/** The stage after `stage`, or null at the end of the journey. */
export function nextStage(stage: BuildStageId, order: readonly BuildStageId[]): BuildStageId | null {
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}
