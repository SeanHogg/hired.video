/**
 * Polymorphic Lists registry (W3-D2, architecture remediation 2026-10-17).
 * `lists.kind` and `list_items.entity_type` CHECKs (migration 0624) list
 * exactly these values.
 *
 * Recruiter lists / call queues (gap #1360) were folded into `lists` /
 * `list_items` in 0624: they are `kind` `recruiter_list` | `call_queue`,
 * their members are `entity_type` `talent_pool_candidate`. They are served
 * by /api/recruiter/lists and hidden from the generic /api/lists overview.
 */

export const LIST_KINDS = ["custom", "wishlist", "recruiter_list", "call_queue"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

/** Kinds owned by the recruiter CRM surface (/api/recruiter/lists). */
export const RECRUITER_LIST_KINDS = ["recruiter_list", "call_queue"] as const satisfies readonly ListKind[];
export type RecruiterListKind = (typeof RECRUITER_LIST_KINDS)[number];

/** The recruiter API's legacy `kind` vocabulary ↔ stored list kind. */
export const RECRUITER_API_KINDS = ["list", "call_queue"] as const;
export type RecruiterApiKind = (typeof RECRUITER_API_KINDS)[number];

export function recruiterKindToListKind(kind: RecruiterApiKind): RecruiterListKind {
  return kind === "call_queue" ? "call_queue" : "recruiter_list";
}

export function listKindToRecruiterKind(kind: string): RecruiterApiKind {
  return kind === "call_queue" ? "call_queue" : "list";
}

export const LIST_ITEM_ENTITY_TYPES = [
  "person",
  "job",
  "resume",
  "company",
  // A candidate-in-a-job-pipeline (jobPipelineEntries.id). Lets recruiters
  // bookmark a sourced candidate from the kanban without losing the
  // job-context the entry carries (notes, tags, stage history).
  "pipeline_entry",
  // A published course (courses.id) — the course-marketplace wishlist heart.
  "course",
  // A published voice clone (studio_voice_clones.id) — the voice
  // marketplace wishlist heart.
  "voice_clone",
  // A recruiter CRM row (talent_pool_candidates.id) — recruiter list /
  // call-queue members.
  "talent_pool_candidate",
] as const;
export type ListItemEntityType = (typeof LIST_ITEM_ENTITY_TYPES)[number];
