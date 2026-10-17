/**
 * Partner platform integration (Hired.Video SDK).
 *
 * A "partner" is an external platform (e.g. builderforce.ai) that integrates
 * Hired.Video via the `@hiredvideo/sdk` npm package to:
 *   1. create Hired.Video job-seeker accounts on behalf of their users,
 *   2. upload a resume into that account,
 *   3. connect an EXISTING Hired.Video account (consent-gated),
 *   4. read the live profile/resume (so partner updates stay in sync), and
 *   5. embed the job seeker's profile/resume UI inside the partner platform.
 *
 *   partners             — the external platform record (issued by a SuperAdmin
 *                          when a partner "requests API access").
 *   partner_api_keys     — system-to-system credentials (prefix + SHA-256 hash,
 *                          the full key shown once). Mirrors company_embed_keys.
 *   partner_connections  — the link between a partner and a Hired.Video user.
 *                          `source` distinguishes a partner-CREATED account
 *                          (auto-active) from a CONNECTED existing account
 *                          (starts `pending`, activated by the job seeker's
 *                          explicit consent). This row is the SSoT for "does
 *                          this partner have permission to read/embed this
 *                          user" — revocable by the job seeker at any time.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    // URL-safe identifier used in consent copy and admin surfaces.
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    contactEmail: varchar("contact_email", { length: 255 }),
    // Partner's public site (rendered on the consent screen so the job seeker
    // knows who they're authorizing) and logo.
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    // The account owner who REQUESTED partner access (self-service flow). They
    // manage their own API keys once approved. Null for admin-provisioned
    // partners. One partner per owner is enforced at the request route.
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    // Free-text justification supplied with the request (shown to the admin).
    requestNote: text("request_note"),
    // "pending" (awaiting SuperAdmin approval) | "active" | "suspended" |
    // "rejected". Only "active" partners' keys authenticate.
    status: varchar("status", { length: 20 }).default("active").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    // SuperAdmin who provisioned the partner (audit).
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_partners_status").on(t.status),
    index("idx_partners_owner").on(t.ownerUserId),
    index("idx_partners_approved_by").on(t.approvedBy),
    index("idx_partners_created_by").on(t.createdBy),
  ],
);

export const partnerApiKeys = pgTable(
  "partner_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 200 }).notNull(),
    // First 12 chars ("hvpk_" + 7 hex) for display only.
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    // SHA-256 hex of the full key — the only stored form used for validation.
    keyHash: text("key_hash").notNull(),
    // Granted scopes, e.g. ["write:job_seekers","write:resumes","read:profile"].
    scopes: jsonb("scopes").default([]).notNull(),
    // Optional CORS/redirect allowlist for the partner's origins.
    allowedOrigins: jsonb("allowed_origins").default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_partner_api_keys_hash").on(t.keyHash),
    index("idx_partner_api_keys_partner").on(t.partnerId),
    index("idx_partner_api_keys_created_by").on(t.createdBy),
  ],
);

export const partnerConnections = pgTable(
  "partner_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The partner's own id for this user, so the partner can reconcile
    // Hired.Video accounts back to their platform's user rows.
    externalUserId: varchar("external_user_id", { length: 255 }),
    // "partner_created" (partner made the account → auto-active) |
    // "connected" (existing account → needs job-seeker consent).
    source: varchar("source", { length: 20 }).notNull(),
    // "pending" (awaiting consent) | "active" | "revoked".
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    // What the partner is permitted to do with this specific connection —
    // a subset of the key's scopes, snapshotted at consent time.
    scopes: jsonb("scopes").default([]).notNull(),
    // Consent audit — set when the job seeker approves (or at creation for
    // partner_created accounts, since the partner provisioned it directly).
    consentAgreedAt: timestamp("consent_agreed_at", { withTimezone: true }),
    consentIp: varchar("consent_ip", { length: 45 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One connection row per (partner, user) — re-connecting reuses the row.
    uniqueIndex("uq_partner_connections_partner_user").on(t.partnerId, t.userId),
    index("idx_partner_connections_user").on(t.userId),
  ],
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type PartnerApiKey = typeof partnerApiKeys.$inferSelect;
export type NewPartnerApiKey = typeof partnerApiKeys.$inferInsert;
export type PartnerConnection = typeof partnerConnections.$inferSelect;
export type NewPartnerConnection = typeof partnerConnections.$inferInsert;
