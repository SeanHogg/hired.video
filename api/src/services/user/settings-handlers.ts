/**
 * Pure settings handlers for notifications / privacy / job preferences /
 * account / extension-preferences. Read and write endpoints both go
 * through here so the DB upserts + whitelist-driven field mapping can
 * be tested without spinning up a real Postgres.
 */

import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import {
  defaultAccountSettings,
  defaultJobPreferences,
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  sanitizeAccountUpdates,
} from "./settings.js";
import {
  PRIVACY_FIELDS,
  defaultExtensionSettings,
  mergeExtensionSettings,
} from "../../routes/settings.js";
import { mergeNotificationPreferences } from "../../../../shared/notification-preferences.js";
import {
  granularToLegacy,
  invalidateNotificationPreferences,
  resolvePreferencesFromRow,
} from "../notifications/preferences.js";

const { accountPreferences, jobPreferences, privacyPreferences } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;
export interface SettingsDeps {
  db: DbPort;
  now: () => Date;
}

// Result envelope + auth guard live in the shared handler module.
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

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
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  return ok(await loadPrivacy(deps, auth.userId));
}

/** Only known boolean flags are accepted. Anything else is ignored —
 *  prevents arbitrary JSON keys from leaking into the privacy table. */
export async function handleUpdatePrivacy(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const updates: Record<string, unknown> = { updatedAt: deps.now() };
  const src = (body ?? {}) as Record<string, unknown>;
  for (const field of PRIVACY_FIELDS) {
    if (field in src) updates[field] = Boolean(src[field]);
  }
  await deps.db
    .insert(privacyPreferences)
    .values({ userId: auth.userId, ...updates } as any)
    .onConflictDoUpdate({ target: privacyPreferences.userId, set: updates as any });
  return ok(await loadPrivacy(deps, auth.userId));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function handleGetNotifications(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const [prefs] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
    .limit(1);
  if (!prefs) return ok(defaultNotificationPreferences());
  return ok(resolvePreferencesFromRow(prefs));
}

export async function handleUpdateNotifications(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  // Merge the (possibly partial) patch over the user's CURRENT persisted
  // matrix so a single toggle never wipes the others — then persist the
  // full granular blob AND the derived coarse columns in one upsert, and
  // drop the dispatcher's cached copy so the new prefs take effect now.
  const [existing] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
    .limit(1);
  const base = resolvePreferencesFromRow(existing);
  const next = mergeNotificationPreferences(body, base);

  const updates = {
    notificationPreferences: next,
    ...granularToLegacy(next),
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(accountPreferences)
    .values({ userId: auth.userId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates as any });
  invalidateNotificationPreferences(auth.userId);
  return ok(next);
}

// ---------------------------------------------------------------------------
// Account settings (theme / language / currency / timezone)
// ---------------------------------------------------------------------------

export async function handleGetAccountSettings(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const [prefs] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
    .limit(1);
  return ok({
    theme: prefs?.theme ?? "system",
    language: prefs?.language ?? "en",
    currency: prefs?.currency ?? "USD",
    timezone: prefs?.timezone ?? "UTC",
  });
}

export async function handleUpdateAccountSettings(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
  roles: readonly string[] = [],
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const updates: Record<string, unknown> = {
    ...sanitizeAccountUpdates((body ?? {}) as Record<string, unknown>, roles),
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(accountPreferences)
    .values({ userId: auth.userId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates });
  const [saved] = await deps.db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
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

// Canonical source is shared/settings.ts.
import { JobPreferencesSchema } from "../../../../shared/settings.js";
export { JobPreferencesSchema };

export async function handleGetJobPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const [prefs] = await deps.db
    .select()
    .from(jobPreferences)
    .where(eq(jobPreferences.userId, auth.userId))
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
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
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
    .values({ userId: auth.userId, ...updates as any })
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
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const [prefs] = await deps.db
    .select({ extensionSettings: accountPreferences.extensionSettings })
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
    .limit(1);
  return ok(mergeExtensionSettings(prefs?.extensionSettings));
}

export async function handleUpdateExtensionPreferences(
  deps: SettingsDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  // Merge client patch over the stored blob so partial updates (just
  // one toggle) don't wipe other surfaces' settings.
  const [existing] = await deps.db
    .select({ extensionSettings: accountPreferences.extensionSettings })
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, auth.userId))
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
    .values({ userId: auth.userId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates as any });

  return ok(next);
}

/** Re-export for tests / other consumers that need the default shape. */
export { defaultExtensionSettings, mergeExtensionSettings };
