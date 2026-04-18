/**
 * Unit tests for the settings service — focused on the helpers that back
 * PUT /api/Settings/account.
 *
 * Regression context: the Appearance tab's Timezone picker appeared to save
 * but the value never round-tripped. Root cause was the PUT handler only
 * whitelisting theme/language/currency and discarding `body.timezone`, plus
 * GET hardcoding `timezone: "UTC"`. These tests pin the whitelist and the
 * defaults so that gap can't reopen silently.
 *
 * Run: node --import tsx --test src/services/__tests__/settings.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_SETTINGS_STRING_FIELDS,
  defaultAccountSettings,
  defaultJobPreferences,
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  defaultSecuritySettings,
  sanitizeAccountUpdates,
} from "../settings.js";

describe("ACCOUNT_SETTINGS_STRING_FIELDS", () => {
  it("includes timezone so the Appearance tab picker persists", () => {
    assert.ok(
      (ACCOUNT_SETTINGS_STRING_FIELDS as readonly string[]).includes("timezone"),
      "timezone must be in the PUT whitelist — the Appearance tab won't save otherwise",
    );
  });

  it("includes theme, language, currency for the other Appearance controls", () => {
    const fields = ACCOUNT_SETTINGS_STRING_FIELDS as readonly string[];
    for (const expected of ["theme", "language", "currency"]) {
      assert.ok(fields.includes(expected), `${expected} must be in whitelist`);
    }
  });
});

describe("sanitizeAccountUpdates", () => {
  it("returns an empty object for null/undefined/non-object bodies", () => {
    assert.deepEqual(sanitizeAccountUpdates(null), {});
    assert.deepEqual(sanitizeAccountUpdates(undefined), {});
    assert.deepEqual(sanitizeAccountUpdates("hello"), {});
    assert.deepEqual(sanitizeAccountUpdates(42), {});
  });

  it("accepts all four whitelisted string fields", () => {
    const out = sanitizeAccountUpdates({
      theme: "dark",
      language: "es",
      currency: "EUR",
      timezone: "America/Los_Angeles",
    });
    assert.deepEqual(out, {
      theme: "dark",
      language: "es",
      currency: "EUR",
      timezone: "America/Los_Angeles",
    });
  });

  it("persists timezone on its own (the actual bug that motivated this test)", () => {
    const out = sanitizeAccountUpdates({ timezone: "Europe/London" });
    assert.deepEqual(out, { timezone: "Europe/London" });
  });

  it("drops unknown fields so callers can't inject arbitrary columns", () => {
    const out = sanitizeAccountUpdates({
      userId: "hacker-controlled",
      createdAt: "2000-01-01",
      emailNotificationsEnabled: false,
      timezone: "UTC",
    });
    assert.deepEqual(out, { timezone: "UTC" });
    assert.ok(!("userId" in out), "userId must never leak through");
    assert.ok(!("createdAt" in out), "createdAt must never leak through");
  });

  it("drops empty strings and non-string values", () => {
    const out = sanitizeAccountUpdates({
      theme: "",
      language: null,
      currency: 123,
      timezone: "UTC",
    });
    assert.deepEqual(out, { timezone: "UTC" });
  });

  it("ignores missing fields so partial updates don't clobber other columns", () => {
    const out = sanitizeAccountUpdates({ theme: "dark" });
    assert.deepEqual(out, { theme: "dark" });
  });
});

describe("defaultAccountSettings", () => {
  it("returns the expected default shape", () => {
    assert.deepEqual(defaultAccountSettings(), {
      theme: "system",
      language: "en",
      timezone: "UTC",
      currency: "USD",
      dateFormat: "MM/DD/YYYY",
    });
  });

  it("includes a timezone default so GET /account never returns undefined for it", () => {
    assert.equal(defaultAccountSettings().timezone, "UTC");
  });
});

describe("other defaults are stable", () => {
  it("notifications defaults cover email + push + sms flags", () => {
    const d = defaultNotificationPreferences();
    assert.equal(d.emailJobMatches, true);
    assert.equal(d.emailMarketingUpdates, false);
    assert.equal(d.smsSecurityAlerts, true);
  });

  it("privacy defaults keep contact fields hidden by default", () => {
    const d = defaultPrivacyPreferences();
    assert.equal(d.showEmail, false);
    assert.equal(d.showPhone, false);
    assert.equal(d.profileVisibleToPublic, true);
  });

  it("job preferences default to non-auto-apply with empty selections", () => {
    const d = defaultJobPreferences();
    assert.equal(d.autoApplyEnabled, false);
    assert.deepEqual(d.preferredJobTypes, []);
    assert.equal(d.salaryCurrency, "USD");
  });

  it("security defaults to 2FA off with a 30-minute session timeout", () => {
    const d = defaultSecuritySettings();
    assert.equal(d.twoFactorEnabled, false);
    assert.equal(d.sessionTimeout, 30);
  });
});
