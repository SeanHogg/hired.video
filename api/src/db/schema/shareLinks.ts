/**
 * share_links — ONE table for every tokenised share link (W3-A, migration
 * 0583). Replaced six per-kind tables, archived by 0588:
 *   candidate_resume_shares, pitch_deck_shares, pipeline_share_links,
 *   studio_review_links, reference_shares, game_play_invites.
 *
 * `subject_type` (registry: shared/share-link-subjects.ts) says what the link
 * opens; `subject_id` is that row's id. Every old table stored its token RAW,
 * so `share_token` is the raw token copied verbatim — every issued URL keeps
 * resolving and every lookup is a plain equality on the unique index.
 *
 * Kind-specific columns are nullable and only meaningful for their kind:
 *   candidate_resume → company_id, redaction_profile_id, whitelabel_tenant_id
 *   pitch_deck       → recipient_name
 *   reference_packet → contact_ids, require_nda, nda_accepted_at, first_viewed_at
 *   game_play        → restrict_to_user_id, max_uses, joined_count
 * `revoked_at` replaces the old `is_active` flag (is_active = revoked_at IS NULL).
 *
 * A polymorphic subject has no FK, so a deleted subject's links are removed
 * by the daily retention sweep (SHARE_LINK_ORPHAN_SQL below); until then a
 * token lookup still 404s because every resolver loads its subject.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { whitelabelTenants } from "./whitelabel.js";
import { redactionProfiles } from "./candidates.js";
import {
  SHARE_LINK_SUBJECT_TYPES,
  type ShareLinkSubjectType,
} from "../../../../shared/share-link-subjects.js";

/** `'candidate_resume', 'pitch_deck', …` — the CHECK list, from the shared registry. */
const SHARE_LINK_SUBJECT_TYPES_SQL = sql.raw(SHARE_LINK_SUBJECT_TYPES.map((v) => `'${v}'`).join(", "));

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** Raw URL token (never hashed — see header). Unique across every kind. */
    shareToken: text("share_token").notNull(),
    label: varchar("label", { length: 255 }),
    recipientName: varchar("recipient_name", { length: 255 }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").default(0).notNull(),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    // candidate_resume
    companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
    redactionProfileId: uuid("redaction_profile_id").references(() => redactionProfiles.id, {
      onDelete: "set null",
    }),
    whitelabelTenantId: uuid("whitelabel_tenant_id").references(() => whitelabelTenants.id, {
      onDelete: "set null",
    }),
    // reference_packet
    contactIds: jsonb("contact_ids").$type<string[]>(),
    requireNda: boolean("require_nda"),
    ndaAcceptedAt: timestamp("nda_accepted_at", { withTimezone: true }),
    // game_play
    restrictToUserId: uuid("restrict_to_user_id").references(() => users.id, { onDelete: "set null" }),
    maxUses: integer("max_uses"),
    joinedCount: integer("joined_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_share_links_subject").on(t.subjectType, t.subjectId, t.createdAt.desc().nullsFirst()),
    uniqueIndex("uq_share_links_share_token").on(t.shareToken),
    index("idx_share_links_created_by").on(t.createdBy),
    index("idx_share_links_company_id").on(t.companyId),
    index("idx_share_links_redaction_profile_id").on(t.redactionProfileId),
    index("idx_share_links_whitelabel_tenant_id").on(t.whitelabelTenantId),
    index("idx_share_links_restrict_to_user_id").on(t.restrictToUserId),
    check("share_links_subject_type_check", sql`${t.subjectType} IN (${SHARE_LINK_SUBJECT_TYPES_SQL})`),
  ],
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;

/** The table each subject type's `subject_id` points at. */
export const SHARE_LINK_SUBJECT_TABLES: Readonly<Record<ShareLinkSubjectType, string>> = {
  candidate_resume: "candidate_resumes",
  pitch_deck: "pitch_decks",
  pipeline_job: "job_items",
  studio_review: "studio_projects",
  reference_packet: "users",
  game_play: "studio_projects",
};

/** Static SQL predicate matching share links whose subject no longer exists
 *  (stands in for the per-kind FK cascades the old tables had). Literal
 *  table names from the map above only — no user input. */
export const SHARE_LINK_ORPHAN_SQL = SHARE_LINK_SUBJECT_TYPES.map(
  (type) =>
    `(share_links.subject_type = '${type}' AND NOT EXISTS ` +
    `(SELECT 1 FROM ${SHARE_LINK_SUBJECT_TABLES[type]} s WHERE s.id = share_links.subject_id))`,
).join(" OR ");
