/**
 * Integrations registry.
 *
 * `integrations` is the single source of truth for both system-shipped
 * providers (PeopleDataLabs, GitHub, etc.) and creator-built ones. The
 * `kind` column differentiates them; everything else (capabilities,
 * enable/disable) is shared.
 *
 * The never-used `integration_credentials` and `integration_runs` tables
 * were archived (moved to the `archive` schema) by migration 0545.
 */

import {
  pgTable, uuid, text, varchar, integer, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";

export const integrations = pgTable("integrations", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  slug:                   varchar("slug", { length: 64 }).notNull().unique(),
  displayName:            varchar("display_name", { length: 128 }).notNull(),
  kind:                   varchar("kind", { length: 16 }).notNull().default("system"),
  category:               varchar("category", { length: 32 }).notNull(),
  pricingModel:           varchar("pricing_model", { length: 16 }).notNull().default("paid"),
  costPerCallCents:       integer("cost_per_call_cents").notNull().default(0),
  description:            text("description"),
  homepageUrl:            text("homepage_url"),
  docsUrl:                text("docs_url"),
  configSchema:           jsonb("config_schema").notNull().default({} as any),
  capabilities:           jsonb("capabilities").notNull().default({} as any),
  enabled:                boolean("enabled").notNull().default(false),
  reviewStatus:           varchar("review_status", { length: 16 }).notNull().default("approved"),
  reviewedBy:             uuid("reviewed_by"),
  reviewedAt:             timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason:        text("rejection_reason"),
  ownerUserId:            uuid("owner_user_id"),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("integrations_kind_enabled_idx").on(t.kind, t.enabled),
  index("integrations_category_idx").on(t.category),
  index("integrations_owner_idx").on(t.ownerUserId),
  index("integrations_review_status_idx").on(t.reviewStatus),
]);

export type IntegrationRow = typeof integrations.$inferSelect;
export type IntegrationInsert = typeof integrations.$inferInsert;
