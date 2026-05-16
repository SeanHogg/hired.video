import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  // Presentation mode for the public profile per
  // `project_creator_persona_model.md`. `auto` resolves to either
  // `resume` or `channel` based on the multi-signal resolver in
  // services/profile/profile-mode.ts. NEVER fork on this value at the
  // call site — call resolveProfileMode().
  profileMode: varchar("profile_mode", { length: 16 }).default("auto").notNull(),
  // External, channel-style handle used for `/u/<handle>` URLs. Kept
  // SEPARATE from `user_profiles.custom_url_slug` because the two
  // serve different products: the slug is the resume-profile vanity
  // URL (articles/courses/services); this handle is the creator's
  // public brand identifier. Backfill in 0068 seeds them to the same
  // value when possible, but they're free to diverge afterwards.
  externalPublicHandle: varchar("external_public_handle", { length: 64 }).unique(),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  role: varchar("role", { length: 50 }).default("job_seeker").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isSuspended: boolean("is_suspended").default(false).notNull(),
  // Banned = account blocked AND hidden from the product. Stronger than
  // suspended, which is visible/reversible-by-user-request. Banning also
  // flips is_active=false + is_suspended=true in the service so every
  // existing login/listing gate already blocks the account; is_banned
  // only drives the admin-list default exclusion and "cannot unban by
  // reactivate" distinction.
  isBanned: boolean("is_banned").default(false).notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  // #157 — per-user override for the creator marketplace platform fee.
  // Null = fall back to PLATFORM_FEE_BPS_DEFAULT. Snapshotted onto a
  // listing's `platformFeeBps` at first publish (or re-opt-in); changing
  // this value never retroactively rewrites existing listings.
  creatorPlatformFeeBpsOverride: integer("creator_platform_fee_bps_override"),
  sessionVersion: integer("session_version").default(0).notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  mfaSecret: text("mfa_secret"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  // Pinned at registration so spam-investigation can answer "where did
  // this account come from?" without scanning request_logs. See
  // login_events for the per-login history.
  signupIp: varchar("signup_ip", { length: 45 }),
  signupUserAgent: text("signup_user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

export const passwordHistory = pgTable("password_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PasswordHistory = typeof passwordHistory.$inferSelect;
export type NewPasswordHistory = typeof passwordHistory.$inferInsert;

export const twoFactorCodes = pgTable("two_factor_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  // Number of wrong codes submitted against this challenge. The verify
  // endpoint increments on mismatch and burns the row at 5 — caps the
  // brute-force window from 10^6 down to 5 attempts.
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TwoFactorCode = typeof twoFactorCodes.$inferSelect;
export type NewTwoFactorCode = typeof twoFactorCodes.$inferInsert;

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline"),
  summary: text("summary"),
  location: varchar("location", { length: 255 }),
  website: varchar("website", { length: 500 }),
  phone: varchar("phone", { length: 50 }),
  linkedIn: varchar("linked_in", { length: 500 }),
  github: varchar("github", { length: 500 }),
  twitter: varchar("twitter", { length: 500 }),
  currentRole: varchar("current_role", { length: 255 }),
  currentCompany: varchar("current_company", { length: 255 }),
  avatarUrl: text("avatar_url"),
  yearsOfExperience: integer("years_of_experience"),
  openToWork: boolean("open_to_work").default(false).notNull(),
  openToRemote: boolean("open_to_remote").default(false).notNull(),
  salaryCurrency: varchar("salary_currency", { length: 10 }).default("USD"),
  salaryExpectation: integer("salary_expectation"),
  skills: jsonb("skills").$type<string[]>().default([]),
  industries: jsonb("industries").$type<string[]>().default([]),
  preferredRoles: jsonb("preferred_roles").$type<string[]>().default([]),
  profileVisibility: varchar("profile_visibility", { length: 50 }).default("public").notNull(),
  customUrlSlug: varchar("custom_url_slug", { length: 100 }),
  // Featured candidate profile — paid one-off boost for recruiter search visibility
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  // Lead-generation / services marketplace
  providesServices: boolean("provides_services").default(false).notNull(),
  // Mailing / billing address — single source of truth for Checkout,
  // Settings → Billing, and the Services marketplace. Shape mirrors
  // BillingAddressSchema in shared/billing-address.ts. Per-field columns
  // so each can be queried + validated independently (vs. a JSONB blob).
  billingFullName: varchar("billing_full_name", { length: 160 }),
  billingCompany: varchar("billing_company", { length: 160 }),
  billingLine1: varchar("billing_line1", { length: 200 }),
  billingLine2: varchar("billing_line2", { length: 200 }),
  billingCity: varchar("billing_city", { length: 100 }),
  billingState: varchar("billing_state", { length: 100 }),
  billingPostalCode: varchar("billing_postal_code", { length: 20 }),
  billingCountry: varchar("billing_country", { length: 2 }),
  billingPhone: varchar("billing_phone", { length: 40 }),
  // Career 360 — chosen target + LLM-derived rubric / gap analysis /
  // roadmap, plus the last picker batch. See `shared/career360-types.ts`
  // for the document shape. Single document per user (one active target
  // — multi-target comparison is a separate roadmap item).
  careerTarget: jsonb("career_target").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

export const accountPreferences = pgTable("account_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true).notNull(),
  marketingEmailsEnabled: boolean("marketing_emails_enabled").default(false).notNull(),
  jobAlertEmailsEnabled: boolean("job_alert_emails_enabled").default(true).notNull(),
  weeklyDigestEnabled: boolean("weekly_digest_enabled").default(true).notNull(),
  theme: varchar("theme", { length: 50 }).default("light").notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  // IANA timezone name (e.g. "America/Los_Angeles", "Europe/London"). "UTC" is
  // the safe default — the Appearance tab lets users pick their own, and
  // lib/hooks/use-user-timezone.ts applies it to every user-facing date.
  timezone: varchar("timezone", { length: 100 }).default("UTC").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  // Chrome-extension preferences, bundled as JSON so the two surfaces
  // (jobseeker + recruiter sidepanels and the /settings page) stay in
  // sync. See routes/settings.ts extension-preferences handlers for the
  // shape — keep adding nested keys here rather than new top-level
  // columns so the shape can evolve without per-toggle migrations.
  extensionSettings: jsonb("extension_settings").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AccountPreferences = typeof accountPreferences.$inferSelect;
export type NewAccountPreferences = typeof accountPreferences.$inferInsert;

export const privacyPreferences = pgTable("privacy_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  profileVisibleToPublic: boolean("profile_visible_to_public").default(true).notNull(),
  profileVisibleToRecruiters: boolean("profile_visible_to_recruiters").default(true).notNull(),
  allowSearchEngineIndexing: boolean("allow_search_engine_indexing").default(true).notNull(),
  showActivityStatus: boolean("show_activity_status").default(true).notNull(),
  showConnectionsList: boolean("show_connections_list").default(true).notNull(),
  allowDirectMessages: boolean("allow_direct_messages").default(true).notNull(),
  allowConnectionRequests: boolean("allow_connection_requests").default(true).notNull(),
  showEmail: boolean("show_email").default(false).notNull(),
  showPhone: boolean("show_phone").default(false).notNull(),
  showLocation: boolean("show_location").default(false).notNull(),
  allowMessaging: boolean("allow_messaging").default(true).notNull(),
  shareAnalyticsData: boolean("share_analytics_data").default(true).notNull(),
  shareUsageData: boolean("share_usage_data").default(true).notNull(),
  allowDataExport: boolean("allow_data_export").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PrivacyPreferences = typeof privacyPreferences.$inferSelect;
export type NewPrivacyPreferences = typeof privacyPreferences.$inferInsert;

// Cookie consent choices for the /cookies panel and Settings → Cookies tab.
// Essential cookies are required to run the site so they are not stored —
// only the optional categories a user can actually opt in/out of. consentedAt
// is the timestamp of the user's last deliberate choice (not first-view auto
// defaults), which the cookie banner uses to decide whether to re-prompt.
export const cookiePreferences = pgTable("cookie_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  analytics: boolean("analytics").default(false).notNull(),
  marketing: boolean("marketing").default(false).notNull(),
  personalization: boolean("personalization").default(false).notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CookiePreferences = typeof cookiePreferences.$inferSelect;
export type NewCookiePreferences = typeof cookiePreferences.$inferInsert;

export const accountInvitations = pgTable("account_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export type AccountInvitation = typeof accountInvitations.$inferSelect;
export type NewAccountInvitation = typeof accountInvitations.$inferInsert;

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

export const userConnections = pgTable("user_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toUserId: uuid("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("Pending").notNull(), // Pending | Accepted | Rejected
  requestMessage: text("request_message"),
  responseMessage: text("response_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserConnection = typeof userConnections.$inferSelect;
export type NewUserConnection = typeof userConnections.$inferInsert;

export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;

// Append-only per-event log of authentication attempts (register, login,
// oauth_login, magic_link). user_id is nullable so failed attempts on a
// nonexistent email still produce a row — that's how we detect
// credential-stuffing waves. ON DELETE SET NULL preserves the forensic
// trail when a banned user is hard-deleted.
export const loginEvents = pgTable("login_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  email: varchar("email", { length: 255 }),
  kind: varchar("kind", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 32 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: varchar("failure_reason", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LoginEvent = typeof loginEvents.$inferSelect;
export type NewLoginEvent = typeof loginEvents.$inferInsert;

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  redirect: varchar("redirect", { length: 500 }).default("/dashboard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkToken = typeof magicLinkTokens.$inferInsert;

// Authoritative per-device session row. Replaces the stateless-JWT-only
// model. Every successful login (password, OAuth, magic-link, post-2FA)
// creates one. JWTs now carry a `sid` claim that points here so the
// middleware can revoke a specific device, enforce the 3-device cap,
// rotate refresh tokens with reuse detection, and skip MFA for trusted
// devices. See migration 0060_sessions_and_lock.sql for the column-level
// rationale.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull().unique(),
  deviceFingerprint: text("device_fingerprint"),
  deviceLabel: text("device_label"),
  ipAddress: varchar("ip_address", { length: 45 }),
  ipCountry: varchar("ip_country", { length: 2 }),
  userAgent: text("user_agent"),
  trusted: boolean("trusted").default(false).notNull(),
  trustedUntil: timestamp("trusted_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: varchar("revoked_reason", { length: 64 }),
  rotatedToSessionId: uuid("rotated_to_session_id"),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Lock state with audit trail. Living in its own table (not on users)
// preserves the "who locked, why, when, who unlocked" timeline across
// repeated lock/unlock cycles. Partial unique index in the migration
// guarantees one active lock per user.
export const accountLocks = pgTable("account_locks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 64 }).notNull(),
  lockedBy: uuid("locked_by").references(() => users.id, { onDelete: "set null" }),
  unlockedBy: uuid("unlocked_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
  unlocksAt: timestamp("unlocks_at", { withTimezone: true }),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  active: boolean("active").default(true).notNull(),
});

export type AccountLock = typeof accountLocks.$inferSelect;
export type NewAccountLock = typeof accountLocks.$inferInsert;

// Two-token email-change flow: confirm-from-old + verify-on-new. Both
// must be consumed before the user.email mutation lands. This stops a
// session-hijack from silently taking over the account by changing the
// email out from under the real owner.
export const emailChangeRequests = pgTable("email_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentEmail: varchar("current_email", { length: 255 }).notNull(),
  newEmail: varchar("new_email", { length: 255 }).notNull(),
  currentToken: text("current_token").notNull().unique(),
  newToken: text("new_token").notNull().unique(),
  currentConfirmed: boolean("current_confirmed").default(false).notNull(),
  newConfirmed: boolean("new_confirmed").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailChangeRequest = typeof emailChangeRequests.$inferSelect;
export type NewEmailChangeRequest = typeof emailChangeRequests.$inferInsert;

// Append-only telemetry for every blocked-bot signal. Fed by
// recordBotBlock() in services/auth/bot.ts; consumed by the SuperAdmin
// bot globe and the brute-force counter. Hashed-IP + email-domain only
// — keeps the log GDPR-light.
export const botBlockEvents = pgTable("bot_block_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: varchar("endpoint", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 32 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }),
  ipHash: varchar("ip_hash", { length: 64 }),
  emailDomain: varchar("email_domain", { length: 255 }),
  asn: varchar("asn", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BotBlockEvent = typeof botBlockEvents.$inferSelect;
export type NewBotBlockEvent = typeof botBlockEvents.$inferInsert;

// Out-of-region demand capture. Visitors hit canCreateAccount(country)
// → false get the "request access" form which writes here. SuperAdmin
// reviews + invites manually.
export const regionWaitlist = pgTable("region_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RegionWaitlist = typeof regionWaitlist.$inferSelect;
export type NewRegionWaitlist = typeof regionWaitlist.$inferInsert;

// 10 single-use codes per user, hashed at rest. Plaintext shown once
// at generation; thereafter only the SHA-256 digest is queryable.
// NIST 800-63B §6.1.2.3.
export const twoFactorBackupCodes = pgTable("two_factor_backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TwoFactorBackupCode = typeof twoFactorBackupCodes.$inferSelect;
export type NewTwoFactorBackupCode = typeof twoFactorBackupCodes.$inferInsert;
