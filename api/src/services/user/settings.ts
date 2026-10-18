import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../../../shared/notification-preferences.js";
import { DEFAULT_JOB_PREFERENCES, type JobPreferences } from "../../../../shared/settings.js";

/** Canonical default notification matrix. SSoT is
 *  shared/notification-preferences.ts so the dispatcher + frontend agree. */
export function defaultNotificationPreferences() {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export function defaultPrivacyPreferences() {
  return {
    profileVisibleToPublic: true,
    profileVisibleToRecruiters: true,
    allowSearchEngineIndexing: true,
    showActivityStatus: true,
    showConnectionsList: true,
    allowDirectMessages: true,
    allowConnectionRequests: true,
    showEmail: false,
    showPhone: false,
    showLocation: false,
    promoteWithoutAuth: false,
    allowMessaging: true,
    shareAnalyticsData: true,
    shareUsageData: true,
    allowDataExport: true,
  };
}

/** Settings › Job preferences defaults. SSoT is shared/settings.ts (the
 *  API contract the form parses with). */
export function defaultJobPreferences(): JobPreferences {
  return { ...DEFAULT_JOB_PREFERENCES, preferredRoles: [], industries: [] };
}

export function defaultAccountSettings() {
  return {
    theme: "system",
    language: "en",
    timezone: "UTC",
    currency: "USD",
  };
}

/** String-typed account-section columns on `user_settings` that the PUT /api/Settings/
 *  account handler accepts. */
export const ACCOUNT_SETTINGS_STRING_FIELDS = [
  "theme",
  "language",
  "currency",
  "timezone",
] as const;

export type AccountSettingsField = (typeof ACCOUNT_SETTINGS_STRING_FIELDS)[number];

/**
 * Whitelist and coerce the body of PUT /api/Settings/account. Returns only
 * the recognised string fields present in `body`, discarding everything else
 * so callers can't inject arbitrary columns (e.g. `userId`, `createdAt`).
 *
 * `language` is additionally constrained to the SUPPORTED_LOCALES enum,
 * with the `'w'` debug locale gated to super_admin via canPickLocale.
 * `roles` defaults to [] so callers that don't care about gated locales
 * (e.g. legacy code) just get the public-locale subset.
 *
 * Exported for unit testing — the route handler uses this to build its
 * drizzle update object.
 */
import { canPickLocale } from "../../../../shared/i18n.js";

export function sanitizeAccountUpdates(
  body: unknown,
  roles: readonly string[] = [],
): Partial<Record<AccountSettingsField, string>> {
  const out: Partial<Record<AccountSettingsField, string>> = {};
  if (!body || typeof body !== "object") return out;
  const record = body as Record<string, unknown>;
  for (const field of ACCOUNT_SETTINGS_STRING_FIELDS) {
    const raw = record[field];
    if (typeof raw !== "string" || raw.length === 0) continue;
    if (field === "language" && !canPickLocale(raw, roles)) continue;
    out[field] = raw;
  }
  return out;
}

export function defaultCookiePreferences() {
  return {
    // Essential is always on and not persisted; surfaced here so the UI has a
    // single source of truth for the full set of categories it renders.
    essential: true,
    analytics: false,
    marketing: false,
    personalization: false,
    consentedAt: null as string | null,
  };
}

export type CookiePreferencesDTO = ReturnType<typeof defaultCookiePreferences>;

export const COOKIE_CATEGORY_FIELDS = ["analytics", "marketing", "personalization"] as const;
export type CookieCategoryField = (typeof COOKIE_CATEGORY_FIELDS)[number];

export function defaultSecuritySettings() {
  return {
    twoFactorEnabled: false,
    loginNotifications: true,
    sessionTimeout: 30,
    allowedDevices: [],
  };
}
