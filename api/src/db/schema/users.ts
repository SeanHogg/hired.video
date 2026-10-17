import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  /** Silent guest account (mig 0496): a signed-out visitor who saved,
   *  rendered or posted. Email is `guest-<uuid>@guest.invalid`; on sign-up /
   *  sign-in `adopt_guest_user()` moves its rows to the real user. */
  isGuest: boolean("is_guest").default(false).notNull(),
  /** THE role store — one of USER_ROLES (shared/user-roles.ts), CHECK-
   *  constrained (mig 0630). The JWT `roles` claim is `[users.role]`. The
   *  old `roles` / `user_roles` join tables had no reader or writer and were
   *  archived by 0630. */
  role: varchar("role", { length: 50 }).default("job_seeker").notNull(),
  /** @deprecated DEAD — no reader or writer anywhere. #104's "sales vs
   *  recruiting" label-set axis (orthogonal to `role`, not a duplicate) was
   *  never wired. Kept declared only because `drizzle-kit push` runs before
   *  the SQL migrations: the follow-up migration archives + drops it, and its
   *  declaration is removed in that same change. Do not read or write. */
  persona: varchar("persona", { length: 32 }).default("recruiting").notNull(),
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
  // Editorial / house author account. Bypasses the creator-marketplace
  // paywall in `isCreatorVisible` so seeded long-form content (the "So
  // You Want to Become a..." series, etc.) surfaces publicly without
  // requiring a real subscription. NEVER auto-grantable from UI — only
  // set by migrations / SuperAdmin tooling.
  isSystem: boolean("is_system").default(false).notNull(),
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
  /** Provider-neutral copy of stripe_customer_id (migration 0125, phase 1 of a
   *  rename that never finished). No code reads it yet; declared so push keeps
   *  the column and its index instead of dropping them. */
  providerCustomerId: text("provider_customer_id"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  // Pinned at registration so spam-investigation can answer "where did
  // this account come from?" without scanning request_logs. See
  // login_events for the per-login history.
  signupIp: varchar("signup_ip", { length: 45 }),
  signupUserAgent: text("signup_user_agent"),
  // Inbound campaign attribution snapshot — taken once at signup so
  // server-side LTV-by-campaign queries don't depend on GA. Captured by
  // GTMPageTracker into the attribution cookie on first hit (first-touch),
  // then sent with the register payload. See migration 0116.
  utmSource: varchar("utm_source", { length: 128 }),
  utmMedium: varchar("utm_medium", { length: 128 }),
  utmCampaign: varchar("utm_campaign", { length: 128 }),
  utmTerm: varchar("utm_term", { length: 128 }),
  utmContent: varchar("utm_content", { length: 128 }),
  landingReferrer: text("landing_referrer"),
  // Stamped by deleteAccount() at user request. Distinct from
  // is_active=false (which also covers admin deactivation / suspension
  // recovery). The nightly purge sweep in services/user/account-purge.ts
  // hard-deletes rows where deletedAt is older than the retention window
  // published in the Privacy Policy.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // CPRA opt-out: "Do not sell or share my personal information". Set
  // via /privacy/opt-out (token-form for unauthenticated requests) or
  // Settings → Privacy. Read by paid-media-pixels.installPaidMediaPixels
  // and the CAPI fan-out to suppress identifier sharing.
  doNotShare: boolean("do_not_share").default(false).notNull(),
  /** Per-recruiter Resume Forwarding Address slug (#251). Inbound mail
   *  to `{slug}@resume-forward.hired.video` is parsed by the Mailgun
   *  webhook and lands in this user's talent pool. Null = the user has
   *  not opted in to forwarding yet. */
  resumeForwardingSlug: varchar("resume_forwarding_slug", { length: 48 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_users_is_banned").on(t.isBanned).where(sql`(is_banned = true)`),
  index("idx_users_signup_ip").on(t.signupIp).where(sql`(signup_ip IS NOT NULL)`),
  index("idx_users_utm_campaign").on(t.utmCampaign).where(sql`(utm_campaign IS NOT NULL)`),
  index("idx_users_deleted_at").on(t.deletedAt).where(sql`(deleted_at IS NOT NULL)`),
  index("idx_users_is_guest_created").on(t.createdAt).where(sql`is_guest`),
  // pg_trgm GIN — backs the admin/search `ILIKE '%term%'` paths (0495). The
  // extension is created by scripts/ensure-db-extensions.mjs before push.
  index("idx_users_email_trgm").using("gin", t.email.op("gin_trgm_ops")),
  index("idx_users_name_trgm").using("gin", t.name.op("gin_trgm_ops")),
  // Exact lowercased-name lookup for @mention resolution (routes/feed.ts).
  index("idx_users_name_lower").using("btree", sql`lower(${t.name})`),
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_users_resume_forwarding_slug")
    .on(sql`lower((${t.resumeForwardingSlug})::text)`)
    .where(sql`resume_forwarding_slug IS NOT NULL`),
  // Migration 0125 — partial unique on the provider-neutral customer id.
  uniqueIndex("uq_users_provider_customer_id")
    .on(t.providerCustomerId)
    .where(sql`provider_customer_id IS NOT NULL`),
  check("users_profile_mode_check", sql`${t.profileMode} IN ('resume', 'channel', 'auto')`),
  // Mirrors USER_ROLES in shared/user-roles.ts (mig 0630).
  check(
    "users_role_check",
    sql`${t.role} IN ('job_seeker', 'recruiter', 'employer', 'employee', 'creator', 'affiliate', 'admin', 'super_admin')`,
  ),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const passwordHistory = pgTable("password_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_password_history_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
]);

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
}, (t) => [
  index("idx_two_factor_codes_user").on(t.userId),
  // Retention sweep age axis (0541).
  index("idx_two_factor_codes_expires").on(t.expiresAt),
]);

