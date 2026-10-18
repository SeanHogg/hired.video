/**
 * PreferencesRepository — all userId-keyed preference storage:
 *   • user_settings — one row per user with three sections (W3-B, 0592):
 *       account  — theme / language / timezone / email toggles
 *       privacy  — who can see what
 *       cookies  — opt-in cookie categories
 *     Each section reads back in its pre-merge row shape, and as null until
 *     the section was first saved (its `*_saved_at` marker) — exactly like
 *     the old missing account_preferences / privacy_preferences /
 *     cookie_preferences row.
 *   • jobPreferences — desired title / location / salary etc.
 *
 * These share the same "one row per user, upsert semantics" shape, so
 * one repository keeps the CRUD patterns uniform. Every write to
 * user_settings goes through here; the few narrow column reads elsewhere
 * (timezone, privacy flags, notification matrix) gate on the same
 * `*_saved_at` marker so an unsaved section still reads as absent.
 */

import { and, eq, isNotNull, type AnyColumn } from "drizzle-orm";
import { schema } from "../db/index.js";

const { userSettings, jobPreferences } = schema;

export type SettingsSection = "account" | "privacy" | "cookies";

const SECTION_MARKER = {
  account: userSettings.accountSavedAt,
  privacy: userSettings.privacySavedAt,
  cookies: userSettings.cookiesSavedAt,
} as const;

/** Join / filter condition: the user_settings row of `userId` whose
 *  `section` was saved — what used to be "the row exists" for the per-section
 *  tables. Use it for every narrow column read outside this repository. */
export function savedSettingsOf(userId: AnyColumn | string, section: SettingsSection = "account") {
  return and(eq(userSettings.userId, userId as string), isNotNull(SECTION_MARKER[section]));
}

/** LEFT JOIN condition for the account section (timezone & co). */
export const savedAccountSettingsOf = (userIdColumn: AnyColumn) => savedSettingsOf(userIdColumn, "account");

export type DbLike = any;

type UserSettingsRow = typeof userSettings.$inferSelect;

/** Account section, in the pre-merge account_preferences shape. */
export interface AccountPreferencesRow {
  id: string;
  userId: string;
  emailNotificationsEnabled: boolean;
  jobAlertEmailsEnabled: boolean;
  weeklyDigestEnabled: boolean;
  notificationPreferences: Record<string, boolean> | null;
  theme: string;
  language: string;
  timezone: string;
  currency: string;
  extensionSettings: unknown;
  createdAt: Date;
  updatedAt: Date;
}
export type AccountPreferencesInsert = Partial<
  Pick<
    AccountPreferencesRow,
    | "emailNotificationsEnabled"
    | "jobAlertEmailsEnabled"
    | "weeklyDigestEnabled"
    | "notificationPreferences"
    | "theme"
    | "language"
    | "timezone"
    | "currency"
    | "extensionSettings"
  >
>;

