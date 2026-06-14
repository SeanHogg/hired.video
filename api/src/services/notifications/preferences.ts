/**
 * Notification-preference resolution for the dispatcher.
 *
 * The Settings handlers OWN the write path (persist the granular blob on
 * `account_preferences`); this module owns the READ path the dispatcher
 * hits on every notification. Reads are served through the canonical
 * read-through cache (getOrSetCached — L1 isolate Map + L2 KV) and
 * invalidated by the settings write, since preferences change rarely but
 * are read on every fan-out (gap #254; perf hook: no per-notification DB
 * round-trip).
 *
 * The coarse `*_enabled` booleans on `account_preferences` predate the
 * granular matrix and are still read by legacy callers
 * (services/user/account.ts). `granularToLegacy` / `legacyToGranularBase`
 * are the single projection seam between the two representations so the
 * write path keeps them consistent and the read path can hydrate a full
 * matrix from a pre-migration row.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  type NotificationPreferences,
} from "../../../../shared/notification-preferences.js";

const { accountPreferences } = schema;

const PREFS_TTL_SECONDS = 300;

export function notificationPrefsCacheKey(userId: string): string {
  return `notif-prefs:${userId}`;
}

/** Row subset the projections need. `any` because callers pass either a
 *  full Drizzle row or a partial select. */
type PrefsRow = {
  notificationPreferences?: Record<string, boolean> | null;
  emailNotificationsEnabled?: boolean | null;
  marketingEmailsEnabled?: boolean | null;
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
  return {
    emailJobMatches: email,
    emailApplicationUpdates: email,
    emailMessages: email,
    emailConnectionRequests: email,
    emailWeeklyDigest: row.weeklyDigestEnabled ?? true,
    emailMarketingUpdates: row.marketingEmailsEnabled ?? false,
  };
}

/** Project the granular matrix back onto the coarse legacy columns so
 *  the older readers (account.ts) stay consistent after a granular save. */
export function granularToLegacy(prefs: NotificationPreferences): {
  emailNotificationsEnabled: boolean;
  marketingEmailsEnabled: boolean;
  jobAlertEmailsEnabled: boolean;
  weeklyDigestEnabled: boolean;
} {
  return {
    emailNotificationsEnabled:
      prefs.emailJobMatches ||
      prefs.emailApplicationUpdates ||
      prefs.emailMessages ||
      prefs.emailConnectionRequests,
    marketingEmailsEnabled: prefs.emailMarketingUpdates,
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
 * A user with no `account_preferences` row gets the defaults.
 */
export async function loadNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  return getOrSetCached<NotificationPreferences>({
    key: notificationPrefsCacheKey(userId),
    ttlSeconds: PREFS_TTL_SECONDS,
    loader: async () => {
      const db = getDb();
      const [row] = await db
        .select({
          notificationPreferences: accountPreferences.notificationPreferences,
          emailNotificationsEnabled: accountPreferences.emailNotificationsEnabled,
          marketingEmailsEnabled: accountPreferences.marketingEmailsEnabled,
          weeklyDigestEnabled: accountPreferences.weeklyDigestEnabled,
        })
        .from(accountPreferences)
        .where(eq(accountPreferences.userId, userId))
        .limit(1);
      return row ? resolvePreferencesFromRow(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
    },
  });
}

/** Drop the cached matrix — MUST be called by every preference write. */
export function invalidateNotificationPreferences(userId: string): void {
  invalidateCachedKey(notificationPrefsCacheKey(userId));
}
