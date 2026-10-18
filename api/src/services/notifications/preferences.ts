/**
 * Notification-preference resolution for the dispatcher.
 *
 * The Settings handlers OWN the write path (persist the granular blob on
 * `user_settings`); this module owns the READ path the dispatcher
 * hits on every notification. Reads are served through the canonical
 * isolate-local read-through cache (getOrSetIsolateCached — no KV write
 * per miss on Workers Free) and
 * invalidated by the settings write, since preferences change rarely but
 * are read on every fan-out (gap #254; perf hook: no per-notification DB
 * round-trip).
 *
 * The coarse `*_enabled` booleans on `user_settings` predate the
 * granular matrix and are still read by legacy callers
 * (services/user/account.ts). `granularToLegacy` / `legacyToGranularBase`
 * are the single projection seam between the two representations so the
 * write path keeps them consistent and the read path can hydrate a full
 * matrix from a pre-migration row.
 */

import { getDb, schema } from "../../db/index.js";
import { savedSettingsOf } from "../../repositories/preferencesRepository.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  type NotificationPreferences,
} from "../../../../shared/notification-preferences.js";

const { userSettings } = schema;

/** Isolate-local: other warm isolates converge within this TTL after a write. */
const PREFS_TTL_SECONDS = 120;

export function notificationPrefsCacheKey(userId: string): string {
  return `notif-prefs:${userId}`;
}

/** Row subset the projections need. `any` because callers pass either a
 *  full Drizzle row or a partial select. */
type PrefsRow = {
  notificationPreferences?: Record<string, boolean> | null;
  emailNotificationsEnabled?: boolean | null;
  weeklyDigestEnabled?: boolean | null;
} | null
  | undefined;

/**
 * Hydrate a granular base from the legacy coarse columns, used as the
 * fallback when a row predates the JSONB blob. Mirrors the historical
 * GET mapping so behaviour is unchanged for un-migrated users.
 */
export function legacyToGranularBase(row: PrefsRow): Partial<NotificationPreferences> {
  if (!row) return {};
  const email = row.emailNotificationsEnabled ?? true;
  // `emailMarketingUpdates` is no longer hydrated from a coarse column (the
  // `marketing_emails_enabled` column was retired in 0487, #1976) — it now
  // comes from the granular JSONB blob (or its default) via
  // mergeNotificationPreferences.
  return {
    emailJobMatches: email,
    emailApplicationUpdates: email,
    emailMessages: email,
    emailConnectionRequests: email,
    emailWeeklyDigest: row.weeklyDigestEnabled ?? true,
  };
}

/** Project the granular matrix back onto the coarse legacy columns so
 *  the older readers (account.ts) stay consistent after a granular save. */
export function granularToLegacy(prefs: NotificationPreferences): {
  emailNotificationsEnabled: boolean;
  jobAlertEmailsEnabled: boolean;
  weeklyDigestEnabled: boolean;
} {
  // `marketingEmailsEnabled` dropped — its backing column was retired in 0487
  // (#1976); the granular `emailMarketingUpdates` toggle still lives in the
  // JSONB blob but no longer projects onto a coarse column.
  return {
    emailNotificationsEnabled:
      prefs.emailJobMatches ||
      prefs.emailApplicationUpdates ||
      prefs.emailMessages ||
      prefs.emailConnectionRequests,
    jobAlertEmailsEnabled: prefs.emailJobMatches,
    weeklyDigestEnabled: prefs.emailWeeklyDigest,
  };
}

/** Resolve a complete preference matrix from a (possibly partial,
 *  possibly pre-migration) account_preferences row. Pure — no I/O. */
export function resolvePreferencesFromRow(row: PrefsRow): NotificationPreferences {
  return mergeNotificationPreferences(
    row?.notificationPreferences ?? {},
    legacyToGranularBase(row),
  );
}

/**
 * The dispatcher's read path: a user's full notification matrix, cached.
 * A user who never saved account settings gets the defaults.
 */
export async function loadNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  return getOrSetIsolateCached<NotificationPreferences>({
    key: notificationPrefsCacheKey(userId),
    ttlSeconds: PREFS_TTL_SECONDS,
    loader: async () => {
      const db = getDb();
      const [row] = await db
        .select({
          notificationPreferences: userSettings.notificationPreferences,
          emailNotificationsEnabled: userSettings.emailNotificationsEnabled,
          weeklyDigestEnabled: userSettings.weeklyDigestEnabled,
        })
        .from(userSettings)
        .where(savedSettingsOf(userId, "account"))
        .limit(1);
      return row ? resolvePreferencesFromRow(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
    },
  });
}

/** Drop the cached matrix — MUST be called by every preference write. */
export function invalidateNotificationPreferences(userId: string): void {
  invalidateIsolateKey(notificationPrefsCacheKey(userId));
}