export type TwoFactorCode = typeof twoFactorCodes.$inferSelect;
export type NewTwoFactorCode = typeof twoFactorCodes.$inferInsert;

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Retention sweep age axis (0541).
  index("idx_email_verification_tokens_expires").on(t.expiresAt),
  index("idx_email_verification_tokens_user_id").on(t.userId),
]);

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Retention sweep age axis (0541).
  index("idx_password_reset_tokens_expires").on(t.expiresAt),
  index("idx_password_reset_tokens_user_id").on(t.userId),
]);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_refresh_tokens_user").on(t.userId),
]);

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
  // THE store for a person's skills / industries (job_preferences.skills /
  // .industries were merged in by mig 0631 and are deprecated). Workspace
  // taxonomies (workspace_tags etc.) are recruiter vocabularies, not this.
  skills: jsonb("skills").$type<string[]>().default([]),
  industries: jsonb("industries").$type<string[]>().default([]),
  preferredRoles: jsonb("preferred_roles").$type<string[]>().default([]),
  profileVisibility: varchar("profile_visibility", { length: 50 }).default("public").notNull(),
  // Confidential search mode (#1627) — when true the profile is excluded
  // from the anonymous public people-search (fail-closed). For senior
  // execs who are still employed and can't be seen job-hunting publicly.
  confidentialMode: boolean("confidential_mode").default(false).notNull(),
  // Confidential employer blocklist (#1679) — company names this profile
  // hides from in authenticated recruiter search (current employer /
  // competitors). Visible to all other recruiters.
  confidentialBlocklist: jsonb("confidential_blocklist").$type<string[]>().default([]).notNull(),
  customUrlSlug: varchar("custom_url_slug", { length: 100 }),
  // Featured candidate profile — paid one-off boost for recruiter search visibility
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  // Lead-generation / services marketplace
  providesServices: boolean("provides_services").default(false).notNull(),
  /** @deprecated billing_* — copied to `billing_addresses` (mig 0631), the
   *  canonical store (repositories/billingAddressRepository.ts). No reader;
   *  only the GDPR purge still NULLs them. Kept declared only because
   *  `drizzle-kit push` runs before the SQL migrations; the follow-up
   *  migration archives + drops them and removes these declarations. */
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
  /** @deprecated home_* — the home location lives in `content_locations`
   *  (entity_kind 'user_profile', entity_id = users.id, role 'origin'),
   *  written by the LocationPicker; 0631 backfilled any row only present
   *  here. No reader; only the GDPR purge still NULLs them. Kept declared
   *  only because `drizzle-kit push` runs before the SQL migrations; the
   *  follow-up migration archives + drops them (and these indexes). */
  homeCountryId: integer("home_country_id"),
  homeStateId: uuid("home_state_id"),
  homeCityId: uuid("home_city_id"),
  homePostalCode: varchar("home_postal_code", { length: 20 }),
  homeLatitude: doublePrecision("home_latitude"),
  homeLongitude: doublePrecision("home_longitude"),
  homeRadiusKm: integer("home_radius_km"),
  // Per-section visibility on /people/[id]. Partial of ProfileSections —
  // missing keys fall back to `getDefaultProfileSections(role)` so every
  // existing row (which has `{}`) automatically follows role-based
  // defaults without a backfill. Shape and resolver live in
  // shared/profile-sections.ts — never spot-check a single key here.
  profileSections: jsonb("profile_sections").$type<Record<string, boolean>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_profiles_home_country_idx").on(t.homeCountryId),
  index("user_profiles_home_state_idx").on(t.homeStateId),
  index("user_profiles_home_city_idx").on(t.homeCityId),
  index("user_profiles_confidential_mode_idx").on(t.confidentialMode).where(sql`"confidential_mode" = true`),
]);

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

