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
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
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
