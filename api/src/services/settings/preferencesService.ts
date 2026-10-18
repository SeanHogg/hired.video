/**
 * Settings preference use cases — notifications, privacy, cookies,
 * job preferences, account (locale/theme) and extension preferences.
 * Backs /api/settings (routes/settings/*). One-row-per-user upserts go
 * through PreferencesRepository; user-row flags through
 * userSettingsRepository.
 */

import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { IPreferencesRepository, JobPreferencesInsert, JobPreferencesRow } from "../../repositories/index.js";
import { findProfileCols, type ProfileColsRow } from "../../repositories/usersProfileRepository.js";
import { DomainError } from "../../domains/errors.js";
import { upsertProfile } from "../user/myProfile.js";
import { JobPreferencesPatchSchema, type JobPreferences } from "../../../../shared/settings.js";
import { findUserMfaEnabled } from "../../repositories/userSettingsRepository.js";
import {
  COOKIE_CATEGORY_FIELDS,
  defaultAccountSettings,
  defaultCookiePreferences,
  defaultJobPreferences,
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  sanitizeAccountUpdates,
} from "../user/settings.js";
import { mergeNotificationPreferences } from "../../../../shared/notification-preferences.js";
import {
  granularToLegacy,
  invalidateNotificationPreferences,
  resolvePreferencesFromRow,
} from "../notifications/preferences.js";
import {
  applyExtensionSettingsPatch,
  mergeExtensionSettings,
  type ExtensionSettings,
} from "./extensionSettings.js";

export const PRIVACY_FIELDS = [
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

function prefsRepo(): IPreferencesRepository {
  return buildRepos(getDb()).preferences;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
}

// ── Views ────────────────────────────────────────────────────────────────

type ProfilePreferenceCols = Pick<ProfileColsRow, "preferredRoles" | "industries" | "salaryCurrency">;

const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Stored jsonb lists may predate validation — keep only non-empty strings,
 *  deduped case-insensitively, clamped to the contract's limits. */
function toList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const v = item.trim().slice(0, 120);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 50);
}

