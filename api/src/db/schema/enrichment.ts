/**
 * Contact enrichment (#96) — per-attempt upstream provider call audit.
 * Moved from gapExtensions.ts (2026-10-17).
 */
import { pgTable, uuid, text, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// #96 — per-attempt enrichment-provider call audit
// ---------------------------------------------------------------------------
export const enrichmentProviderCalls = pgTable(
  "enrichment_provider_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    targetEmail: text("target_email"),
    targetDomain: text("target_domain"),
    ok: boolean("ok").notNull(),
    httpStatus: integer("http_status"),
    creditsConsumed: integer("credits_consumed").notNull().default(0),
    responseExcerpt: text("response_excerpt"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_enrichment_provider_calls_user").on(t.userId, t.createdAt.desc())],
);

export type EnrichmentProviderCall = typeof enrichmentProviderCalls.$inferSelect;
export type NewEnrichmentProviderCall = typeof enrichmentProviderCalls.$inferInsert;
