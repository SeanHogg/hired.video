/**
 * retained_search_firms — directory of retained executive-search firms
 * (#1675). Distinct from the contingent bidding marketplace
 * (project_bidding_marketplace): retained search = paid upfront,
 * exclusive engagement, used for C-suite / board placements. This is a
 * curated reference directory the senior-exec audience browses to find
 * the right firm; it is NOT user-generated.
 *
 * Seeded with well-known firms in migration 0172; admins can extend.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const retainedSearchFirms = pgTable(
  "retained_search_firms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description"),
    website: varchar("website", { length: 255 }),
    /** Contact entry point for an intro request (email or form URL). */
    contactUrl: varchar("contact_url", { length: 255 }),
    logoUrl: varchar("logo_url", { length: 255 }),
    /** Editorial tier: 'global' | 'boutique' | 'regional'. */
    tier: varchar("tier", { length: 24 }).default("global").notNull(),
    /** Functional / industry specialties (e.g. ["technology","financial-services"]). */
    specialties: jsonb("specialties").$type<string[]>().default([]),
    /** ISO2 regions the firm operates in (drives launch-market filtering). */
    regions: jsonb("regions").$type<string[]>().default([]),
    /** Display order within a tier (lower = first). */
    sortOrder: integer("sort_order").default(100).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("retained_search_firms_slug_uniq").on(t.slug),
    index("retained_search_firms_active_tier_idx").on(t.isActive, t.tier, t.sortOrder),
  ],
);

export type RetainedSearchFirm = typeof retainedSearchFirms.$inferSelect;
export type NewRetainedSearchFirm = typeof retainedSearchFirms.$inferInsert;
