/**
 * billing_addresses — the user's saved billing / mailing address (mig 0631).
 *
 * Billing-domain home for the address that used to live as nine `billing_*`
 * columns on `user_profiles`. One row per user. Shape mirrors
 * `BillingAddressSchema` in shared/billing-address.ts; per-field columns so
 * each can be queried + validated independently. Read/written only through
 * repositories/billingAddressRepository.ts (Checkout, Settings → Billing,
 * payment-provider pre-fill, GDPR erasure).
 */
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const billingAddresses = pgTable("billing_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  // UNIQUE doubles as the FK index (leading column = user_id).
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 160 }),
  company: varchar("company", { length: 160 }),
  line1: varchar("line1", { length: 200 }),
  line2: varchar("line2", { length: 200 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 2 }),
  phone: varchar("phone", { length: 40 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BillingAddressRow = typeof billingAddresses.$inferSelect;
export type NewBillingAddressRow = typeof billingAddresses.$inferInsert;
