/**
 * Social publishing connection layers (migration 0217, PRD §5.0).
 *
 *   social_connections — Layer 3: each end user's own connected account
 *                        (Lane B). access/refresh tokens encrypted at rest.
 *   managed_accounts   — Layer 2: hired.video's brand accounts (Lane A),
 *                        SuperAdmin-connected, platform-global.
 *
 * Tokens are NEVER read raw — route through services/social/secrets.ts.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// ─── Layer 3: end-user connections (Lane B) ──────────────────────────────────
export const socialConnections = pgTable(
  "social_connections",
  {
    id:                  uuid("id").primaryKey().defaultRandom(),
    userId:              uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId:           uuid("company_id"),                 // workspace company (null = personal)
    platform:            varchar("platform", { length: 16 }).notNull(),
    externalAccountId:   text("external_account_id"),
    handle:              text("handle"),
    avatarUrl:           text("avatar_url"),
    accessTokenEnc:      text("access_token_enc").notNull(),
    refreshTokenEnc:     text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    scopes:              text("scopes").notNull().default(""),
    status:              varchar("status", { length: 24 }).notNull().default("active"),
    lastError:           text("last_error"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_social_connections_owner").on(t.userId, t.companyId),
    index("idx_social_connections_platform").on(t.platform),
    uniqueIndex("uq_social_connection_owner_platform").on(
      t.userId,
      sql`COALESCE(${t.companyId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.platform,
    ),
  ],
);

// ─── Layer 2: hired.video brand accounts (Lane A) ────────────────────────────
export const managedAccounts = pgTable(
  "managed_accounts",
  {
    id:                  uuid("id").primaryKey().defaultRandom(),
    platform:            varchar("platform", { length: 16 }).notNull(),
    externalAccountId:   text("external_account_id"),
    handle:              text("handle"),
    avatarUrl:           text("avatar_url"),
    accessTokenEnc:      text("access_token_enc").notNull(),
    refreshTokenEnc:     text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    scopes:              text("scopes").notNull().default(""),
    status:              varchar("status", { length: 24 }).notNull().default("active"),
    lastError:           text("last_error"),
    connectedByUserId:   uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_managed_accounts_platform").on(t.platform),
  ],
);

export type SocialConnectionRow = typeof socialConnections.$inferSelect;
export type SocialConnectionInsert = typeof socialConnections.$inferInsert;
export type ManagedAccountRow = typeof managedAccounts.$inferSelect;
export type ManagedAccountInsert = typeof managedAccounts.$inferInsert;