export const accountPreferences = pgTable("account_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true).notNull(),
  // marketing_emails_enabled (coarse opt-out) retired in 0487 (#1976) — the
  // authoritative marketing-consent store is the email-keyed
  // `email_marketing_preferences` ledger honored by the send path.
  jobAlertEmailsEnabled: boolean("job_alert_emails_enabled").default(true).notNull(),
  weeklyDigestEnabled: boolean("weekly_digest_enabled").default(true).notNull(),
  // Granular per-channel × per-category notification toggles (the shape the
  // Settings form renders). Stored as a JSONB blob so the matrix can grow
  // without a column-per-toggle migration; the coarse *_enabled booleans
  // above are kept as derived projections for legacy readers. NULL until the
  // user saves — readers fall back to defaults via mergeNotificationPreferences.
  // Shape = shared/notification-preferences.ts NotificationPreferences. (#254)
  notificationPreferences: jsonb("notification_preferences")
    .$type<Record<string, boolean>>(),
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
  // Opt-in promotion mode for creators / service providers: when true,
  // unauthenticated visitors see the full /people/:slug page instead of
  // the sign-in AuthOverlay. Default false so existing privacy behaviour
  // is unchanged for everyone else. See migration 0097.
  promoteWithoutAuth: boolean("promote_without_auth").default(false).notNull(),
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
  // Optional company binding. Set for workforce / agency back-office invites
  // (role=employee, recruiter joining a company, etc.) so the accept handler
  // can create a userCompanyRoleAssociations row at the same time. Null for
  // generic platform-role invites that don't bind to a specific company.
  companyId: uuid("company_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  // Hard expiry enforced on accept (gap #1680). Set by the invite service
  // to createdAt + 14d; the accept handler rejects invites past this.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("idx_account_invitations_company_status").on(t.companyId, t.status).where(sql`company_id IS NOT NULL`),
  index("idx_account_invitations_status").on(t.status),
  index("idx_account_invitations_invited_by").on(t.invitedBy),
]);

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

export const userConnections = pgTable(
  "user_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // CONNECTION_STATUSES (shared/statuses.ts); lowercase since migration 0620.
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    requestMessage: text("request_message"),
    responseMessage: text("response_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // At most one OPEN (Pending | Accepted) request per (from, to) pair.
    // Rejected rows excluded so a re-request is legal after a prior reject.
    uniqueIndex("uq_user_connections_open_pair")
      .on(t.fromUserId, t.toUserId)
      .where(sql`${t.status} IN ('pending', 'accepted')`),
    index("idx_user_connections_to_user").on(t.toUserId),
    check("user_connections_status_check", sql`${t.status} IN ('pending', 'accepted', 'rejected')`),
    index("idx_user_connections_from_user_id").on(t.fromUserId),
  ],
);

