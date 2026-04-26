/**
 * Canonical sourced-people identity layer.
 *
 * `sourced_people` is intentionally separate from the platform's `users`
 * table — these are people we've sourced from external integrations
 * (LinkedIn URLs, GitHub profiles, paid enrichment APIs). They may
 * eventually become hired.video users but the two tables are NOT joined
 * by FK; they're linked at most by email match.
 *
 * `person_identifiers` is the unique-keyed lookup index — one person can
 * have many identifiers (work email, personal email, LinkedIn URL, GitHub
 * handle, etc.) and the resolver hits this table first for a cache check.
 *
 * `person_sources` is the provenance log: every payload from every
 * provider, kept verbatim for audit, with a stale_at TTL.
 *
 * `enrichment_cache` underpins the cache-first resolver — keyed on a hash
 * of the input query so we never store raw email addresses on the index.
 */

import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { integrations } from "./integrations.js";

export const sourcedPeople = pgTable("sourced_people", {
  id:                            uuid("id").primaryKey().defaultRandom(),
  fullName:                      varchar("full_name", { length: 255 }),
  givenName:                     varchar("given_name", { length: 128 }),
  familyName:                    varchar("family_name", { length: 128 }),
  primaryEmail:                  varchar("primary_email", { length: 320 }),
  primaryEmailHash:              varchar("primary_email_hash", { length: 64 }),
  primaryLinkedinUrl:            varchar("primary_linkedin_url", { length: 512 }),
  primaryGithubLogin:            varchar("primary_github_login", { length: 128 }),
  currentTitle:                  varchar("current_title", { length: 255 }),
  currentCompany:                varchar("current_company", { length: 255 }),
  location:                      varchar("location", { length: 255 }),
  countryCode:                   varchar("country_code", { length: 2 }),
  primarySourceIntegrationId:    uuid("primary_source_integration_id").references(() => integrations.id, { onDelete: "set null" }),
  // Reconciliation with the platform `users` table.
  linkedUserId:                  uuid("linked_user_id"),
  mergeStatus:                   varchar("merge_status", { length: 20 }).notNull().default("unclaimed"),
  mergeCandidateUserId:          uuid("merge_candidate_user_id"),
  mergeConfidence:               integer("merge_confidence"),
  mergeDetectedAt:               timestamp("merge_detected_at", { withTimezone: true }),
  mergeResolvedAt:               timestamp("merge_resolved_at", { withTimezone: true }),
  mergeResolvedBy:               uuid("merge_resolved_by"),
  isRedacted:                    boolean("is_redacted").notNull().default(false),
  redactedAt:                    timestamp("redacted_at", { withTimezone: true }),
  redactionReason:               varchar("redaction_reason", { length: 64 }),
  createdAt:                     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:                     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sourced_people_email_hash_idx").on(t.primaryEmailHash),
  index("sourced_people_linkedin_idx").on(t.primaryLinkedinUrl),
  index("sourced_people_github_idx").on(t.primaryGithubLogin),
  index("sourced_people_linked_user_idx").on(t.linkedUserId),
  index("sourced_people_merge_status_idx").on(t.mergeStatus),
  index("sourced_people_merge_candidate_idx").on(t.mergeCandidateUserId),
]);

export const sourcedPersonMergeLog = pgTable("sourced_person_merge_log", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  personId:            uuid("person_id").notNull().references(() => sourcedPeople.id, { onDelete: "cascade" }),
  candidateUserId:     uuid("candidate_user_id"),
  action:              varchar("action", { length: 24 }).notNull(),
  confidence:          integer("confidence"),
  matchedIdentifiers:  jsonb("matched_identifiers").notNull().default([] as any),
  performedBy:         uuid("performed_by"),
  notes:               text("notes"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sourced_person_merge_log_person_idx").on(t.personId),
  index("sourced_person_merge_log_user_idx").on(t.candidateUserId),
]);

export type SourcedPersonMergeLogRow = typeof sourcedPersonMergeLog.$inferSelect;
export type SourcedPersonMergeLogInsert = typeof sourcedPersonMergeLog.$inferInsert;

export const personIdentifiers = pgTable("person_identifiers", {
  id:               uuid("id").primaryKey().defaultRandom(),
  personId:         uuid("person_id").notNull().references(() => sourcedPeople.id, { onDelete: "cascade" }),
  identifierType:   varchar("identifier_type", { length: 32 }).notNull(),
  identifierValue:  varchar("identifier_value", { length: 512 }).notNull(),
  isVerified:       boolean("is_verified").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("person_identifiers_unique_idx").on(t.identifierType, t.identifierValue),
  index("person_identifiers_person_idx").on(t.personId),
]);

export const personSources = pgTable("person_sources", {
  id:                uuid("id").primaryKey().defaultRandom(),
  personId:          uuid("person_id").notNull().references(() => sourcedPeople.id, { onDelete: "cascade" }),
  integrationId:     uuid("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
  payload:           jsonb("payload").notNull().default({} as any),
  fetchedAt:         timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  staleAt:           timestamp("stale_at", { withTimezone: true }),
}, (t) => [
  index("person_sources_person_idx").on(t.personId),
  index("person_sources_integration_idx").on(t.integrationId),
  index("person_sources_stale_idx").on(t.staleAt),
]);

export const enrichmentCache = pgTable("enrichment_cache", {
  id:               uuid("id").primaryKey().defaultRandom(),
  queryKey:         varchar("query_key", { length: 64 }).notNull(),
  integrationId:    uuid("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
  personId:         uuid("person_id").references(() => sourcedPeople.id, { onDelete: "set null" }),
  payload:          jsonb("payload").notNull().default({} as any),
  expiresAt:        timestamp("expires_at", { withTimezone: true }),
  hits:             integer("hits").notNull().default(0),
  lastHitAt:        timestamp("last_hit_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("enrichment_cache_unique_idx").on(t.queryKey, t.integrationId),
  index("enrichment_cache_expires_idx").on(t.expiresAt),
]);

export type SourcedPersonRow = typeof sourcedPeople.$inferSelect;
export type SourcedPersonInsert = typeof sourcedPeople.$inferInsert;
export type PersonIdentifierRow = typeof personIdentifiers.$inferSelect;
export type PersonIdentifierInsert = typeof personIdentifiers.$inferInsert;
export type PersonSourceRow = typeof personSources.$inferSelect;
export type PersonSourceInsert = typeof personSources.$inferInsert;
export type EnrichmentCacheRow = typeof enrichmentCache.$inferSelect;
export type EnrichmentCacheInsert = typeof enrichmentCache.$inferInsert;
