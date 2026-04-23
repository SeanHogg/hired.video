export function defaultNotificationPreferences() {
  return {
    emailJobMatches: true,
    emailApplicationUpdates: true,
    emailMessages: true,
    emailConnectionRequests: true,
    emailWeeklyDigest: true,
    emailMarketingUpdates: false,
    pushJobMatches: true,
    pushApplicationUpdates: true,
    pushMessages: true,
    pushConnectionRequests: true,
    smsImportantUpdates: false,
    smsSecurityAlerts: true,
  };
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
    allowMessaging: true,
    shareAnalyticsData: true,
    shareUsageData: true,
    allowDataExport: true,
  };
}

export function defaultJobPreferences() {
  return {
    autoApplyEnabled: false,
    preferredJobTypes: [],
    preferredIndustries: [],
    preferredLocations: [],
    remoteOnly: false,
    willingToRelocate: false,
    minSalaryExpectation: null,
    maxSalaryExpectation: null,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    availableFrom: null,
    noticePeriodDays: null,
    preferredWorkingHours: [],
    jobMatchThreshold: null,
    onlyExactMatches: false,
    excludedCompanies: [],
    excludedKeywords: [],
  };
}

export function defaultAccountSettings() {
  return {
    theme: "system",
    language: "en",
    timezone: "UTC",
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
  };
}

/** String-typed columns on `account_preferences` that the PUT /api/Settings/
 *  account handler accepts. Kept separate from `defaultAccountSettings()`
 *  because `dateFormat` is a derived display preference, not a column. */
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
 * Exported for unit testing — the route handler uses this to build its
 * drizzle update object.
 */
export function sanitizeAccountUpdates(
  body: unknown,
): Partial<Record<AccountSettingsField, string>> {
  const out: Partial<Record<AccountSettingsField, string>> = {};
  if (!body || typeof body !== "object") return out;
  const record = body as Record<string, unknown>;
  for (const field of ACCOUNT_SETTINGS_STRING_FIELDS) {
    const raw = record[field];
    if (typeof raw === "string" && raw.length > 0) out[field] = raw;
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
