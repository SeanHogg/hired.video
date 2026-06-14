import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { SEAT_PRICE_CENTS } from "../../../../shared/pricing.js";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  priceMonthly: numeric("price_monthly").notNull(),
  priceYearly: numeric("price_yearly"),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  features: jsonb("features").default([]),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // SET NULL (was RESTRICT) so a tier can be deprecated without the
  // archived subscription rows blocking the delete — migration 0162.
  planId: uuid("plan_id").references(() => subscriptionPlans.id, { onDelete: "set null" }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  billingInterval: varchar("billing_interval", { length: 20 }).default("monthly").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripePaymentMethodId: text("stripe_payment_method_id").notNull().unique(),
  type: varchar("type", { length: 50 }).notNull(),
  last4: varchar("last4", { length: 4 }),
  brand: varchar("brand", { length: 50 }),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  stripeInvoiceId: text("stripe_invoice_id").unique(),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  total: numeric("total").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  invoicePdfUrl: text("invoice_pdf_url"),
  // #1439 — multi-tenant AR. When an agency invoices its client (workforce
  // back-office), the invoice recipient is the client *company*, not a user.
  // Nullable so SaaS subscription invoices (user-as-buyer) keep their
  // existing semantics unchanged.
  recipientCompanyId: uuid("recipient_company_id"),
  // Workforce derivation links the invoice back to the source timesheet
  // so the reject → unapprove → re-approve cycle can locate the existing
  // invoice instead of double-billing.
  sourceTimesheetId: uuid("source_timesheet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unit_price").notNull(),
  amount: numeric("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Added 2026-05-26 alongside migration 0163 — line items are mutable
  // (qty / price corrections); the schema treated them as immutable.
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  amount: numeric("amount"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RefundRequest = typeof refundRequests.$inferSelect;
export type NewRefundRequest = typeof refundRequests.$inferInsert;

export const billingEvents = pgTable("billing_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeEventId: text("stripe_event_id").unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;

// ─── Employer / company seat-based subscriptions ─────────────────────────────
// One row per company plan. seatCount × pricePerSeatCents = monthly charge.
// Synced with Stripe via stripeSubscriptionId.


export const companySubscriptions = pgTable("company_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }).unique(),
  // Plan tier: "starter" | "team" | "enterprise"
  planTier: varchar("plan_tier", { length: 50 }).default("starter").notNull(),
  seatCount: integer("seat_count").default(1).notNull(),
  // Authorized paid-seat ceiling the owner has explicitly agreed to pay for.
  // The seat soft-cap (#1678) blocks an employee invite that would push
  // committed seats past this until the owner confirms the extra $9.95/seat,
  // which raises the limit. Distinct from seatCount (the count actually
  // billed). Default 0 = the first employee seat needs confirmation.
  seatLimit: integer("seat_limit").default(0).notNull(),
  // Price in cents per seat per month. Canonical default = SEAT_PRICE_CENTS
  // ($9.95) per [[project_pricing_seats]] — every seat is the same Pro price.
  // (Was a stale 4900¢/$49 default that contradicted the product; migration
  // 0320 realigns the DB default + backfills the leftover 4900 rows.)
  pricePerSeatCents: integer("price_per_seat_cents").default(SEAT_PRICE_CENTS).notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  billingInterval: varchar("billing_interval", { length: 20 }).default("monthly").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanySubscription = typeof companySubscriptions.$inferSelect;
export type NewCompanySubscription = typeof companySubscriptions.$inferInsert;
