/**
 * Community Resources — location-scoped, user-submitted directory of
 * job-seeker / employer help (government agencies, unemployment offices,
 * job boards, training, legal aid, veterans services …).
 *
 * Keyed by lowercase geo slugs (`country_code` / `state_code` / `city_slug`)
 * so seeds and the /in/:country/:state route can address rows without
 * threading numeric location ids. Submissions land `pending`; a SuperAdmin
 * approves before they render publicly (mirrors the article review queue).
 *
 * Shared enums live in `shared/community-resources.ts`.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const communityResources = pgTable(
  "community_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null for seeded/system rows; set to the submitter for user entries so
    // points/badges + the flag owner-resolver can attribute them.
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    // At least one of url / phone is required at the validator layer.
    url: text("url"),
    phone: varchar("phone", { length: 64 }),
    category: varchar("category", { length: 40 }).notNull(),
    audience: varchar("audience", { length: 16 }).notNull(),
    countryCode: varchar("country_code", { length: 8 }).notNull(),
    stateCode: varchar("state_code", { length: 16 }),
    citySlug: varchar("city_slug", { length: 96 }),
    // Canonical geo ids resolved from the slugs on submit (#1833) so an
    // abbrev-vs-full-name / non-US slug mismatch can't hide a row from the
    // /in directory query. Nullable: legacy rows + un-resolvable geo fall back
    // to slug matching. `countries.id` is serial (int); state/city are uuid.
    countryGeoId: integer("country_geo_id"),
    stateGeoId: uuid("state_geo_id"),
    cityGeoId: uuid("city_geo_id"),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Public directory query: approved rows for a given country/state.
    index("idx_community_resources_geo").on(t.countryCode, t.stateCode, t.status),
    // Admin queue: pending first, newest first.
    index("idx_community_resources_status").on(t.status, t.createdAt),
    // "My submissions" lookup.
    index("idx_community_resources_submitter").on(t.submittedBy, t.createdAt),
    index("idx_community_resources_geo_ids").on(t.countryGeoId, t.stateGeoId, t.status),
    check("community_resources_status_check", sql`${t.status} IN ('pending','approved','rejected')`),
    index("idx_community_resources_reviewed_by").on(t.reviewedBy),
  ],
);

export type CommunityResource = typeof communityResources.$inferSelect;
export type NewCommunityResource = typeof communityResources.$inferInsert;
