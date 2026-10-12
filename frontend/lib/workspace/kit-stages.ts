/**
 * A career kit's journey as data: each Create → Promote stage names the page
 * it opens, and the stepper's ONE primary button ("Next") either goes to the
 * next stage or, at the end, opens the Post panel. The page for a stage
 * comes from here, never from a branch in a component.
 *
 *   create      → Résumé
 *   strengthen  → Résumé
 *   target      → Cover letter (the Résumé until a letter exists — tailoring
 *                 to a job writes one)
 *   video       → Video
 *   promote     → Video + the Post panel in the right slot
 *
 * Pure (no React) so the stepper, the navigation hook and the tests share it.
 */
import { BUILD_STAGES, type BuildStageId } from "@/lib/build/build-stages";

export const KIT_PAGES = ["resume", "letter", "video"] as const;
export type KitPage = (typeof KIT_PAGES)[number];

/** `?page=` → a kit page, or null. */
export function parseKitPage(value: string | null): KitPage | null {
  return (KIT_PAGES as readonly string[]).includes(value ?? "") ? (value as KitPage) : null;
}

/** What a "start with one" link (`?start=`) asks a new kit to begin from
 *  (`ai`: describe yourself, the AI drafts — the chat's first turn). */
export const KIT_STARTS = ["resume", "letter", "video", "job", "ai"] as const;
export type KitStart = (typeof KIT_STARTS)[number];

export function parseKitStart(value: string | null): KitStart | null {
  return (KIT_STARTS as readonly string[]).includes(value ?? "") ? (value as KitStart) : null;
}

interface KitStageDef {
  /** The page the stage opens. */
  page: KitPage;
  /** Where to fall back when the page has nothing to show yet. */
  fallback?: KitPage;
  /** The stage can be passed over ("Skip"): it is a nudge, not a step. */
  optional?: true;
  /** Arriving here opens the Post panel. */
  opensPost?: true;
}

const KIT_STAGES: Record<BuildStageId, KitStageDef> = {
  create: { page: "resume" },
  strengthen: { page: "resume" },
  target: { page: "letter", fallback: "resume", optional: true },
  video: { page: "video" },
  promote: { page: "video", opensPost: true },
};

/** The page a stage opens. `hasLetter` false → the letter page falls back. */
export function pageForStage(stage: BuildStageId, { hasLetter }: { hasLetter: boolean }): KitPage {
  const def = KIT_STAGES[stage];
  if (def.page === "letter" && !hasLetter) return def.fallback ?? "resume";
  return def.page;
}

export function stageOpensPost(stage: BuildStageId): boolean {
  return KIT_STAGES[stage].opensPost === true;
}

export function stageIsOptional(stage: BuildStageId): boolean {
  return KIT_STAGES[stage].optional === true;
}

/** What the stepper's Next button does at `stage`. */
export type KitNextAction = { kind: "stage"; stage: BuildStageId } | { kind: "post" };

export function kitNextAction(stage: BuildStageId): KitNextAction {
  const i = BUILD_STAGES.indexOf(stage);
  const next = i >= 0 && i < BUILD_STAGES.length - 1 ? BUILD_STAGES[i + 1] : null;
  return next ? { kind: "stage", stage: next } : { kind: "post" };
}

/** 1-based position, for "Step N of 5". */
export function stageNumber(stage: BuildStageId): number {
  return BUILD_STAGES.indexOf(stage) + 1;
}

export const KIT_STAGE_COUNT = BUILD_STAGES.length;

/** The stepper's line for a stage ("Start your résumé", "Aim it at a job"). */
export function stageTitleKey(stage: BuildStageId): string {
  return `workspace.stage.${stage}.title`;
}

/** The stepper's Next label AT a stage ("Next: Strengthen it →" … "Post
 *  my video" on the last one). */
export function nextLabelKey(stage: BuildStageId): string {
  return `workspace.stage.${stage}.next`;
}
