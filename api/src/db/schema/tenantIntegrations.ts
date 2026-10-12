/**
 * Tenant integrations — generic, self-serve API-key vendor registry (#261).
 *
 * The long tail of "paste a credential for vendor X" that doesn't warrant a
 * custom OAuth connector (those live in `company_integrations`). A workspace
 * admin pastes a slug + provider name + the raw secret; the secret is
 * AES-GCM enveloped via [services/payout/encryption.ts](../../services/payout/encryption.ts)
 * — the SAME helper used for payout-profile tax IDs — and only the
 * ciphertext + per-row nonce + key-version label are persisted. The raw
 * credential is NEVER stored or returned; the API surfaces only
 * provider / slug / is_active / a non-secret `last4` hint.
 *
 * Ownership mirrors the other tenant-scoped tables: a row is scoped to a
 * personal user (companyId NULL) or a company workspace (companyId set).
 * (provider, slug) is unique per owner — (user_id, company_id, ...) for
 * company rows, (user_id, ...) for personal rows — so a workspace can
 * register multiple distinct slugs against the same provider but never
 * collide on the same logical credential.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  customType,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

// bytea has to be declared explicitly (Drizzle ships text/json only). Holds
// the AES-GCM ciphertext (+ appended 16-byte tag) and the per-row 12-byte
// nonce — both opaque to the app beyond encrypt/decrypt round-tripping in
// services/payout/encryption.ts.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const tenantIntegrations = pgTable(
  "tenant_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Owner scoping — mirrors workspace-scoped tables. Personal rows have
    // companyId NULL; company-workspace rows set companyId.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companyProfiles.id, {
      onDelete: "cascade",
    }),
    // Free-form vendor name the admin types (e.g. "openai", "stripe", "twilio").
    provider: varchar("provider", { length: 64 }).notNull(),
    // Admin-chosen label distinguishing multiple creds for one provider.
    slug: varchar("slug", { length: 64 }).notNull(),
    // Encrypted credential — AES-GCM ciphertext + appended tag, per-row nonce,
    // and the active key-version label so a future rotation can find old rows.
    credentialsCiphertext: bytea("credentials_ciphertext").notNull(),
    credentialsNonce: bytea("credentials_nonce").notNull(),
    credentialsKmsKeyId: text("credentials_kms_key_id").notNull(),
    // Non-secret display hint: last 4 chars of the raw credential.
    credentialsLast4: varchar("credentials_last4", { length: 4 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // #2305 — legacy UNIQUE pair (migration 0463_tenant_integrations.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
    // Two partials because Postgres treats NULL company_id as distinct, so a
    // single (user_id, company_id, provider, slug) index never guarded personal rows.
    uniqueIndex("uniq_tenant_integrations_company_provider_slug")
      .on(t.userId, t.companyId, t.provider, t.slug)
      .where(sql`company_id IS NOT NULL`),
    uniqueIndex("uniq_tenant_integrations_personal_provider_slug")
      .on(t.userId, t.provider, t.slug)
      .where(sql`company_id IS NULL`),
    index("idx_tenant_integrations_user").on(t.userId),
    index("idx_tenant_integrations_company").on(t.companyId),
  ],
);

export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type NewTenantIntegration = typeof tenantIntegrations.$inferInsert;
