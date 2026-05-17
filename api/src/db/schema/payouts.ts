/**
 * Payouts — three tables that together form the outbound side of the money
 * pipeline. Inbound (charging customers) lives in billing.ts / payment.ts.
 *
 *   payout_profiles        — user-level tax + onboarded payout rail
 *                            (one row per user, taxes follow the person)
 *   payout_ledger_entries  — append-only double-entry ledger; balance is
 *                            SUM(amount_cents). Replaces the old loose
 *                            `creator_profiles.total_earned_cents` counter
 *                            that nothing decremented.
 *   payouts                — one row per outbound disbursement attempt;
 *                            the release worker (next pass) drives the
 *                            lifecycle from queued -> settled / failed
 *                            via provider webhook callbacks.
 *
 * Encryption note: the legacy `tax_id_encrypted` TEXT column is kept
 * NULLable for one deploy so in-flight plaintext doesn't vanish during
 * backfill. New writes land in `tax_id_ciphertext` + `tax_id_nonce`
 * (AES-GCM, KMS-wrapped key id captured in `tax_id_kms_key_id` so future
 * key rotation can find rows wrapped under the old key).
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  customType,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// Drizzle ships text + json column helpers but bytea has to be declared
// explicitly. Used for the AES-GCM ciphertext + per-row 12-byte nonce on
// payout_profiles — both opaque to the application beyond
// encrypt/decrypt round-tripping in services/payout/encryption.ts.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const payoutProfiles = pgTable(
  "payout_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),

    entityType: varchar("entity_type", { length: 16 }),
    legalName: varchar("legal_name", { length: 255 }),
    businessLegalName: varchar("business_legal_name", { length: 255 }),

    taxResidencyCountry: varchar("tax_residency_country", { length: 2 }),
    taxIdType: varchar("tax_id_type", { length: 16 }),
    taxIdLast4: varchar("tax_id_last4", { length: 4 }),
    // Legacy plaintext column — write-side removed, kept NULLable for one
    // deploy so an in-flight value survives the ciphertext backfill window.
    taxIdEncrypted: text("tax_id_encrypted"),
    taxIdCiphertext: bytea("tax_id_ciphertext"),
    taxIdNonce: bytea("tax_id_nonce"),
    taxIdKmsKeyId: text("tax_id_kms_key_id"),
    taxFormType: varchar("tax_form_type", { length: 16 }),
    taxFormSubmittedAt: timestamp("tax_form_submitted_at", { withTimezone: true }),
    taxFormDocumentRef: text("tax_form_document_ref"),

    addressLine1: varchar("address_line1", { length: 255 }),
    addressLine2: varchar("address_line2", { length: 255 }),
    addressCity: varchar("address_city", { length: 120 }),
    addressRegion: varchar("address_region", { length: 120 }),
    addressPostalCode: varchar("address_postal_code", { length: 20 }),
    addressCountry: varchar("address_country", { length: 2 }),

    payoutProvider: varchar("payout_provider", { length: 32 }),
    payoutAccountId: text("payout_account_id"),
    payoutOnboardedAt: timestamp("payout_onboarded_at", { withTimezone: true }),
    payoutCountry: varchar("payout_country", { length: 2 }),
    payoutCurrency: varchar("payout_currency", { length: 10 }).default("USD").notNull(),

    // Set true by PayoutOnboardingService.completeSession() — gates whether
    // the release worker will emit `payouts` rows for this user.
    payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),

    // UI hint captured from the provider on onboarding success:
    //   helcim_ach -> { last4, bankName, accountType }
    //   tremendous -> { } (the email itself is the account id)
    accountHint: jsonb("account_hint").$type<{
      last4?: string;
      bankName?: string;
      accountType?: string;
    } | null>(),

    // Per-user override (default 5000 = $50). Lets us soft-launch with a
    // higher floor for specific accounts without changing the env-wide config.
    minPayoutThresholdCents: integer("min_payout_threshold_cents").default(5000).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_payout_profiles_user").on(t.userId),
  ],
);

export type PayoutProfileRow = typeof payoutProfiles.$inferSelect;
export type NewPayoutProfileRow = typeof payoutProfiles.$inferInsert;

// ---------------------------------------------------------------------------
// payout_ledger_entries — append-only double-entry ledger
// ---------------------------------------------------------------------------
export const payoutLedgerEntries = pgTable(
  "payout_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 10 }).default("USD").notNull(),

    // 'accrual' | 'payout' | 'reversal' | 'adjustment'
    kind: varchar("kind", { length: 16 }).notNull(),

    sourceKind: varchar("source_kind", { length: 32 }),
    sourceId: uuid("source_id"),
    sourcePayoutId: uuid("source_payout_id"),

    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_payout_ledger_user_created").on(t.userId, t.createdAt),
    uniqueIndex("uq_payout_ledger_accrual_source")
      .on(t.sourceKind, t.sourceId)
      .where(sql`${t.kind} = 'accrual' AND ${t.sourceId} IS NOT NULL`),
  ],
);

export type PayoutLedgerEntry = typeof payoutLedgerEntries.$inferSelect;
export type NewPayoutLedgerEntry = typeof payoutLedgerEntries.$inferInsert;

// ---------------------------------------------------------------------------
// payouts — one row per outbound disbursement attempt
// ---------------------------------------------------------------------------
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 10 }).default("USD").notNull(),

    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerPayoutId: text("provider_payout_id"),
    providerStatus: varchar("provider_status", { length: 64 }),

    // queued | attempting | sent | settled | failed | reversed
    status: varchar("status", { length: 16 }).default("queued").notNull(),

    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_payouts_user_status").on(t.userId, t.status),
    index("idx_payouts_provider_payout_id")
      .on(t.provider, t.providerPayoutId)
      .where(sql`${t.providerPayoutId} IS NOT NULL`),
  ],
);

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
