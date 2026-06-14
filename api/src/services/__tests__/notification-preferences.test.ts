/**
 * Unit tests for the notification-preference SSoT + the dispatcher gate
 * (gap #254). These pin the two things that turned the Settings toggles
 * from a facade into a real, enforced control:
 *
 *   1. The flat-key resolver (channel × category → key) + the
 *      type → category mapping the dispatcher uses.
 *   2. `isChannelAllowed` — the exact decision NotificationService.notify()
 *      makes before it fans a push out.
 *   3. The legacy ↔ granular projections so a pre-0480 row still resolves
 *      to a complete matrix and a granular save keeps the coarse columns
 *      consistent.
 *
 * Run: node --import tsx --test src/services/__tests__/notification-preferences.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  categoryForNotificationType,
  isChannelAllowed,
  isChannelEnabled,
  mergeNotificationPreferences,
  notificationPreferenceKey,
  type NotificationPreferences,
} from "../../../../shared/notification-preferences.js";
import {
  granularToLegacy,
  legacyToGranularBase,
  resolvePreferencesFromRow,
} from "../notifications/preferences.js";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...overrides };
}

describe("notificationPreferenceKey", () => {
  it("builds the flat key for valid channel×category pairs", () => {
    assert.equal(notificationPreferenceKey("push", "messages"), "pushMessages");
    assert.equal(notificationPreferenceKey("email", "marketingUpdates"), "emailMarketingUpdates");
    assert.equal(notificationPreferenceKey("sms", "securityAlerts"), "smsSecurityAlerts");
  });

  it("returns null for combinations that have no real toggle", () => {
    assert.equal(notificationPreferenceKey("push", "weeklyDigest"), null);
    assert.equal(notificationPreferenceKey("push", "marketingUpdates"), null);
    assert.equal(notificationPreferenceKey("email", "securityAlerts"), null);
    assert.equal(notificationPreferenceKey("sms", "messages"), null);
  });

  it("only ever returns keys that exist in the canonical key list", () => {
    for (const channel of ["email", "push", "sms"] as const) {
      for (const cat of ["messages", "jobMatches", "weeklyDigest", "securityAlerts"] as const) {
        const key = notificationPreferenceKey(channel, cat);
        if (key) assert.ok((NOTIFICATION_PREFERENCE_KEYS as readonly string[]).includes(key));
      }
    }
  });
});

describe("categoryForNotificationType", () => {
  it("maps dispatcher + emit discriminants regardless of casing", () => {
    assert.equal(categoryForNotificationType("connection_request"), "connectionRequests");
    assert.equal(categoryForNotificationType("message_received"), "messages");
    assert.equal(categoryForNotificationType("message-received"), "messages");
    assert.equal(categoryForNotificationType("service_inquiry"), "messages");
    assert.equal(categoryForNotificationType("review"), "messages");
    assert.equal(categoryForNotificationType("application_update"), "applicationUpdates");
  });

  it("returns null for types with no user-facing toggle (gamification/system/learning)", () => {
    for (const t of ["badge", "points", "course", "assignment", "certificate", "system", "feed_mention"]) {
      assert.equal(categoryForNotificationType(t), null, `${t} should be uncategorised`);
    }
  });
});

describe("isChannelAllowed (the dispatcher gate)", () => {
  it("honours the specific category toggle when the type maps to one", () => {
    const p = prefs({ pushMessages: false });
    assert.equal(isChannelAllowed(p, "push", "message_received"), false);
    assert.equal(isChannelAllowed(p, "push", "service_inquiry"), false);
    // A different category is unaffected by the messages toggle.
    assert.equal(isChannelAllowed(p, "push", "connection_request"), true);
  });

  it("falls back to the channel-level gate for uncategorised types", () => {
    // Badge has no toggle: allowed while ANY push toggle is on...
    assert.equal(isChannelAllowed(prefs(), "push", "badge"), true);
    // ...and suppressed once the whole push channel is disabled.
    const allPushOff = prefs({
      pushJobMatches: false,
      pushApplicationUpdates: false,
      pushMessages: false,
      pushConnectionRequests: false,
    });
    assert.equal(isChannelAllowed(allPushOff, "push", "badge"), false);
    assert.equal(isChannelAllowed(allPushOff, "push", "system"), false);
  });

  it("a single category toggle never silently drops an unrelated transactional push", () => {
    // Only messages disabled — a badge push (uncategorised) still goes out
    // because other push toggles remain on.
    const onlyMessagesOff = prefs({ pushMessages: false });
    assert.equal(isChannelAllowed(onlyMessagesOff, "push", "badge"), true);
  });
});

describe("isChannelEnabled", () => {
  it("is true when any toggle for the channel is on", () => {
    assert.equal(isChannelEnabled(prefs(), "push"), true);
    assert.equal(isChannelEnabled(prefs(), "email"), true);
  });
  it("is false only when every toggle for the channel is off", () => {
    const noPush = prefs({
      pushJobMatches: false,
      pushApplicationUpdates: false,
      pushMessages: false,
      pushConnectionRequests: false,
    });
    assert.equal(isChannelEnabled(noPush, "push"), false);
    assert.equal(isChannelEnabled(noPush, "email"), true); // email untouched
  });
});

describe("mergeNotificationPreferences", () => {
  it("fills missing keys from base then defaults", () => {
    const merged = mergeNotificationPreferences({ pushMessages: false }, { emailMessages: false });
    assert.equal(merged.pushMessages, false);          // from patch
    assert.equal(merged.emailMessages, false);         // from base
    assert.equal(merged.emailJobMatches, true);        // from defaults
  });

  it("drops unknown keys so callers can't inject arbitrary columns", () => {
    const merged = mergeNotificationPreferences({ hacker: true, pushMessages: false } as any);
    assert.equal((merged as any).hacker, undefined);
    assert.equal(merged.pushMessages, false);
    assert.equal(Object.keys(merged).length, NOTIFICATION_PREFERENCE_KEYS.length);
  });

  it("returns a complete defaults matrix for null/garbage input", () => {
    assert.deepEqual(mergeNotificationPreferences(null), DEFAULT_NOTIFICATION_PREFERENCES);
    assert.deepEqual(mergeNotificationPreferences("nonsense"), DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe("legacy ↔ granular projections", () => {
  it("legacyToGranularBase maps the coarse email columns onto the email toggles", () => {
    const base = legacyToGranularBase({
      emailNotificationsEnabled: false,
      marketingEmailsEnabled: true,
      weeklyDigestEnabled: false,
    });
    assert.equal(base.emailMessages, false);
    assert.equal(base.emailJobMatches, false);
    assert.equal(base.emailMarketingUpdates, true);
    assert.equal(base.emailWeeklyDigest, false);
  });

  it("granularToLegacy collapses the email toggles back to coarse columns", () => {
    const legacy = granularToLegacy(prefs({
      emailJobMatches: false,
      emailApplicationUpdates: false,
      emailMessages: false,
      emailConnectionRequests: false,
      emailMarketingUpdates: true,
      emailWeeklyDigest: false,
    }));
    assert.equal(legacy.emailNotificationsEnabled, false); // all transactional off
    assert.equal(legacy.marketingEmailsEnabled, true);
    assert.equal(legacy.weeklyDigestEnabled, false);
    assert.equal(legacy.jobAlertEmailsEnabled, false);
  });

  it("resolvePreferencesFromRow prefers the blob, falling back to legacy then defaults", () => {
    const resolved = resolvePreferencesFromRow({
      notificationPreferences: { pushMessages: false },
      emailNotificationsEnabled: false, // would set email* false via legacy...
    });
    assert.equal(resolved.pushMessages, false);     // from blob
    assert.equal(resolved.emailMessages, false);    // from legacy base
    assert.equal(resolved.smsSecurityAlerts, true); // from defaults
  });

  it("resolvePreferencesFromRow returns defaults for null rows", () => {
    assert.deepEqual(resolvePreferencesFromRow(null), DEFAULT_NOTIFICATION_PREFERENCES);
    assert.deepEqual(resolvePreferencesFromRow(undefined), DEFAULT_NOTIFICATION_PREFERENCES);
  });
});
