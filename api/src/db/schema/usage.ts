import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { invoices } from "./billing.js";

/**
 * Append-only event log. Every gate/meter call from the ServicesProcessor
 * domain ([api/src/domains/services-processing](../../domains/services-processing))
 * writes one row. The cron and the live "Usage Statement" panel both read by
 * `(user_id, period_start)`.
 *
 * `event_type` is matched against [ENTITLEMENT_CATALOG](../../domains/services-processing/entitlement-catalog.ts)
 * — adding a new metered dimension is an entitlement-catalog change plus one
 * call site, never a schema migration.
 *
 * `quantity` is the unit-of-measure for the event type:
 *   • ai_tokens                    → token count
 *   • everything else (counts)     → 1, or N for batched ops
 */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    plan: text("plan").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(1),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userPeriodIdx: index("usage_ledger_user_period_idx").on(t.userId, t.periodStart, t.eventType),
    periodIdx: index("usage_ledger_period_idx").on(t.periodStart),
    createdAtIdx: index("usage_ledger_created_at_idx").on(t.createdAt),
  }),
);

export type UsageLedgerRow = typeof usageLedger.$inferSelect;
export type NewUsageLedgerRow = typeof usageLedger.$inferInsert;

/**
 * Monthly per-user roll-up snapshot. One row per (user_id, period_start).
 * The current-month row is the live preview the Settings page renders; past
 * months are frozen by the month-close cron.
 */
export const usageStatements = pgTable(
  "usage_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    plan: text("plan").notNull(),
    /** JSONB array of UsageStatementLine. Schema in shared/usage-statement.ts. */
    lines: jsonb("lines").notNull().default([]),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** 'open' | 'closed' | 'voided' */
    status: text("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userPeriodUnique: uniqueIndex("usage_statements_user_period_unique").on(t.userId, t.periodStart),
    userIdx: index("usage_statements_user_idx").on(t.userId, t.periodStart),
    statusPeriodIdx: index("usage_statements_status_period_idx").on(t.status, t.periodEnd),
  }),
);

export type UsageStatementRow = typeof usageStatements.$inferSelect;
export type NewUsageStatementRow = typeof usageStatements.$inferInsert;

/**
 * Per-month invoice — generated for every user, paid or not. The $0 "Free
 * Invoice" the user asked for lands here with `status='free_zero'`. Linked
 * to the closing statement; optionally references the existing payment
 * `invoices` row when a real charge ran.
 */
export const usageInvoices = pgTable(
  "usage_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => usageStatements.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    plan: text("plan").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** 'free_zero' | 'pending' | 'paid' | 'failed' | 'refunded' */
    status: text("status").notNull().default("pending"),
    paymentInvoiceId: uuid("payment_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userPeriodUnique: uniqueIndex("usage_invoices_user_period_unique").on(t.userId, t.periodStart),
    userIdx: index("usage_invoices_user_idx").on(t.userId, t.periodStart),
    statusIdx: index("usage_invoices_status_idx").on(t.status, t.createdAt),
    numberUnique: uniqueIndex("usage_invoices_number_unique").on(t.invoiceNumber),
  }),
);

export type UsageInvoiceRow = typeof usageInvoices.$inferSelect;
export type NewUsageInvoiceRow = typeof usageInvoices.$inferInsert;
