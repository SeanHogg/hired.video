/**
 * Payout Profiles — user-level tax / payout entity captured in Settings →
 * Payouts. One row per user (UNIQUE on user_id). Sits above creator_profiles
 * because taxes follow the person, not a per-enrollment row.
 *
 * Encryption: `taxIdEncrypted` is currently plain text as a placeholder.
 * Encryption-at-rest (KMS-wrapped AES-GCM, or full Stripe Connect TIN
 * handoff so we never persist it) MUST land before production payouts ship —
 * tracked as a Gap Register entry.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

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
    taxIdEncrypted: text("tax_id_encrypted"),
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

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_payout_profiles_user").on(t.userId),
  ],
);

export type PayoutProfileRow = typeof payoutProfiles.$inferSelect;
export type NewPayoutProfileRow = typeof payoutProfiles.$inferInsert;
