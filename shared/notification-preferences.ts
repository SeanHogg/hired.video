/**
 * Notification preferences — single source of truth for the per-user
 * notification toggle matrix, shared by the backend (settings persistence
 * + the notification dispatcher) and the frontend Settings UI.
 *
 * The matrix is a flat set of `${channel}${Category}` boolean keys (the
 * shape the Settings form has always rendered). This module adds the two
 * things that were previously missing and made the feature a facade:
 *
 *   1. A canonical, validated shape (so the granular toggles actually
 *      persist instead of collapsing to one coarse boolean).
 *   2. A resolver — `categoryForNotificationType` + `isChannelAllowed` —
 *      so the dispatcher can honour a user's choice before it fans a
 *      notification out over a channel. Gap #254 ("read by the existing
 *      notifications dispatcher").
 *
 * An in-app/bell row is ALWAYS persisted (it is the inbox history); these
 * preferences gate the outbound CHANNELS (push today, email/SMS as those
 * dispatch paths are wired), never the durable record.
 */

import { z } from "zod";

export const NOTIFICATION_CHANNELS = ["email", "push", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Categories that have at least one user-facing toggle. Not every
 *  (channel, category) pair is valid — see NOTIFICATION_PREFERENCE_KEYS. */
export const NOTIFICATION_CATEGORIES = [
  "jobMatches",
  "applicationUpdates",
  "messages",
  "connectionRequests",
  "weeklyDigest",
  "marketingUpdates",
  "importantUpdates",
  "securityAlerts",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * The flat preference keys that actually exist as toggles. Kept as an
 * explicit list (rather than the full channel×category cross-product)
 * because the UI only exposes meaningful combinations — e.g. there is no
 * "push weekly digest" or "email security alert".
 */
export const NOTIFICATION_PREFERENCE_KEYS = [
  "emailJobMatches",
  "emailApplicationUpdates",
  "emailMessages",
  "emailConnectionRequests",
  "emailWeeklyDigest",
  "emailMarketingUpdates",
  "pushJobMatches",
  "pushApplicationUpdates",
  "pushMessages",
  "pushConnectionRequests",
  "smsImportantUpdates",
  "smsSecurityAlerts",
] as const;
export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

/** Marketing is opt-in (false); important security/transactional defaults on. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
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

/** Build the flat key for a (channel, category) pair, or null when that
 *  combination isn't a real toggle. */
export function notificationPreferenceKey(
  channel: NotificationChannel,
  category: NotificationCategory,
): NotificationPreferenceKey | null {
  const key = `${channel}${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  return (NOTIFICATION_PREFERENCE_KEYS as readonly string[]).includes(key)
    ? (key as NotificationPreferenceKey)
    : null;
}

/**
 * Map a dispatcher notification `type` to the preference category it
 * belongs to, or null when the type has no user-facing toggle (e.g.
 * gamification, system, learning). Unmapped types fall back to the
 * channel-level gate so "turn off push entirely" still suppresses them,
 * but a single category toggle never silently drops an unrelated type.
 *
 * Accepts both the `NotificationService.notify()` union and the looser
 * `emitNotification()` string discriminants (connection_request,
 * message_received, feed_*), normalising snake/kebab/camel casing.
 */
export function categoryForNotificationType(type: string): NotificationCategory | null {
  const t = type.toLowerCase().replace(/[-\s]/g, "_");
  if (t.includes("connection")) return "connectionRequests";
  if (t.includes("message") || t === "service_inquiry" || t === "review") return "messages";
  if (t.includes("application") || t === "applied" || t === "interview" || t === "offer") {
    return "applicationUpdates";
  }
  if (t.includes("job_match") || t === "jobmatch" || t === "job_alert") return "jobMatches";
  if (t === "marketing") return "marketingUpdates";
  if (t === "weekly_digest" || t === "digest") return "weeklyDigest";
  return null;
}

/** True when ANY toggle for the channel is on — the channel-level gate
 *  used for notification types that have no specific category toggle. */
export function isChannelEnabled(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
): boolean {
  return NOTIFICATION_PREFERENCE_KEYS.some((key) => key.startsWith(channel) && prefs[key]);
}

/**
 * The dispatcher gate: may a notification of `type` go out over `channel`
 * for a user with these preferences?
 *
 *   - type maps to a category with a toggle → honour that specific toggle.
 *   - otherwise → honour the channel-level gate (so disabling the whole
 *     channel suppresses uncategorised types too, but a lone category
 *     toggle never drops an unrelated transactional push).
 */
export function isChannelAllowed(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
  type: string,
): boolean {
  const category = categoryForNotificationType(type);
  const key = category ? notificationPreferenceKey(channel, category) : null;
  if (key) return prefs[key];
  return isChannelEnabled(prefs, channel);
}

/** Zod schema — every key optional so partial PATCH bodies are accepted;
 *  `mergeNotificationPreferences` fills the rest from current/defaults. */
export const NotificationPreferencesSchema = z
  .object(
    Object.fromEntries(
      NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, z.boolean().optional()]),
    ) as Record<NotificationPreferenceKey, z.ZodOptional<z.ZodBoolean>>,
  )
  .strip();

export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesSchema>;

/**
 * Coerce an unknown stored/incoming blob into a complete, valid
 * preferences object. Unknown keys are dropped; missing keys fall back to
 * `base` (the user's current persisted prefs) then to the defaults.
 */
export function mergeNotificationPreferences(
  patch: unknown,
  base: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  const parsed = NotificationPreferencesSchema.safeParse(patch ?? {});
  const incoming = parsed.success ? parsed.data : {};
  const out = {} as NotificationPreferences;
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    out[key] =
      incoming[key] ?? base[key] ?? DEFAULT_NOTIFICATION_PREFERENCES[key];
  }
  return out;
}
