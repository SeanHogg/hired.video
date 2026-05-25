/**
 * Compliance + email-safety + push-subscription pgTable declarations
 * mirroring the SQL shape from migration 0124. Closes gap #1319 — the
 * three tables existed in 0124_compliance_safety_oauth_drift.sql but
 * no schema/*.ts file declared them, so the parity test flagged them
 * as orphans (CREATE TABLE without pgTable) and services that touched
 * them had to use raw SQL.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── #244 — Workspace-wide compliance policy ───────────────────────────
export const workspaceCompliancePolicy = pgTable("workspace_compliance_policy", {
  workspaceId: uuid("workspace_id").primaryKey(),
  // 'all' | 'eu_only' | 'off'
  gdprScope: varchar("gdpr_scope", { length: 16 }).notNull().default("all"),
  // 'legitimate_interest' | 'consent'
  gdprLawfulBasis: varchar("gdpr_lawful_basis", { length: 32 })
    .notNull()
    .default("legitimate_interest"),
  retentionDays: integer("retention_days").notNull().default(730),
  privacyPolicyUrl: text("privacy_policy_url"),
  // 'us' | 'eu' | 'off'
  eeocScope: varchar("eeoc_scope", { length: 8 }).notNull().default("us"),
  smsConsentRequired: boolean("sms_consent_required").notNull().default(true),
  bulkUnsubscribeInjection: boolean("bulk_unsubscribe_injection")
    .notNull()
    .default(true),
  // #264 — Enrichment policy toggles
  enrichmentAllowCatchAll: boolean("enrichment_allow_catch_all")
    .notNull()
    .default(false),
  enrichmentAllowUnknown: boolean("enrichment_allow_unknown")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WorkspaceCompliancePolicy = typeof workspaceCompliancePolicy.$inferSelect;
export type NewWorkspaceCompliancePolicy = typeof workspaceCompliancePolicy.$inferInsert;

// ─── #245 — Email safety tolerance slider ──────────────────────────────
export const workspaceEmailSafetyPolicy = pgTable("workspace_email_safety_policy", {
  workspaceId: uuid("workspace_id").primaryKey(),
  // 'safe' | 'moderate' | 'high' | 'risky'
  tier: varchar("tier", { length: 16 }).notNull().default("moderate"),
  autoDowngradedTo: varchar("auto_downgraded_to", { length: 16 }),
  autoDowngradedAt: timestamp("auto_downgraded_at", { withTimezone: true }),
  autoDowngradeReason: text("auto_downgrade_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WorkspaceEmailSafetyPolicy = typeof workspaceEmailSafetyPolicy.$inferSelect;
export type NewWorkspaceEmailSafetyPolicy = typeof workspaceEmailSafetyPolicy.$inferInsert;

// ─── #535 — Gmail Push / Outlook Graph subscription tracking ──────────
export const emailPushSubscriptions = pgTable("email_push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  // 'gmail' | 'outlook'
  provider: varchar("provider", { length: 16 }).notNull(),
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  clientState: text("client_state"),
  historyId: varchar("history_id", { length: 64 }),
  renewedAt: timestamp("renewed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmailPushSubscription = typeof emailPushSubscriptions.$inferSelect;
export type NewEmailPushSubscription = typeof emailPushSubscriptions.$inferInsert;
