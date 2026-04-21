// candidates.ts — Agency-owned candidate resumes, redaction profiles,
// tokenized shares, and pitch decks. Backs the recruiting-platform MVP
// (migration 0027). All tables are company-scoped and PRIVATE to the
// agency that owns them; row-level filtering is enforced in the route
// layer via the requesting user's `company_id`.

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
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { talentPoolCandidates } from "./recruiter.js";
import { resumeInformation } from "./resumes.js";
import { jobItems } from "./jobs.js";
import { whitelabelTenants } from "./whitelabel.js";

// ─── candidate_resumes ───────────────────────────────────────────────────────
// Agency-owned copy of a candidate's resume. Variant tree via parent_id; at
// most one active variant per (company, talent_pool_candidate) via a partial
// unique index. `linked_user_id` is populated after the candidate signs up
// and links their own account; `merged_from_user_resume_id` captures the
// ResumeConsolidator merge source.

export const candidateResumes = pgTable(
  "candidate_resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    importedByUserId: uuid("imported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    talentPoolCandidateId: uuid("talent_pool_candidate_id").references(
      () => talentPoolCandidates.id,
      { onDelete: "set null" },
    ),
    linkedUserId: uuid("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    mergedFromUserResumeId: uuid("merged_from_user_resume_id").references(
      () => resumeInformation.id,
      { onDelete: "set null" },
    ),
    parentId: uuid("parent_id").references((): AnyPgColumn => candidateResumes.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").default(false).notNull(),
    label: varchar("label", { length: 255 }),
    content: jsonb("content").default({}).notNull(),
    recruiterNotes: text("recruiter_notes"),
    metadata: jsonb("metadata").default({}).notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("candidate_resumes_company_id_idx").on(table.companyId),
    index("candidate_resumes_talent_pool_candidate_id_idx").on(table.talentPoolCandidateId),
    index("candidate_resumes_linked_user_id_idx").on(table.linkedUserId),
    index("candidate_resumes_parent_id_idx").on(table.parentId),
    uniqueIndex("candidate_resumes_active_per_candidate_unique")
      .on(table.companyId, table.talentPoolCandidateId)
      .where(sql`is_active = true AND talent_pool_candidate_id IS NOT NULL`),
  ],
);

export type CandidateResume = typeof candidateResumes.$inferSelect;
export type NewCandidateResume = typeof candidateResumes.$inferInsert;

// ─── redaction_profiles ──────────────────────────────────────────────────────
// Reusable per-company PII-stripping rule set. One default per company
// (partial unique index). Field-level toggles + extra dotted paths.

export const redactionProfiles = pgTable(
  "redaction_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false).notNull(),
    hideName: boolean("hide_name").default(true).notNull(),
    hideEmail: boolean("hide_email").default(true).notNull(),
    hidePhone: boolean("hide_phone").default(true).notNull(),
    hideAddress: boolean("hide_address").default(true).notNull(),
    hideLinkedin: boolean("hide_linkedin").default(true).notNull(),
    hideOtherUrls: boolean("hide_other_urls").default(false).notNull(),
    hideAvatar: boolean("hide_avatar").default(true).notNull(),
    replacementName: varchar("replacement_name", { length: 100 })
      .default("Candidate")
      .notNull(),
    hideCompanyNames: boolean("hide_company_names").default(false).notNull(),
    hideSchoolNames: boolean("hide_school_names").default(false).notNull(),
    extraStripPaths: jsonb("extra_strip_paths").default([]).notNull().$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("redaction_profiles_company_id_idx").on(table.companyId),
    uniqueIndex("redaction_profiles_company_default_unique")
      .on(table.companyId)
      .where(sql`is_default = true`),
  ],
);

export type RedactionProfile = typeof redactionProfiles.$inferSelect;
export type NewRedactionProfile = typeof redactionProfiles.$inferInsert;

// ─── candidate_resume_shares ─────────────────────────────────────────────────
// Tokenized public share link of a redacted + branded candidate resume.
// `whitelabel_tenant_id` reuses the existing brand-kit table
// (logo, primaryColor, subdomain). NULL = no branding overlay applied.