export type UserConnection = typeof userConnections.$inferSelect;
export type NewUserConnection = typeof userConnections.$inferInsert;

// OAuth sign-in identities live in provider_connections (purpose "login",
// W3-C migration 0600).

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
}, (t) => [
  index("idx_login_events_ip_time").on(t.ipAddress, t.createdAt.desc().nullsFirst()).where(sql`ip_address IS NOT NULL`),
  index("idx_login_events_user_time").on(t.userId, t.createdAt.desc().nullsFirst()).where(sql`user_id IS NOT NULL`),
  index("idx_login_events_email_time").on(sql`lower(email)`, sql`created_at`).where(sql`email IS NOT NULL`),
  // Retention sweep age axis (0541).
  index("idx_login_events_created").on(t.createdAt),
]);

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
}, (t) => [
  // Retention sweep age axis (0541).
  index("idx_magic_link_tokens_expires").on(t.expiresAt),
]);

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
}, (t) => [
  // 0060 indexes minus idx_sessions_last_seen (dropped in 0495 — nothing filters
  // or sorts on last_seen_at, and every debounced touch paid for it).
  index("idx_sessions_user_active").on(t.userId).where(sql`revoked_at IS NULL`),
  index("idx_sessions_family").on(t.familyId),
  index("idx_sessions_expires_at").on(t.expiresAt).where(sql`revoked_at IS NULL`),
  index("idx_sessions_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
  index("idx_sessions_device_fingerprint").on(t.deviceFingerprint).where(sql`device_fingerprint IS NOT NULL`),
  // Backs the ON DELETE SET NULL self-FK (sessions_rotated_to*) so the
  // retention sweep's batch DELETE doesn't seq-scan sessions once per row.
  index("idx_sessions_rotated_to").on(t.rotatedToSessionId).where(sql`rotated_to_session_id IS NOT NULL`),
]);

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
}, (t) => [
  index("idx_account_locks_unlocks_at").on(t.unlocksAt).where(sql`active = true`),
  // #2305 — legacy UNIQUE (migration 0060_sessions_and_lock.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_account_locks_active_user").on(t.userId).where(sql`active = true`),
  index("idx_account_locks_locked_by").on(t.lockedBy),
  index("idx_account_locks_unlocked_by").on(t.unlockedBy),
  index("idx_account_locks_user_id").on(t.userId),
]);

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
}, (t) => [
  index("idx_email_change_requests_user").on(t.userId),
]);

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
}, (t) => [
  index("idx_bot_block_events_created_at").on(t.createdAt.desc().nullsFirst()),
  index("idx_bot_block_events_country").on(t.countryCode, t.createdAt.desc().nullsFirst()),
  index("idx_bot_block_events_reason").on(t.reason, t.createdAt.desc().nullsFirst()),
  index("idx_bot_block_events_ip_hash").on(t.ipHash, t.createdAt.desc().nullsFirst()),
]);

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
}, (t) => [
  index("idx_region_waitlist_status").on(t.status, t.createdAt.desc().nullsFirst()),
  index("idx_region_waitlist_country").on(t.countryCode),
  // #2305 — legacy UNIQUE (migration 0065_security_phase_2_to_6.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_region_waitlist_email_pending").on(t.email).where(sql`status = 'pending'`),
  index("idx_region_waitlist_reviewed_by").on(t.reviewedBy),
]);

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
}, (t) => [
  index("idx_two_factor_backup_codes_user").on(t.userId),
  index("idx_two_factor_backup_codes_hash").on(t.codeHash).where(sql`used_at IS NULL`),
]);

export type TwoFactorBackupCode = typeof twoFactorBackupCodes.$inferSelect;
export type NewTwoFactorBackupCode = typeof twoFactorBackupCodes.$inferInsert;
