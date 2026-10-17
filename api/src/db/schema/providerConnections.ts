/**
 * provider_connections — every third-party credential in ONE table with ONE
 * encryption scheme (W3-C, migration 0600). Replaces oauth_accounts,
 * calendar_connections, ats_connections, lms_connectors,
 * paid_media_connections, social_connections, managed_accounts,
 * external_email_accounts, youtube_accounts, company_integrations and
 * tenant_integrations (archived by 0601; row ids were kept, so inbound ids and
 * URLs stay valid).
 *
 * Secrets (`access_token_enc`, `refresh_token_enc`, `extra_secret_enc` — the
 * last holds a webhook secret or a pasted API key) are written ONLY through
 * services/provider-connections/connection-secrets.ts (CREDENTIALS_KMS_KEY,
 * services/crypto/credential-columns.ts). Rows copied from a legacy store keep
 * that store's ciphertext behind a `legacy:<scheme>:` prefix until they are
 * re-sealed on first read or by scripts/backfill-credential-encryption.ts.
 *
 * Ownership: see shared/provider-connections.ts. `user_id` is the member a
 * user / workspace row belongs to (cascade on user delete); `company_id` scopes
 * workspace + company rows; `connected_by_user_id` records who connected a
 * company / platform row.
 *
 * Provider-specific non-secret settings live in `config` (never filtered on).
 * The connected-inbox columns that ARE queried stay typed:
 * `min_relevance_score` (joined into the inbox filter) and
 * `active_profile_id` (FK to inbox_profiles).
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { inboxProfiles } from "./externalEmail.js";
import {
  PROVIDER_CONNECTION_OWNER_KINDS,
  PROVIDER_CONNECTION_PURPOSES,
  PROVIDER_CONNECTION_STATUSES,
} from "../../../../shared/provider-connections.js";

export {
  PROVIDER_CONNECTION_OWNER_KINDS,
  PROVIDER_CONNECTION_PURPOSES,
  PROVIDER_CONNECTION_STATUSES,
  type ProviderConnectionOwnerKind,
  type ProviderConnectionPurpose,
  type ProviderConnectionStatus,
} from "../../../../shared/provider-connections.js";

/** `'a', 'b', …` for a CHECK built from a shared registry. */
const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: varchar("owner_kind", { length: 16 }).notNull(),
    /** users.id (user) or company id (workspace / company); NULL for platform. */
    ownerId: uuid("owner_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id"),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    purpose: varchar("purpose", { length: 24 }).notNull(),
    /** The provider's id for the connected account (OAuth subject, mailbox
     *  address, Google id, vendor slug …). */
    externalAccountId: text("external_account_id"),
    /** Display handle / label (social handle, mailbox label, channel title). */
    handle: text("handle"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    extraSecretEnc: text("extra_secret_enc"),
    /** Space-separated scope list. */
    scopes: text("scopes"),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    /** User toggle (inbox paused, calendar sync off, API key deactivated). */
    enabled: boolean("enabled").default(true).notNull(),
    lastError: text("last_error"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    config: jsonb("config").default({}).notNull().$type<Record<string, unknown>>(),
    minRelevanceScore: numeric("min_relevance_score", { precision: 4, scale: 3 }),
    activeProfileId: uuid("active_profile_id").references(() => inboxProfiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // NULLS NOT DISTINCT is set by migration 0600 (push cannot declare it).
    uniqueIndex("uq_provider_connections_identity").on(
      t.provider,
      t.purpose,
      t.ownerKind,
      t.ownerId,
      t.userId,
      t.externalAccountId,
    ),
    // One hired.video user per OAuth sign-in identity.
    uniqueIndex("uq_provider_connections_login")
      .on(t.provider, t.externalAccountId)
      .where(sql`purpose = 'login'`),
    index("idx_provider_connections_user_purpose").on(t.userId, t.purpose),
    index("idx_provider_connections_owner_purpose").on(t.ownerKind, t.ownerId, t.purpose),
    index("idx_provider_connections_purpose_provider").on(t.purpose, t.provider),
    index("idx_provider_connections_connected_by_user_id").on(t.connectedByUserId),
    index("idx_provider_connections_active_profile_id").on(t.activeProfileId),
    check("provider_connections_owner_kind_check", sql`${t.ownerKind} IN (${sqlList(PROVIDER_CONNECTION_OWNER_KINDS)})`),
    check("provider_connections_purpose_check", sql`${t.purpose} IN (${sqlList(PROVIDER_CONNECTION_PURPOSES)})`),
    check("provider_connections_status_check", sql`${t.status} IN (${sqlList(PROVIDER_CONNECTION_STATUSES)})`),
    check("provider_connections_owner_check", sql`(${t.ownerKind} = 'platform') = (${t.ownerId} IS NULL)`),
  ],
);

export type ProviderConnection = typeof providerConnections.$inferSelect;
export type NewProviderConnection = typeof providerConnections.$inferInsert;
