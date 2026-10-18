/**
 * Skill evidence — pure helpers shared by the API extractor merge step
 * and the frontend SkillNetwork visualizer. Stays in shared/ because
 * the year-counting and level-inference rules must agree across the
 * wire: the LLM prompt asks the model to assert a level, the merge
 * step verifies/derives it, and the visualizer reads the same number
 * the API persisted. One module, one source of truth.
 *
 * No IO, no Zod parsing — those live in resume.ts. This file is
 * normalisation logic only.
 *
 * This file is a barrel — the implementation lives in ./skill-evidence/:
 *   evidence.ts      — date math, level inference, item lookup, evidence
 *                      math, enrichment/grouping, label → item resolver
 *   graph.ts         — flattened skill view, graph model, evidence dedupe
 *   textBinder.ts    — heuristic text-mention evidence binder
 *   normalize.ts     — skill list dedupe/optimisation
 *   mergeSkills.ts   — manual skill + certificate merge
 *   mergeHelpers.ts  — generic section-item merge helpers (internal)
 *   mergeSections.ts — per-section merges (work, education, …)
 */

export {
  monthsBetween,
  inferLevelFromYears,
  type ResolvedItem,
  listResolvableItems,
  indexResolvedItems,
  computeMonthsForSkill,
  computeYearsForSkill,
  enrichSkillsWithEvidence,
  groupEvidenceBySkill,
  groupEvidenceByItem,
  resolveItemByLabel,
} from "./skill-evidence/evidence.js";
export {
  flattenSkillsForView,
  type SkillGraphNodeSpec,
  type SkillLineageEdge,
  buildSkillGraphModel,
  dedupeSkillEvidence,
} from "./skill-evidence/graph.js";
export { deriveEvidenceFromText } from "./skill-evidence/textBinder.js";
export { type OptimizableSkill, dedupeAndOptimizeSkills } from "./skill-evidence/normalize.js";
export { mergeSkills, mergeCertificates } from "./skill-evidence/mergeSkills.js";
export {
  mergeWork,
  mergeVolunteer,
  mergeProjects,
  mergeEducation,
  mergeAwards,
  mergePublications,
  mergeInterests,
  mergeLanguages,
  mergeReferences,
} from "./skill-evidence/mergeSections.js";
