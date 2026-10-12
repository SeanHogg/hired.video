/**
 * Ad content target (#176) — what a paid placement promotes.
 *
 * Every ads-side row that points at hired.video content names it with the
 * canonical polymorphic pair (api/drizzle/CONVENTIONS.md "Polymorphic
 * references" — the columns are `subject_type` + `subject_id` everywhere,
 * matching `boosts` and `paid_media_campaigns`):
 *
 *   subject_type  one of AD_SUBJECT_TYPES
 *   subject_id    the promoted thing's id
 *
 * Tables carrying the pair since mig 0516: `ads` (any content),
 * `job_boosts` (always 'job', mirrors job_id) and `company_boosts` (always
 * 'company', mirrors company_id). The legacy job_id / company_id FKs stay
 * as the typed cascade anchor until their retirement follow-up.
 *
 * The list is the paid_media_campaigns.subject_type set (mig 0105) plus
 * 'course', so a campaign subject and an ad target share one vocabulary.
 * The 0516 CHECK constraints and the Drizzle schema enumerate exactly these
 * values (guarded by ad-content-target-migration.test.ts).
 *
 * Pure leaf module (no runtime imports).
 */

export const AD_SUBJECT_TYPES = [
  "job",
  "company",
  "article",
  "course",
  "template",
  "video",
  "studio_project",
  "resume",
  "service",
  "voice_clone",
  "event",
  "user_profile",
] as const;
export type AdSubjectType = (typeof AD_SUBJECT_TYPES)[number];

export function isAdSubjectType(value: unknown): value is AdSubjectType {
  return typeof value === "string" && (AD_SUBJECT_TYPES as readonly string[]).includes(value);
}

/** A resolved promotion target. */
export interface AdContentTarget {
  subjectType: AdSubjectType;
  subjectId: string;
}
