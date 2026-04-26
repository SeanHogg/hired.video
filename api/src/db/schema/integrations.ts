/**
 * Integrations registry + execution log.
 *
 * `integrations` is the single source of truth for both system-shipped
 * providers (PeopleDataLabs, GitHub, etc.) and creator-built ones. The
 * `kind` column differentiates them; everything else (capabilities,
 * enable/disable, run history) is shared.
 *
 * `integration_credentials` references env-var names rather than secret
 * values — actual API keys live in Cloudflare env / secrets manager and
 * are looked up by name at call time. That way the registry row itself
 * is safe to return to the frontend.
 *
 * `integration_runs` is append-only telemetry. Used by the SuperAdmin
 * dashboard to surface error rates, cost, and cache-hit ratio per
 * provider; also by per-creator analytics for creator integrations.
 */

import {
  pgTable, uuid, text, varchar, integer, boolean, timestamp, jsonb, index, uniqueIndex,
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

export const integrationCredentials = pgTable("integration_credentials", {
  id:               uuid("id").primaryKey().defaultRandom(),
  integrationId:    uuid("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
  envVarName:       varchar("env_var_name", { length: 128 }).notNull(),
  extra:            jsonb("extra").notNull().default({} as any),
  lastVerifiedAt:   timestamp("last_verified_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("integration_credentials_integration_idx").on(t.integrationId),
]);

export const integrationRuns = pgTable("integration_runs", {
  id:               uuid("id").primaryKey().defaultRandom(),
  integrationId:    uuid("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
  userId:           uuid("user_id"),
  kind:             varchar("kind", { length: 16 }).notNull(),
  status:           varchar("status", { length: 24 }).notNull(),
  query:            jsonb("query").notNull().default({} as any),
  result:           jsonb("result"),
  costCents:        integer("cost_cents").notNull().default(0),
  cacheHit:         boolean("cache_hit").notNull().default(false),
  errorMessage:     text("error_message"),
  durationMs:       integer("duration_ms"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("integration_runs_integration_idx").on(t.integrationId),
  index("integration_runs_user_idx").on(t.userId),
  index("integration_runs_created_idx").on(t.createdAt),
]);

export type IntegrationRow = typeof integrations.$inferSelect;
export type IntegrationInsert = typeof integrations.$inferInsert;
export type IntegrationCredentialRow = typeof integrationCredentials.$inferSelect;
export type IntegrationRunRow = typeof integrationRuns.$inferSelect;
export type IntegrationRunInsert = typeof integrationRuns.$inferInsert;
