// whitelabel.ts — White-label tenant schema (#75, #79, #80)

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const whitelabelTenants = pgTable("whitelabel_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Unique subdomain (e.g. "acme-staffing" → acme-staffing.hired.video)
  subdomain: varchar("subdomain", { length: 63 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  // "agency" | "university" | "staffing_firm" | "bootcamp"
  tenantType: varchar("tenant_type", { length: 50 }).default("agency").notNull(),
  // Branding
  primaryColor: varchar("primary_color", { length: 20 }).default("#2563eb"),
  logoUrl: text("logo_url"),
  heroHeadline: varchar("hero_headline", { length: 200 }),
  website: text("website"),
  contactEmail: varchar("contact_email", { length: 255 }),
  // Billing
  planTier: varchar("plan_tier", { length: 50 }).default("starter").notNull(),
  monthlyFeeUsd: numeric("monthly_fee_usd").default("499"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Custom domain support (e.g. careers.acme.com)
  customDomain: varchar("custom_domain", { length: 255 }).unique(),
  // Extra config (feature flags, SSO settings, etc.)
  config: jsonb("config").default({}).$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WhitelabelTenant = typeof whitelabelTenants.$inferSelect;
export type NewWhitelabelTenant = typeof whitelabelTenants.$inferInsert;
