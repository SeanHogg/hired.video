/**
 * The kit journey, Create → Promote, as data. The stepper renders these in
 * order; each AI Tool says which stage it belongs to (`buildStage` on its
 * TOOLS_CATALOG entry), so a new tool lands in a stage by adding one field —
 * never a new branch in the page. Pure: no imports, safe for the catalog to
 * reference.
 */
export const BUILD_STAGES = ["create", "strengthen", "target", "video", "promote"] as const;

export type BuildStageId = (typeof BUILD_STAGES)[number];

/** What sits in the rail beside the résumé page, by stage: the Story list
 *  (which section feeds which video scene) at the two stages that shape the
 *  video, the job match at Target. Other stages give the page the room. */
export type ResumeRail = "story" | "jobMatch";

const RESUME_RAIL: Partial<Record<BuildStageId, ResumeRail>> = {
  create: "story",
  target: "jobMatch",
  video: "story",
};

export function resumeRailFor(stage: BuildStageId): ResumeRail | null {
  return RESUME_RAIL[stage] ?? null;
}

/** i18n keys for a stage: its name and its one-line purpose. (What the AI
 *  does at a stage is stage-plan.ts.) */
export function stageKeys(stage: BuildStageId) {
  const base = `build.stages.${stage}`;
  return {
    label: `${base}.label`,
    hint: `${base}.hint`,
  } as const;
}
