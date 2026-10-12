/**
 * Platform pricing — single-row config table that holds runtime-editable
 * subscription prices. Edited via the SuperAdmin /admin/pricing page; read by
 * the public /pricing page and by api/src/routes/billing.ts in place of the
 * old hardcoded SEAT_PRICES map.
 *
 * Single-row pattern: the table has at most one row, identified by the
 * literal id `'singleton'`. Reads use a no-row fallback to the `shared/pricing.ts`
 * defaults so the system keeps working before the row is seeded.
 */
import { pgTable, varchar, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const platformPricing = pgTable("platform_pricing", {
  id: varchar("id", { length: 32 }).primaryKey(), // always 'singleton'
  proMonthlyCents: integer("pro_monthly_cents").notNull(),
  proYearlyCents: integer("pro_yearly_cents").notNull(),
  /** Per-additional-seat price for company team plans ($9.95,
   *  SEAT_PRICE_CENTS) — independent of the Pro price. */
  seatPriceCents: integer("seat_price_cents").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

export type PlatformPricing = typeof platformPricing.$inferSelect;
export type NewPlatformPricing = typeof platformPricing.$inferInsert;

export const PLATFORM_PRICING_SINGLETON_ID = "singleton";
