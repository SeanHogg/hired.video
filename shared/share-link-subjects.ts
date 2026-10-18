/**
 * Single source of truth for the polymorphic `share_links.subject_type`
 * discriminator (W3-A, migration 0583). One row in `share_links` is one
 * tokenised link that opens a subject to someone outside its owner's
 * workspace; the subject type says what the link opens and what
 * `subject_id` points at:
 *
 *   candidate_resume  → candidate_resumes.id  (redacted + branded résumé, gap #99)
 *   pitch_deck        → pitch_decks.id        (recruiter pitch deck, gap #99)
 *   pipeline_job      → job_items.id          (hiring-manager kanban portal)
 *   studio_review     → studio_projects.id    (studio review link, gap #145)
 *   reference_packet  → users.id              (the owner's NDA-gated references, #1677)
 *   game_play         → studio_projects.id    (game friend-invite, gap #1637)
 *
 * The DB CHECK constraint `share_links_subject_type_check` is built from
 * this list (api/src/db/schema/shareLinks.ts); adding a kind here is the
 * only registry edit needed, plus its subject table in
 * SHARE_LINK_SUBJECT_TABLES (same schema file) and an AFTER DELETE trigger
 * on that table in a new migration (pattern: 0650_share_links_delete_triggers).
 */
export const SHARE_LINK_SUBJECT_TYPES = [
  "candidate_resume",
  "pitch_deck",
  "pipeline_job",
  "studio_review",
  "reference_packet",
  "game_play",
] as const;

export type ShareLinkSubjectType = (typeof SHARE_LINK_SUBJECT_TYPES)[number];
