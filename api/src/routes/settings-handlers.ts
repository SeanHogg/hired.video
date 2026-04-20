/**
 * Pure settings handlers for notifications / privacy / job preferences /
 * account / extension-preferences. Read and write endpoints both go
 * through here so the DB upserts + whitelist-driven field mapping can
 * be tested without spinning up a real Postgres.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db/index.js";
import {
  defaultAccountSettings,
  defaultJobPreferences,
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  sanitizeAccountUpdates,
} from "../services/settings.js";
import {
  PRIVACY_FIELDS,
  defaultExtensionSettings,
  mergeExtensionSettings,
} from "./settings.js";

const { accountPreferences, jobPreferences, privacyPreferences } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;
export interface SettingsDeps {
  db: DbPort;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface HandlerResult<T = unknown> {
  status: number;
  body: T;
}

function ok<T>(data: T, status = 200): HandlerResult<{ success: true; data: T; timestamp: string }> {
  return { status, body: { success: true as const, data, timestamp: new Date().toISOString() } };
}

function fail(status: number, code: string, message: string) {
  return {
    status,
    body: {
      success: false as const,
      error: { code, message },
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Privacy — exercised by GET/PUT /api/settings/privacy
// ---------------------------------------------------------------------------

async function loadPrivacy(deps: SettingsDeps, uid: string) {
  const [row] = await deps.db
    .select()
    .from(privacyPreferences)
    .where(eq(privacyPreferences.userId, uid))
    .limit(1);
  if (!row) return defaultPrivacyPreferences();
  const out: Record<string, boolean> = {};
  for (const field of PRIVACY_FIELDS) {
    out[field] = (row as any)[field];
  }
  return out;
}

export async function handleGetPrivacy(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  return ok(await loadPrivacy(deps, viewerId));
}

/** Only known boolean flags are accepted. Anything else is ignored —
 *  prevents arbitrary JSON keys from leaking into the privacy table. */
export async function handleUpdatePrivacy(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const updates: Record<string, unknown> = { updatedAt: deps.now() };
  const src = (body ?? {}) as Record<string, unknown>;
  for (const field of PRIVACY_FIELDS) {
    if (field in src) updates[field] = Boolean(src[field]);
  }
  await deps.db
    .insert(privacyPreferences)
    .values({ userId: viewerId, ...updates } as any)
    .onConflictDoUpdate({ target: privacyPreferences.userId, set: updates as any });
  return ok(await loadPrivacy(deps, viewerId));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function handleGetNotifications(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const [prefs] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, viewerId))
    .limit(1);
  if (!prefs) return ok(defaultNotificationPreferences());
  return ok({
    ...defaultNotificationPreferences(),
    emailJobMatches: prefs.emailNotificationsEnabled,
    emailApplicationUpdates: prefs.emailNotificationsEnabled,
    emailMessages: prefs.emailNotificationsEnabled,
    emailConnectionRequests: prefs.emailNotificationsEnabled,
    emailWeeklyDigest: prefs.weeklyDigestEnabled,
    emailMarketingUpdates: prefs.marketingEmailsEnabled,
    jobAlertEmailsEnabled: prefs.jobAlertEmailsEnabled,
  });
}

export async function handleUpdateNotifications(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const src = (body ?? {}) as Record<string, unknown>;
  const updates = {
    emailNotificationsEnabled: Boolean(src.emailJobMatches ?? src.emailMessages ?? true),
    marketingEmailsEnabled: Boolean(src.emailMarketingUpdates ?? false),
    jobAlertEmailsEnabled: Boolean(src.jobAlertEmailsEnabled ?? true),
    weeklyDigestEnabled: Boolean(src.emailWeeklyDigest ?? true),
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(accountPreferences)
    .values({ userId: viewerId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates as any });
  return ok({ ...defaultNotificationPreferences(), ...src });
}

// ---------------------------------------------------------------------------
// Account settings (theme / language / currency / timezone / dateFormat)
// ---------------------------------------------------------------------------

export async function handleGetAccountSettings(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const [prefs] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, viewerId))
    .limit(1);
  return ok({
    theme: prefs?.theme ?? "system",
    language: prefs?.language ?? "en",
    currency: prefs?.currency ?? "USD",
    dateFormat: "MM/DD/YYYY",
    timezone: prefs?.timezone ?? "UTC",
  });
}

