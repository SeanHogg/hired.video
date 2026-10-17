/**
 * Single source of truth for the polymorphic `entity_versions.subject_type`
 * discriminator (W3-E, migration 0640). One `entity_versions` row is one
 * snapshot of a document; the subject type says which document table
 * `subject_id` points at and what `payload` holds:
 *
 *   resume          → resume_information.id  payload = the résumé `content` JSON
 *   article         → articles.id            payload = { title, bodyMd, bodyJson }
 *   studio_project  → studio_projects.id     payload = the storyboard JSON
 *
 * Replaces resume_versions, article_versions and studio_project_versions
 * (archived by 0641). The DB CHECK `entity_versions_subject_type_check` is
 * built from this list (api/src/db/schema/entityVersions.ts). Adding a kind:
 * append it here, then add a migration that drops + re-adds the CHECK
 * (push compares CHECKs by name only) and a subject-delete trigger.
 */
export const ENTITY_VERSION_SUBJECT_TYPES = ["resume", "article", "studio_project"] as const;

export type EntityVersionSubjectType = (typeof ENTITY_VERSION_SUBJECT_TYPES)[number];

/** Reviewer-proposed draft lifecycle (résumé feedback #1946) — résumé rows only. */
export const ENTITY_VERSION_PROPOSAL_STATUSES = ["proposed", "accepted", "rejected"] as const;

/** Article snapshot payload — the three article columns a restore writes back. */
export interface ArticleVersionPayload {
  title: string;
  bodyMd: string | null;
  bodyJson: unknown;
}
