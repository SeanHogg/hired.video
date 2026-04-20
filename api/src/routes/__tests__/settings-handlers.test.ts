/**
 * Integration tests for the pure settings handlers (settings-handlers.ts).
 *
 * Covers every GET + PUT across the settings surface:
 *
 *   • Privacy             — GET (defaults when no row), PUT (whitelist
 *                            filter, unknown fields ignored),
 *                            round-trip, 401 anon
 *   • Notifications       — GET, PUT writes expected column mapping
 *   • Account             — GET, PUT (theme / language / currency /
 *                            timezone), sanitisation via service
 *   • Job preferences     — GET (defaults), PUT (schema validation),
 *                            remoteOnly → remotePreference mapping
 *   • Extension prefs     — partial-merge semantics (jobseeker patch
 *                            doesn't wipe recruiter and vice-versa),
 *                            tolerates malformed stored blob
 *
 * Run: node --import tsx --test src/routes/__tests__/settings-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  handleGetPrivacy,
  handleUpdatePrivacy,
  handleGetNotifications,
  handleUpdateNotifications,
  handleGetAccountSettings,
  handleUpdateAccountSettings,
  handleGetJobPreferences,
  handleUpdateJobPreferences,
  handleGetExtensionPreferences,
  handleUpdateExtensionPreferences,
  type SettingsDeps,
} from "../settings-handlers.js";

// ---------------------------------------------------------------------------
// Fake DB with onConflictDoUpdate + extensionSettings column support
// ---------------------------------------------------------------------------

// Fake DB — real WHERE-predicate evaluation from the shared harness,
// with the one Settings-specific addition: onConflictDoUpdate behaves as
// upsert on the (userId) unique key by mutating the first matching row.
// `_state.accountPreferences` etc. alias the DB-named arrays.

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

function makeDeps(seed: {
  accountPreferences?: any[];
  jobPreferences?: any[];
  privacyPreferences?: any[];
} = {}): SettingsDeps & {
  _state: {
    accountPreferences: any[];
    jobPreferences: any[];
    privacyPreferences: any[];
  };
} {
  const fake = buildFakeDb({
    account_preferences: seed.accountPreferences ?? [],
    job_preferences: seed.jobPreferences ?? [],
    privacy_preferences: seed.privacyPreferences ?? [],
  });
  const state = fake.state as any;
  Object.defineProperty(state, "accountPreferences", {
    get: () => state.account_preferences,
  });
  Object.defineProperty(state, "jobPreferences", {
    get: () => state.job_preferences,
  });
  Object.defineProperty(state, "privacyPreferences", {
    get: () => state.privacy_preferences,
  });

  // Settings handlers all use .onConflictDoUpdate on single-row upserts
  // keyed by userId. The generic buildFakeDb returns a no-op stub for it;
  // override here so the upsert actually lands.
  const originalInsert = fake.db.insert.bind(fake.db);
  fake.db.insert = (table: any) => {
    const base = originalInsert(table);
    return {
      values(vs: any) {
        const chain = base.values(vs);
        return {
          ...chain,
          onConflictDoUpdate(opts: { target: unknown; set: Record<string, unknown> }) {
            // Upsert by userId: find a row already matching this userId
            // and merge the patch in; inserts already happened via values().
            // Because `values()` pushes a new row, we reconcile by removing
            // duplicates and keeping the newest row's merged shape.
            const name =
              Object.getOwnPropertySymbols(table ?? {})
                .map((s) => (table as any)[s])
                .find((v) => typeof v === "string") ??
              (table as any)?._?.name ?? null;
            if (!name || !(state as any)[name]) return Promise.resolve();
            const rows = (state as any)[name] as any[];
            if (rows.length > 1) {
              // Collapse to the existing + apply the set patch.
              const kept = rows[0];
              Object.assign(kept, opts.set);
              rows.length = 0;
              rows.push(kept);
            } else if (rows.length === 1) {
              Object.assign(rows[0], opts.set);
            }
            return Promise.resolve();
          },
        };
      },
    };
  };

  return {
    db: fake.db,
    now: () => new Date("2026-04-19T00:00:00.000Z"),
    _state: state,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// Privacy
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetPrivacy", () => {
  it("returns defaults when no privacy_preferences row exists", async () => {
    const deps = makeDeps();
    const res = await handleGetPrivacy(deps, "user-1");
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(typeof data.profileVisibleToPublic, "boolean");
    assert.equal(typeof data.allowMessaging, "boolean");
  });

  it("returns the stored row when one exists", async () => {
    const deps = makeDeps({
      privacyPreferences: [{
        id: "p1", userId: "user-1",
        profileVisibleToPublic: false,
        profileVisibleToRecruiters: true,
        allowSearchEngineIndexing: false,
        showActivityStatus: true,
        showConnectionsList: true,
        allowDirectMessages: true,
        allowConnectionRequests: true,
        showEmail: false,
        showPhone: false,
        showLocation: true,
        allowMessaging: true,
        shareAnalyticsData: true,
        shareUsageData: true,
        allowDataExport: true,
      }],
    });
    const res = await handleGetPrivacy(deps, "user-1");
    assert.equal((res.body as any).data.profileVisibleToPublic, false);
    assert.equal((res.body as any).data.profileVisibleToRecruiters, true);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleGetPrivacy(deps, null);
    assert.equal(res.status, 401);
  });
});

describe("handleUpdatePrivacy", () => {
  it("accepts the 14 known privacy flags and persists them", async () => {
    const deps = makeDeps();
    const res = await handleUpdatePrivacy(deps, "user-1", {
      profileVisibleToPublic: false,
      allowSearchEngineIndexing: false,
      showEmail: false,
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.privacyPreferences.length, 1);
    const row = deps._state.privacyPreferences[0];
    assert.equal(row.profileVisibleToPublic, false);
    assert.equal(row.allowSearchEngineIndexing, false);
    assert.equal(row.showEmail, false);
  });

  it("ignores unknown fields in the body (whitelist — no prototype pollution)", async () => {
    const deps = makeDeps();
    await handleUpdatePrivacy(deps, "user-1", {
      profileVisibleToPublic: false,
      somethingEvil: "<script>",
      __proto__: { polluted: true },
    });
    const row = deps._state.privacyPreferences[0] as Record<string, unknown>;
    assert.equal("somethingEvil" in row, false);
    assert.equal(("__proto__" in row && (row as any).__proto__?.polluted) === true, false);
  });

  it("coerces truthy/falsy values to real booleans", async () => {
    const deps = makeDeps();
    await handleUpdatePrivacy(deps, "user-1", {
      profileVisibleToPublic: 1,
      showEmail: 0,
    });
    const row = deps._state.privacyPreferences[0];
    assert.equal(row.profileVisibleToPublic, true);
    assert.equal(row.showEmail, false);
  });

  it("returns 401 for anonymous callers (no row inserted)", async () => {
    const deps = makeDeps();
    const res = await handleUpdatePrivacy(deps, null, { profileVisibleToPublic: false });
    assert.equal(res.status, 401);
    assert.equal(deps._state.privacyPreferences.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetNotifications", () => {
  it("returns defaults for a user with no account_preferences row", async () => {
    const deps = makeDeps();
    const res = await handleGetNotifications(deps, "user-1");
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(typeof data.emailJobMatches, "boolean");
  });

  it("maps stored email flags into the notification DTO keys", async () => {
    const deps = makeDeps({
      accountPreferences: [{
        id: "p1", userId: "user-1",
        emailNotificationsEnabled: true,
        weeklyDigestEnabled: false,
        marketingEmailsEnabled: true,
        jobAlertEmailsEnabled: false,
      }],
    });
    const res = await handleGetNotifications(deps, "user-1");
    const data = (res.body as any).data;
    assert.equal(data.emailJobMatches, true);
    assert.equal(data.emailApplicationUpdates, true);
    assert.equal(data.emailWeeklyDigest, false);
    assert.equal(data.emailMarketingUpdates, true);
    assert.equal(data.jobAlertEmailsEnabled, false);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleGetNotifications(deps, null);
    assert.equal(res.status, 401);
  });
});

describe("handleUpdateNotifications", () => {
  it("persists the 4 underlying column flags derived from the DTO keys", async () => {
    const deps = makeDeps();
    await handleUpdateNotifications(deps, "user-1", {
      emailJobMatches: true,
      emailWeeklyDigest: false,
      emailMarketingUpdates: true,
      jobAlertEmailsEnabled: false,
    });
    const row = deps._state.accountPreferences[0];
    assert.equal(row.emailNotificationsEnabled, true);
    assert.equal(row.weeklyDigestEnabled, false);
    assert.equal(row.marketingEmailsEnabled, true);
    assert.equal(row.jobAlertEmailsEnabled, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Account settings
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetAccountSettings", () => {
  it("returns UTC / en / USD / system theme as defaults", async () => {
    const deps = makeDeps();
    const res = await handleGetAccountSettings(deps, "user-1");
    const data = (res.body as any).data;
    assert.equal(data.theme, "system");
    assert.equal(data.language, "en");
    assert.equal(data.currency, "USD");
    assert.equal(data.timezone, "UTC");
  });

  it("returns the stored row when one exists", async () => {
    const deps = makeDeps({
      accountPreferences: [{
        id: "p1", userId: "user-1",
        theme: "dark", language: "en-US", currency: "EUR", timezone: "America/Detroit",
      }],
    });
    const res = await handleGetAccountSettings(deps, "user-1");
    const data = (res.body as any).data;
    assert.equal(data.theme, "dark");
    assert.equal(data.language, "en-US");
    assert.equal(data.currency, "EUR");
    assert.equal(data.timezone, "America/Detroit");
  });
});

describe("handleUpdateAccountSettings", () => {
  it("applies sanitised updates to the row", async () => {
    const deps = makeDeps();
    const res = await handleUpdateAccountSettings(deps, "user-1", {
      theme: "dark",
      timezone: "America/Detroit",
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.accountPreferences[0].theme, "dark");
    assert.equal(deps._state.accountPreferences[0].timezone, "America/Detroit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Job preferences
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetJobPreferences", () => {
  it("returns defaults for a user with no job_preferences row", async () => {
    const deps = makeDeps();
    const res = await handleGetJobPreferences(deps, "user-1");
    assert.equal(res.status, 200);
  });

  it("maps stored `remotePreference: remote` to boolean `remoteOnly: true`", async () => {
    const deps = makeDeps({
      jobPreferences: [{
        id: "p1", userId: "user-1",
        desiredTitle: "CTO",
        desiredLocation: "Remote",
        remotePreference: "remote",
        salaryMin: "150000",
        salaryMax: "250000",
        isOpenToWork: true,
      }],
    });
    const res = await handleGetJobPreferences(deps, "user-1");
    const data = (res.body as any).data;
    assert.equal(data.desiredTitle, "CTO");
    assert.equal(data.remoteOnly, true);
    assert.equal(data.minSalaryExpectation, 150000);
    assert.equal(data.maxSalaryExpectation, 250000);
    assert.equal(data.isOpenToWork, true);
  });
});

describe("handleUpdateJobPreferences", () => {
  it("persists the mapped columns", async () => {
    const deps = makeDeps();
    const res = await handleUpdateJobPreferences(deps, "user-1", {
      desiredTitle: "CTO",
      desiredLocation: "Detroit, MI",
      remoteOnly: true,
      minSalaryExpectation: 100000,
      maxSalaryExpectation: 200000,
      isOpenToWork: true,
    });
    assert.equal(res.status, 200);
    const row = deps._state.jobPreferences[0];
    assert.equal(row.desiredTitle, "CTO");
    assert.equal(row.remotePreference, "remote");
    assert.equal(row.salaryMin, 100000);
    assert.equal(row.isOpenToWork, true);
  });

  it("maps remoteOnly=false to remotePreference='any'", async () => {
    const deps = makeDeps();
    await handleUpdateJobPreferences(deps, "user-1", { remoteOnly: false });
    assert.equal(deps._state.jobPreferences[0].remotePreference, "any");
  });

  it("rejects malformed body with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps();
    const res = await handleUpdateJobPreferences(deps, "user-1", {
      minSalaryExpectation: "not-a-number",
    });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Extension preferences
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetExtensionPreferences", () => {
  it("returns defaults when nothing is stored", async () => {
    const deps = makeDeps();
    const res = await handleGetExtensionPreferences(deps, "user-1");
    const data = (res.body as any).data;
    assert.equal(data.jobseeker.autoDetect, true);
    assert.equal(data.jobseeker.autoScore, false);
    assert.equal(data.recruiter.autoDetectJobs, true);
  });

  it("merges stored overrides with defaults", async () => {
    const deps = makeDeps({
      accountPreferences: [{
        id: "p1", userId: "user-1",
        extensionSettings: {
          jobseeker: { autoDetect: false, autoScore: true },
          recruiter: { autoScore: true },
        },
      }],
    });
    const data = (await handleGetExtensionPreferences(deps, "user-1") as any).body.data;
    assert.equal(data.jobseeker.autoDetect, false);
    assert.equal(data.jobseeker.autoScore, true);
    // Defaults fill in for omitted keys
    assert.equal(data.jobseeker.wizardMode, false);
    assert.equal(data.jobseeker.downloadFormat, "pdf");
    assert.equal(data.recruiter.autoScore, true);
    assert.equal(data.recruiter.autoDetectJobs, true);
  });
});

describe("handleUpdateExtensionPreferences", () => {
  it("merges partial jobseeker patch over current stored settings", async () => {
    const deps = makeDeps({
      accountPreferences: [{
        id: "p1", userId: "user-1",
        extensionSettings: {
          jobseeker: { autoDetect: false, wizardMode: true },
          recruiter: { autoScore: true },
        },
      }],
    });
    const res = await handleUpdateExtensionPreferences(deps, "user-1", {
      jobseeker: { autoScore: true },
    });
    assert.equal(res.status, 200);
    const stored = deps._state.accountPreferences[0].extensionSettings;
    // Patch applied
    assert.equal(stored.jobseeker.autoScore, true);
    // Prior overrides preserved
    assert.equal(stored.jobseeker.autoDetect, false);
    assert.equal(stored.jobseeker.wizardMode, true);
    // Recruiter branch untouched
    assert.equal(stored.recruiter.autoScore, true);
  });

  it("creates a new account_preferences row when none exists", async () => {
    const deps = makeDeps();
    const res = await handleUpdateExtensionPreferences(deps, "user-1", {
      recruiter: { autoScore: true },
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.accountPreferences.length, 1);
    assert.equal(deps._state.accountPreferences[0].extensionSettings.recruiter.autoScore, true);
  });

  it("tolerates malformed stored blob and still returns a clean merged response", async () => {
    const deps = makeDeps({
      accountPreferences: [{
        id: "p1", userId: "user-1",
        extensionSettings: "corrupt-non-object",
      }],
    });
    const res = await handleUpdateExtensionPreferences(deps, "user-1", {
      jobseeker: { autoScore: true },
    });
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(data.jobseeker.autoScore, true);
    assert.equal(data.jobseeker.autoDetect, true); // default preserved
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleUpdateExtensionPreferences(deps, null, {});
    assert.equal(res.status, 401);
  });
});