export const candidateResumeShares = pgTable(
  "candidate_resume_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    candidateResumeId: uuid("candidate_resume_id")
      .notNull()
      .references(() => candidateResumes.id, { onDelete: "cascade" }),
    redactionProfileId: uuid("redaction_profile_id").references(
      () => redactionProfiles.id,
      { onDelete: "set null" },
    ),
    whitelabelTenantId: uuid("whitelabel_tenant_id").references(
      () => whitelabelTenants.id,
      { onDelete: "set null" },
    ),
    sharedByUserId: uuid("shared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("candidate_resume_shares_company_id_idx").on(table.companyId),
    index("candidate_resume_shares_candidate_resume_id_idx").on(table.candidateResumeId),
    index("candidate_resume_shares_token_idx").on(table.shareToken),
  ],
);

export type CandidateResumeShare = typeof candidateResumeShares.$inferSelect;
export type NewCandidateResumeShare = typeof candidateResumeShares.$inferInsert;

// ─── pitch_decks ─────────────────────────────────────────────────────────────
// Recruiter-authored collection of redacted/branded candidates, optionally
// tied to one open role. The deck-level redaction profile is inherited by
// every slide unless overridden on pitch_deck_candidates.

export const pitchDecks = pgTable(
  "pitch_decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
    whitelabelTenantId: uuid("whitelabel_tenant_id").references(
      () => whitelabelTenants.id,
      { onDelete: "set null" },
    ),
    redactionProfileId: uuid("redaction_profile_id").references(
      () => redactionProfiles.id,
      { onDelete: "set null" },
    ),
    // draft | sent | archived
    status: varchar("status", { length: 50 }).default("draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pitch_decks_company_id_idx").on(table.companyId),
    index("pitch_decks_job_id_idx").on(table.jobId),
  ],
);

export type PitchDeck = typeof pitchDecks.$inferSelect;
export type NewPitchDeck = typeof pitchDecks.$inferInsert;

// ─── pitch_deck_candidates ───────────────────────────────────────────────────
// Ordered slides referencing candidate resumes. Per-slide redaction override
// is optional; null inherits the deck default.

export const pitchDeckCandidates = pgTable(
  "pitch_deck_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => pitchDecks.id, { onDelete: "cascade" }),
    candidateResumeId: uuid("candidate_resume_id")
      .notNull()
      .references(() => candidateResumes.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").default(0).notNull(),
    redactionProfileId: uuid("redaction_profile_id").references(
      () => redactionProfiles.id,
      { onDelete: "set null" },
    ),
    fitSummary: text("fit_summary"),
    matchScore: integer("match_score"),
    recruiterNotes: text("recruiter_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pitch_deck_candidates_deck_id_idx").on(table.deckId),
    uniqueIndex("pitch_deck_candidates_deck_candidate_unique").on(
      table.deckId,
      table.candidateResumeId,
    ),
  ],
);

export type PitchDeckCandidate = typeof pitchDeckCandidates.$inferSelect;
export type NewPitchDeckCandidate = typeof pitchDeckCandidates.$inferInsert;

// ─── pitch_deck_shares ───────────────────────────────────────────────────────
// Tokenized public share link for a pitch deck. Same pattern as
// candidate_resume_shares. Reviewer feedback capture (comments, narrow-down)
// is gap #184 (week-2 / roadmap) and does not live on this table yet.

export const pitchDeckShares = pgTable(
  "pitch_deck_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => pitchDecks.id, { onDelete: "cascade" }),
    sharedByUserId: uuid("shared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
    recipientName: varchar("recipient_name", { length: 255 }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pitch_deck_shares_deck_id_idx").on(table.deckId),
    index("pitch_deck_shares_token_idx").on(table.shareToken),
  ],
);

export type PitchDeckShare = typeof pitchDeckShares.$inferSelect;
export type NewPitchDeckShare = typeof pitchDeckShares.$inferInsert;
