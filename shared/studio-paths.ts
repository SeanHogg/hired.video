/**
 * Studio entry paths every layer can link to (frontend, API onboarding tasks,
 * shared registries). Entity create / edit happens in the studio (#1915): a
 * NEW job post or company page starts from its document input template. The
 * frontend's `studioNewEntityHref` (lib/studio/studio-authoring.ts) resolves
 * to these same paths (asserted by its test).
 *
 * Pure leaf module (no imports).
 */

/** Start a new studio draft from a catalog input template. */
export function studioCreatePath(contentTemplateId: string): string {
  return `/studio?contentTemplate=${encodeURIComponent(contentTemplateId)}`;
}

/** A new job posting on the document canvas. */
export const STUDIO_NEW_JOB_PATH = studioCreatePath("job_doc");

/** A new company page on the document canvas. */
export const STUDIO_NEW_COMPANY_PATH = studioCreatePath("company_doc");
