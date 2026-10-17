/**
 * Settings preference use cases — notifications, privacy, cookies,
 * job preferences, account (locale/theme) and extension preferences.
 * Backs /api/settings (routes/settings/*). One-row-per-user upserts go
 * through PreferencesRepository; user-row flags through
 * userSettingsRepository.
 */

import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { IPreferencesRepository, JobPreferencesRow } from "../../repositories/index.js";
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

function jobPreferencesView(row: JobPreferencesRow | null) {
  if (!row) return defaultJobPreferences();
  return {
    ...defaultJobPreferences(),
    desiredTitle: row.desiredTitle,
    desiredLocation: row.desiredLocation,
    remoteOnly: row.remotePreference === "remote",
    minSalaryExpectation: row.salaryMin ? Number(row.salaryMin) : null,
    maxSalaryExpectation: row.salaryMax ? Number(row.salaryMax) : null,
    isOpenToWork: row.isOpenToWork,
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
  const jobPrefs = await repo.findJobByUserId(userId);
  const mfaEnabled = await findUserMfaEnabled(userId);
  return {
    notifications: prefs ? resolvePreferencesFromRow(prefs) : defaultNotificationPreferences(),
    privacy: await getPrivacy(userId),
    jobPreferences: jobPreferencesView(jobPrefs),
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

export async function getJobPreferences(userId: string) {
  return jobPreferencesView(await prefsRepo().findJobByUserId(userId));
}

export async function updateJobPreferences(userId: string, body: unknown) {
  const b = bodyRecord(body) as Record<string, any>;
  await prefsRepo().upsertJob(userId, {
    desiredTitle: b.desiredTitle ?? null,
    desiredLocation: b.desiredLocation ?? null,
    remotePreference: b.remoteOnly ? "remote" : "any",
    salaryMin: b.minSalaryExpectation ?? null,
    salaryMax: b.maxSalaryExpectation ?? null,
    isOpenToWork: b.isOpenToWork ?? false,
  } as any);
  return { ...defaultJobPreferences(), ...b };
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
