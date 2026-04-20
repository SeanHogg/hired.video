/**
 * Tests for the settings helpers that shape the response DTOs and merge
 * client-supplied extension toggles into the stored blob.
 *
 * Covers:
 *   • PRIVACY_FIELDS                 — canonical whitelist of privacy booleans
 *   • defaultExtensionSettings       — shape of the default jobseeker /
 *                                      recruiter extension preferences
 *   • mergeExtensionSettings         — partial-update merge + robustness to
 *                                      malformed stored data
 *
 * Tests the wire contract exercised by the Chrome extension sidepanel and
 * the web /settings?tab=extensions page. Regression coverage for the "only
 * one toggle survives a PUT" bug class where a naïve replace wipes other
 * surfaces' preferences.
 *
 * Run: node --import tsx --test src/routes/__tests__/settings-helpers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PRIVACY_FIELDS,
  defaultExtensionSettings,
  mergeExtensionSettings,
} from "../settings.js";

// ═══════════════════════════════════════════════════════════════════════════
// PRIVACY_FIELDS whitelist
// ═══════════════════════════════════════════════════════════════════════════

describe("PRIVACY_FIELDS", () => {
  it("enumerates exactly the 14 privacy booleans the PUT handler accepts", () => {
    assert.equal(PRIVACY_FIELDS.length, 14);
    const expected = new Set([
      "profileVisibleToPublic",
      "profileVisibleToRecruiters",
      "allowSearchEngineIndexing",
      "showActivityStatus",
      "showConnectionsList",
      "allowDirectMessages",
      "allowConnectionRequests",
      "showEmail",
      "showPhone",
      "showLocation",
      "allowMessaging",
      "shareAnalyticsData",
      "shareUsageData",
      "allowDataExport",
    ]);
    for (const f of PRIVACY_FIELDS) assert.ok(expected.has(f), `unexpected field: ${f}`);
  });

  it("is typed readonly (as const) so mutations are a compile error", () => {
    // TypeScript enforces readonly via `as const`; at runtime the array
    // is still mutable but callers can't legally push() without a cast.
    // This test just pins the shape + length; extension must go through
    // a code change that also updates the test expectation above.
    assert.ok(Array.isArray(PRIVACY_FIELDS));
    assert.ok(PRIVACY_FIELDS.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// defaultExtensionSettings — base shape for both surfaces
// ═══════════════════════════════════════════════════════════════════════════

describe("defaultExtensionSettings", () => {
  it("returns the jobseeker surface defaults", () => {
    const d = defaultExtensionSettings();
    assert.equal(d.jobseeker.autoDetect, true);
    assert.equal(d.jobseeker.autoScore, false);
    assert.equal(d.jobseeker.autoTailor, false);
    assert.equal(d.jobseeker.wizardMode, false);
    assert.equal(d.jobseeker.downloadFormat, "pdf");
  });

  it("returns the recruiter surface defaults", () => {
    const d = defaultExtensionSettings();
    assert.equal(d.recruiter.autoDetectJobs, true);
    assert.equal(d.recruiter.autoDetectProfiles, true);
    assert.equal(d.recruiter.autoDetectCompanies, true);
    assert.equal(d.recruiter.autoScore, false);
  });

  it("returns a fresh object each call (not a shared singleton)", () => {
    const a = defaultExtensionSettings();
    const b = defaultExtensionSettings();
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(a.jobseeker, b.jobseeker);
    a.jobseeker.autoDetect = false;
    assert.equal(defaultExtensionSettings().jobseeker.autoDetect, true, "mutation leaked");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mergeExtensionSettings — tolerance + partial-update semantics
// ═══════════════════════════════════════════════════════════════════════════

describe("mergeExtensionSettings", () => {
  it("returns defaults when stored is null or undefined", () => {
    assert.deepEqual(mergeExtensionSettings(null), defaultExtensionSettings());
    assert.deepEqual(mergeExtensionSettings(undefined), defaultExtensionSettings());
  });

  it("returns defaults when stored is not an object (legacy/malformed data)", () => {
    assert.deepEqual(mergeExtensionSettings("not-json"), defaultExtensionSettings());
    assert.deepEqual(mergeExtensionSettings(42), defaultExtensionSettings());
    assert.deepEqual(mergeExtensionSettings(true), defaultExtensionSettings());
  });

  it("merges stored jobseeker overrides into the defaults", () => {
    const result = mergeExtensionSettings({
      jobseeker: { autoDetect: false, autoScore: true },
    });
    assert.equal(result.jobseeker.autoDetect, false, "override applied");
    assert.equal(result.jobseeker.autoScore, true);
    // Unspecified keys fall back to defaults
    assert.equal(result.jobseeker.wizardMode, false);
    assert.equal(result.jobseeker.downloadFormat, "pdf");
    // recruiter surface untouched
    assert.equal(result.recruiter.autoDetectJobs, true);
  });

  it("merges stored recruiter overrides without touching jobseeker", () => {
    const result = mergeExtensionSettings({
      recruiter: { autoScore: true, autoDetectJobs: false },
    });
    assert.equal(result.recruiter.autoScore, true);
    assert.equal(result.recruiter.autoDetectJobs, false);
    // jobseeker untouched
    assert.deepEqual(result.jobseeker, defaultExtensionSettings().jobseeker);
  });

  it("tolerates malformed jobseeker/recruiter branches (non-objects)", () => {
    // If either branch is corrupted, the helper should fall back cleanly
    // instead of crashing the settings GET handler.
    const r1 = mergeExtensionSettings({ jobseeker: "oops", recruiter: null });
    assert.deepEqual(r1.jobseeker, defaultExtensionSettings().jobseeker);
    assert.deepEqual(r1.recruiter, defaultExtensionSettings().recruiter);

    const r2 = mergeExtensionSettings({ jobseeker: [], recruiter: 123 });
    assert.deepEqual(r2.jobseeker, defaultExtensionSettings().jobseeker);
    assert.deepEqual(r2.recruiter, defaultExtensionSettings().recruiter);
  });

  it("preserves unknown extra keys inside a surface (forward compat)", () => {
    // When the extension rolls out a new toggle, the server shouldn't
    // strip it on next GET — it should round-trip so the extension can
    // read what it wrote.
    const result: any = mergeExtensionSettings({
      jobseeker: { futureToggle: "maybe" },
    });
    assert.equal(result.jobseeker.futureToggle, "maybe");
  });

  it("does not mutate the input", () => {
    const input = { jobseeker: { autoDetect: false } };
    const snapshot = JSON.stringify(input);
    mergeExtensionSettings(input);
    assert.equal(JSON.stringify(input), snapshot, "input mutated");
  });
});
