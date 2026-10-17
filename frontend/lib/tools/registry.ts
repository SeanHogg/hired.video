// Public entry for the AI tool registry. The implementation lives in
// lib/tools/registry/: focused runner modules (runners-*.ts, image.ts,
// job-draft.ts), the catalog data files (catalog-*.ts) concatenated in
// catalog.ts, the commit dispatch (commit.ts) and the coach specs
// (coach-specs.ts). Importers keep using "@/lib/tools/registry".

export { toolRegistry, getTool, getToolsForContext, isInlineRunnable } from "./registry/catalog";
export { getCoachToolSpecs, type CoachToolSpec } from "./registry/coach-specs";
export { commitMutation } from "./registry/commit";
export { buildGenerateImageResult } from "./registry/image";
export { JOB_CREATE_FORM_ID } from "./registry/job-draft";
