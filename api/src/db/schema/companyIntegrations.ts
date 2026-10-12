/**
 * Per-company integration credentials (#1441).
 *
 * One row per (company, provider). Stores OAuth2 access + refresh tokens
 * (encrypted via [services/payout/encryption.ts](../services/payout/encryption.ts) — same AES-GCM helper
 * used for payout-profile bank tokens), the provider's external account
 * ID (QBO realmId, Xero tenantId, Gusto companyUUID, DocuSign accountId),
 * granted scopes, and a sync-status snapshot.
 *
 * The accounting/e-sign connectors at `services/workforce/connectors/*`
 * read from this table at runtime — given a `companyId` + provider name,
 * they decrypt + use the access token, then refresh + re-encrypt when
 * `expires_at` is near.
 */

import { sql } from "drizzle-orm";
import {
  pgTable, uuid, varchar, text, timestamp, jsonb, index, uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const companyIntegrations = pgTable("company_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  // quickbooks | xero | gusto | docusign | helcim | other
  provider: varchar("provider", { length: 32 }).notNull(),
  // connected | disconnected | error
  status: varchar("status", { length: 16 }).default("connected").notNull(),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: jsonb("scopes"),
  externalAccountId: varchar("external_account_id", { length: 255 }),
  connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uniq_company_integrations_company_provider").on(t.companyId, t.provider),
  index("idx_company_integrations_status").on(t.status),
  check("company_integrations_access_token_enc_enc_format_check", sql`${t.accessTokenEnc} IS NULL OR ${t.accessTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.accessTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.accessTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
  check("company_integrations_refresh_token_enc_enc_format_check", sql`${t.refreshTokenEnc} IS NULL OR ${t.refreshTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.refreshTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.refreshTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
]);

export type CompanyIntegration = typeof companyIntegrations.$inferSelect;
export type NewCompanyIntegration = typeof companyIntegrations.$inferInsert;