export async function handleUpdateAccountSettings(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const updates: Record<string, unknown> = {
    ...sanitizeAccountUpdates((body ?? {}) as Record<string, unknown>),
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(accountPreferences)
    .values({ userId: viewerId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates });
  const [saved] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, viewerId))
    .limit(1);
  return ok({
    ...defaultAccountSettings(),
    theme: saved?.theme ?? "system",
    language: saved?.language ?? "en",
    currency: saved?.currency ?? "USD",
    timezone: saved?.timezone ?? "UTC",
  });
}

// ---------------------------------------------------------------------------
// Job preferences
// ---------------------------------------------------------------------------

export const JobPreferencesSchema = z.object({
  desiredTitle: z.string().optional().nullable(),
  desiredLocation: z.string().optional().nullable(),
  remoteOnly: z.boolean().optional(),
  minSalaryExpectation: z.number().optional().nullable(),
  maxSalaryExpectation: z.number().optional().nullable(),
  isOpenToWork: z.boolean().optional(),
});

export async function handleGetJobPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const [prefs] = await deps.db
    .select()
    .from(jobPreferences)
    .where(eq(jobPreferences.userId, viewerId))
    .limit(1);
  if (!prefs) return ok(defaultJobPreferences());
  return ok({
    ...defaultJobPreferences(),
    desiredTitle: prefs.desiredTitle,
    desiredLocation: prefs.desiredLocation,
    remoteOnly: prefs.remotePreference === "remote",
    minSalaryExpectation: prefs.salaryMin ? Number(prefs.salaryMin) : null,
    maxSalaryExpectation: prefs.salaryMax ? Number(prefs.salaryMax) : null,
    isOpenToWork: prefs.isOpenToWork,
  });
}

export async function handleUpdateJobPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const parsed = JobPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid body");
  }
  const updates = {
    desiredTitle: parsed.data.desiredTitle ?? null,
    desiredLocation: parsed.data.desiredLocation ?? null,
    remotePreference: parsed.data.remoteOnly ? "remote" : "any",
    salaryMin: parsed.data.minSalaryExpectation ?? null,
    salaryMax: parsed.data.maxSalaryExpectation ?? null,
    isOpenToWork: parsed.data.isOpenToWork ?? false,
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(jobPreferences)
    .values({ userId: viewerId, ...updates as any })
    .onConflictDoUpdate({ target: jobPreferences.userId, set: updates as any });
  return ok({ ...defaultJobPreferences(), ...parsed.data });
}

// ---------------------------------------------------------------------------
// Extension preferences (chrome extension side panels)
// ---------------------------------------------------------------------------

export async function handleGetExtensionPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const [prefs] = await deps.db
    .select({ extensionSettings: accountPreferences.extensionSettings })
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, viewerId))
    .limit(1);
  return ok(mergeExtensionSettings(prefs?.extensionSettings));
}

export async function handleUpdateExtensionPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");

  // Merge client patch over the stored blob so partial updates (just
  // one toggle) don't wipe other surfaces' settings.
  const [existing] = await deps.db
    .select({ extensionSettings: accountPreferences.extensionSettings })
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, viewerId))
    .limit(1);
  const current = mergeExtensionSettings(existing?.extensionSettings);
  const patch = (body && typeof body === "object" ? body : {}) as Record<string, any>;

  const next = {
    jobseeker: {
      ...current.jobseeker,
      ...(patch.jobseeker && typeof patch.jobseeker === "object" ? patch.jobseeker : {}),
    },
    recruiter: {
      ...current.recruiter,
      ...(patch.recruiter && typeof patch.recruiter === "object" ? patch.recruiter : {}),
    },
  };

  const updates = { extensionSettings: next, updatedAt: deps.now() };
  await deps.db
    .insert(accountPreferences)
    .values({ userId: viewerId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates as any });

  return ok(next);
}

/** Re-export for tests / other consumers that need the default shape. */
export { defaultExtensionSettings, mergeExtensionSettings };