function toSalary(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The saved state — `job_preferences` row + the `user_profiles` columns
 *  that own roles / industries / currency (shared/settings.ts). */
function jobPreferencesView(row: JobPreferencesRow | null, profile: ProfilePreferenceCols | null): JobPreferences {
  const d = defaultJobPreferences();
  const currency = profile?.salaryCurrency?.trim().toUpperCase() ?? "";
  return {
    desiredTitle: row?.desiredTitle ?? d.desiredTitle,
    desiredLocation: row?.desiredLocation ?? d.desiredLocation,
    remoteOnly: row?.remotePreference === "remote",
    minSalaryExpectation: toSalary(row?.salaryMin),
    maxSalaryExpectation: toSalary(row?.salaryMax),
    salaryCurrency: CURRENCY_CODE.test(currency) ? currency : d.salaryCurrency,
    preferredRoles: toList(profile?.preferredRoles),
    industries: toList(profile?.industries),
  };
}

function accountView(row: { theme?: string | null; language?: string | null; currency?: string | null; timezone?: string | null } | null) {
  return {
    theme: row?.theme ?? "system",
    language: row?.language ?? "en",
    currency: row?.currency ?? "USD",
    timezone: row?.timezone ?? "UTC",
  };
}

function cookieView(row: { analytics?: boolean | null; marketing?: boolean | null; personalization?: boolean | null; consentedAt?: Date | string | null } | null) {
  return {
    essential: true,
    analytics: row?.analytics ?? false,
    marketing: row?.marketing ?? false,
    personalization: row?.personalization ?? false,
    consentedAt: row?.consentedAt ? new Date(row.consentedAt).toISOString() : null,
  };
}

// ── Aggregate ────────────────────────────────────────────────────────────

export async function getAllSettings(userId: string) {
  const repo = prefsRepo();
  const prefs = await repo.findAccountByUserId(userId);
  const mfaEnabled = await findUserMfaEnabled(userId);
  return {
    notifications: prefs ? resolvePreferencesFromRow(prefs) : defaultNotificationPreferences(),
    privacy: await getPrivacy(userId),
    jobPreferences: await getJobPreferences(userId),
    account: accountView(prefs),
    security: { twoFactorEnabled: mfaEnabled ?? false, loginNotifications: true, sessionTimeout: 30, allowedDevices: [] },
  };
}

// ── Notifications ────────────────────────────────────────────────────────

export async function getNotificationSettings(userId: string) {
  const prefs = await prefsRepo().findAccountByUserId(userId);
  return prefs ? resolvePreferencesFromRow(prefs) : defaultNotificationPreferences();
}

/** Merge the partial patch over the persisted matrix, persist the granular
 *  blob + derived coarse columns, drop the dispatcher's cached copy.
 *  SSoT = shared/notification-preferences.ts (#254). */
export async function updateNotificationSettings(userId: string, body: unknown) {
  const repo = prefsRepo();
  const existing = await repo.findAccountByUserId(userId);
  const next = mergeNotificationPreferences(body, resolvePreferencesFromRow(existing));
  await repo.upsertAccount(userId, { notificationPreferences: next, ...granularToLegacy(next) } as any);
  invalidateNotificationPreferences(userId);
  return next;
}

// ── Privacy ──────────────────────────────────────────────────────────────

export async function getPrivacy(userId: string): Promise<Record<string, boolean>> {
  const row = await prefsRepo().findPrivacyByUserId(userId);
  if (!row) return defaultPrivacyPreferences();
  const out: Record<string, boolean> = {};
  for (const field of PRIVACY_FIELDS) out[field] = (row as Record<string, any>)[field];
  return out;
}

/** Whitelist: only known boolean fields are written (coerced). */
export async function updatePrivacy(userId: string, body: unknown) {
  const b = bodyRecord(body);
  const updates: Record<string, boolean> = {};
  for (const field of PRIVACY_FIELDS) {
    if (field in b) updates[field] = Boolean(b[field]);
  }
  await prefsRepo().upsertPrivacy(userId, updates);
  return getPrivacy(userId);
}

// ── Cookies (shared by /cookies page + Settings → Cookies) ──────────────
// Essential cookies are always on and not stored; only opt-in categories persist.

export async function getCookiePreferences(userId: string) {
  const row = await prefsRepo().findCookieByUserId(userId);
  if (!row) return defaultCookiePreferences();
  return cookieView(row);
}

/** Only opt-in category booleans are writable; "essential" is dropped. */
export async function updateCookiePreferences(userId: string, body: unknown) {
  const b = bodyRecord(body);
  const updates: Record<string, boolean> = {};
  for (const field of COOKIE_CATEGORY_FIELDS) {
    if (field in b) updates[field] = Boolean(b[field]);
  }
  const repo = prefsRepo();
  await repo.upsertCookie(userId, updates);
  return cookieView(await repo.findCookieByUserId(userId));
}

// ── Job preferences ──────────────────────────────────────────────────────

export async function getJobPreferences(userId: string): Promise<JobPreferences> {
  const [row, profile] = await Promise.all([prefsRepo().findJobByUserId(userId), findProfileCols(userId)]);
  return jobPreferencesView(row, profile);
}

/** Partial update: only fields present in the (validated) body are written,
 *  each to its one home — job_preferences via PreferencesRepository, roles /
 *  industries / currency via the profile owner. Returns the state read back. */
export async function updateJobPreferences(userId: string, body: unknown): Promise<JobPreferences> {
  const parsed = JobPreferencesPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid job preferences", { issues: parsed.error.flatten() });
  }
  const p = parsed.data;

  const job: Partial<JobPreferencesInsert> = {};
  if (p.desiredTitle !== undefined) job.desiredTitle = p.desiredTitle || null;
  if (p.desiredLocation !== undefined) job.desiredLocation = p.desiredLocation || null;
  if (p.remoteOnly !== undefined) job.remotePreference = p.remoteOnly ? "remote" : "any";
  if (p.minSalaryExpectation !== undefined) job.salaryMin = p.minSalaryExpectation == null ? null : String(p.minSalaryExpectation);
  if (p.maxSalaryExpectation !== undefined) job.salaryMax = p.maxSalaryExpectation == null ? null : String(p.maxSalaryExpectation);

  const profile: Record<string, unknown> = {};
  if (p.preferredRoles !== undefined) profile.preferredRoles = toList(p.preferredRoles);
  if (p.industries !== undefined) profile.industries = toList(p.industries);
  if (p.salaryCurrency !== undefined) profile.salaryCurrency = p.salaryCurrency;

  if (Object.keys(job).length > 0) await prefsRepo().upsertJob(userId, job);
  if (Object.keys(profile).length > 0) await upsertProfile(userId, { ...profile, updatedAt: new Date() });
  return getJobPreferences(userId);
}

// ── Account (theme / language / currency / timezone) ─────────────────────

export async function getAccountSettings(userId: string) {
  return accountView(await prefsRepo().findAccountByUserId(userId));
}

export async function updateAccountSettings(userId: string, body: unknown, roles: readonly string[]) {
  const repo = prefsRepo();
  await repo.upsertAccount(userId, sanitizeAccountUpdates(body, roles));
  const saved = await repo.findAccountByUserId(userId);
  return { ...defaultAccountSettings(), ...accountView(saved) };
}

// ── Extension preferences ────────────────────────────────────────────────

export async function getExtensionSettings(userId: string): Promise<ExtensionSettings> {
  const prefs = await prefsRepo().findAccountByUserId(userId);
  return mergeExtensionSettings(prefs?.extensionSettings);
}

export async function updateExtensionSettings(userId: string, body: unknown): Promise<ExtensionSettings> {
  const next = applyExtensionSettingsPatch(await getExtensionSettings(userId), body);
  await prefsRepo().upsertAccount(userId, { extensionSettings: next } as any);
  return next;
}