/** Privacy section, in the pre-merge privacy_preferences shape. */
export interface PrivacyPreferencesRow {
  id: string;
  userId: string;
  profileVisibleToPublic: boolean;
  profileVisibleToRecruiters: boolean;
  allowSearchEngineIndexing: boolean;
  showActivityStatus: boolean;
  showConnectionsList: boolean;
  allowDirectMessages: boolean;
  allowConnectionRequests: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showLocation: boolean;
  promoteWithoutAuth: boolean;
  allowMessaging: boolean;
  shareAnalyticsData: boolean;
  shareUsageData: boolean;
  allowDataExport: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type PrivacyPreferencesInsert = Partial<Omit<PrivacyPreferencesRow, "id" | "userId" | "createdAt" | "updatedAt">>;

/** Cookie section, in the pre-merge cookie_preferences shape. */
export interface CookiePreferencesRow {
  id: string;
  userId: string;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  consentedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type CookiePreferencesInsert = Partial<Pick<CookiePreferencesRow, "analytics" | "marketing" | "personalization">>;

export type JobPreferencesRow = typeof jobPreferences.$inferSelect;
export type JobPreferencesInsert = typeof jobPreferences.$inferInsert;

const PRIVACY_COLUMNS = [
  "profileVisibleToPublic",
  "profileVisibleToRecruiters",
  "allowSearchEngineIndexing",
  "showActivityStatus",
  "showConnectionsList",
  "allowDirectMessages",
  "allowConnectionRequests",
  "showEmail",
  "showPhone",
  "showLocation",
  "promoteWithoutAuth",
  "allowMessaging",
  "shareAnalyticsData",
  "shareUsageData",
  "allowDataExport",
] as const;

const ACCOUNT_COLUMNS = [
  "emailNotificationsEnabled",
  "jobAlertEmailsEnabled",
  "weeklyDigestEnabled",
  "notificationPreferences",
  "theme",
  "language",
  "timezone",
  "currency",
  "extensionSettings",
] as const;

function pick<K extends string>(src: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  for (const k of keys) if (k in src && src[k] !== undefined) out[k] = src[k];
  return out;
}

export function accountSection(r: UserSettingsRow | null | undefined): AccountPreferencesRow | null {
  if (!r || !r.accountSavedAt) return null;
  return {
    id: r.id,
    userId: r.userId,
    emailNotificationsEnabled: r.emailNotificationsEnabled,
    jobAlertEmailsEnabled: r.jobAlertEmailsEnabled,
    weeklyDigestEnabled: r.weeklyDigestEnabled,
    notificationPreferences: r.notificationPreferences ?? null,
    theme: r.theme,
    language: r.language,
    timezone: r.timezone,
    currency: r.currency,
    extensionSettings: r.extensionSettings,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function privacySection(r: UserSettingsRow | null | undefined): PrivacyPreferencesRow | null {
  if (!r || !r.privacySavedAt) return null;
  return {
    id: r.id,
    userId: r.userId,
    ...(pick(r as unknown as Record<string, unknown>, PRIVACY_COLUMNS) as Omit<
      PrivacyPreferencesRow,
      "id" | "userId" | "createdAt" | "updatedAt"
    >),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function cookieSection(r: UserSettingsRow | null | undefined): CookiePreferencesRow | null {
  if (!r || !r.cookiesSavedAt) return null;
  return {
    id: r.id,
    userId: r.userId,
    analytics: r.cookieAnalytics,
    marketing: r.cookieMarketing,
    personalization: r.cookiePersonalization,
    consentedAt: r.cookieConsentedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Cookie-section patch → user_settings columns. */
export function cookieColumns(patch: CookiePreferencesInsert & { consentedAt?: Date | null }) {
  const out: Record<string, unknown> = {};
  if (patch.analytics !== undefined) out.cookieAnalytics = patch.analytics;
  if (patch.marketing !== undefined) out.cookieMarketing = patch.marketing;
  if (patch.personalization !== undefined) out.cookiePersonalization = patch.personalization;
  if (patch.consentedAt !== undefined) out.cookieConsentedAt = patch.consentedAt;
  return out;
}

export interface IPreferencesRepository {
  findAccountByUserId(userId: string): Promise<AccountPreferencesRow | null>;
  upsertAccount(userId: string, patch: Partial<AccountPreferencesInsert>): Promise<void>;
  findPrivacyByUserId(userId: string): Promise<PrivacyPreferencesRow | null>;
  upsertPrivacy(userId: string, patch: Partial<PrivacyPreferencesInsert>): Promise<void>;
  findCookieByUserId(userId: string): Promise<CookiePreferencesRow | null>;
  upsertCookie(userId: string, patch: Partial<CookiePreferencesInsert>): Promise<void>;
  forceCookieOptOut(userId: string): Promise<void>;
  /** All three settings sections from the one row (GDPR export). */
  findSettingsSections(userId: string): Promise<{
    account: AccountPreferencesRow | null;
    privacy: PrivacyPreferencesRow | null;
    cookie: CookiePreferencesRow | null;
  }>;
  findJobByUserId(userId: string): Promise<JobPreferencesRow | null>;
  upsertJob(userId: string, patch: Partial<JobPreferencesInsert>): Promise<void>;
}

export class PreferencesRepository implements IPreferencesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  private async findSettings(userId: string): Promise<UserSettingsRow | null> {
    const [row] = await this.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return (row as UserSettingsRow) ?? null;
  }

  /** Upsert columns of one section and stamp its saved marker. */
  private async upsertSection(userId: string, columns: Record<string, unknown>, marker: Record<string, Date>): Promise<void> {
    const now = this.now();
    await this.db
      .insert(userSettings)
      .values({ userId, ...columns, ...marker, updatedAt: now })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...columns, ...marker, updatedAt: now },
      });
  }

  async findAccountByUserId(userId: string): Promise<AccountPreferencesRow | null> {
    return accountSection(await this.findSettings(userId));
  }

  async upsertAccount(userId: string, patch: Partial<AccountPreferencesInsert>): Promise<void> {
    const columns = pick(patch as Record<string, unknown>, ACCOUNT_COLUMNS);
    await this.upsertSection(userId, columns, { accountSavedAt: this.now() });
  }

  async findPrivacyByUserId(userId: string): Promise<PrivacyPreferencesRow | null> {
    return privacySection(await this.findSettings(userId));
  }

  async upsertPrivacy(userId: string, patch: Partial<PrivacyPreferencesInsert>): Promise<void> {
    const columns = pick(patch as Record<string, unknown>, PRIVACY_COLUMNS);
    await this.upsertSection(userId, columns, { privacySavedAt: this.now() });
  }

  async findCookieByUserId(userId: string): Promise<CookiePreferencesRow | null> {
    return cookieSection(await this.findSettings(userId));
  }

  async upsertCookie(userId: string, patch: Partial<CookiePreferencesInsert>): Promise<void> {
    const now = this.now();
    await this.upsertSection(userId, cookieColumns({ ...patch, consentedAt: now }), { cookiesSavedAt: now });
  }

  /** CCPA/CPRA do-not-share: marketing + personalization cookies off,
   *  recorded as a deliberate cookie choice. */
  async forceCookieOptOut(userId: string): Promise<void> {
    const now = this.now();
    await this.upsertSection(
      userId,
      cookieColumns({ marketing: false, personalization: false, consentedAt: now }),
      { cookiesSavedAt: now },
    );
  }

  async findSettingsSections(userId: string) {
    const row = await this.findSettings(userId);
    return { account: accountSection(row), privacy: privacySection(row), cookie: cookieSection(row) };
  }

  async findJobByUserId(userId: string): Promise<JobPreferencesRow | null> {
    const [row] = await this.db.select().from(jobPreferences).where(eq(jobPreferences.userId, userId)).limit(1);
    return (row as JobPreferencesRow) ?? null;
  }

  async upsertJob(userId: string, patch: Partial<JobPreferencesInsert>): Promise<void> {
    const values = { userId, ...patch, updatedAt: this.now() };
    await this.db
      .insert(jobPreferences)
      .values(values as any)
      .onConflictDoUpdate({
        target: jobPreferences.userId,
        set: { ...patch, updatedAt: this.now() } as any,
      });
  }
}
