/**
 * The picker's PersonContext from Settings › Video personalization + résumé
 * dates, and jurisdiction → calendar region.
 *
 * Run: node --import tsx --test shared/__tests__/theme-person.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseIsoDay } from "../theme-calendar/dates.js";
import { buildPersonContext } from "../theme-calendar/person.js";
import { themeRegionOf } from "../theme-calendar/region.js";
import { DEFAULT_VIDEO_PERSONALIZATION, VideoPersonalizationSchema } from "../video-personalization.js";

const today = parseIsoDay("2026-10-09")!;

describe("buildPersonContext", () => {
  it("adds the person's own dates and fits", () => {
    const ctx = buildPersonContext({
      personalization: { ...DEFAULT_VIDEO_PERSONALIZATION, birthday: { month: 10, day: 20 }, isParent: true },
      region: "US-MW",
      speaksToHiringManager: true,
      today,
    });
    assert.deepEqual(ctx.moments.birthday, { month: 10, day: 20 });
    assert.ok(ctx.fits.has("parent") && ctx.fits.has("hiringManager"));
    assert.equal(ctx.region, "US-MW");
  });
  it("uses a work anniversary only after a full year in the job", () => {
    const p = DEFAULT_VIDEO_PERSONALIZATION;
    assert.deepEqual(buildPersonContext({ personalization: p, resume: { currentJobStart: "2024-12-01" }, region: null, today }).moments.workAnniversary, { month: 12, day: 1 });
    assert.equal(buildPersonContext({ personalization: p, resume: { currentJobStart: "2026-03" }, region: null, today }).moments.workAnniversary, undefined);
  });
  it("uses a recent graduation and makes the person a student", () => {
    const ctx = buildPersonContext({ personalization: DEFAULT_VIDEO_PERSONALIZATION, resume: { latestGraduation: "2026-05-15" }, region: null, today });
    assert.deepEqual(ctx.moments.graduation, { month: 5, day: 15 });
    assert.ok(ctx.fits.has("student"));
    const old = buildPersonContext({ personalization: DEFAULT_VIDEO_PERSONALIZATION, resume: { latestGraduation: "2019-05" }, region: null, today });
    assert.equal(old.moments.graduation, undefined);
  });
  it("respects the person turning résumé moments off", () => {
    const off = { ...DEFAULT_VIDEO_PERSONALIZATION, useWorkAnniversary: false, useGraduation: false };
    const ctx = buildPersonContext({ personalization: off, resume: { currentJobStart: "2020-01-01", latestGraduation: "2026-05-15" }, region: null, today });
    assert.deepEqual(ctx.moments, {});
  });
  it("adds fits the résumé shows (school role, military service)", () => {
    const ctx = buildPersonContext({ personalization: null, resume: { schoolRole: true, veteran: true }, region: "US", today });
    assert.ok(ctx.fits.has("teacher") && ctx.fits.has("veteran"));
  });
  it("is empty for a visitor with no personalization", () => {
    const ctx = buildPersonContext({ personalization: null, region: null, today });
    assert.deepEqual(ctx.moments, {});
    assert.equal(ctx.fits.size, 0);
  });
});

describe("themeRegionOf", () => {
  it("maps Midwest states, other US states and Canada", () => {
    assert.equal(themeRegionOf("US-MI"), "US-MW");
    assert.equal(themeRegionOf("US-CA"), "US");
    assert.equal(themeRegionOf("US"), "US");
    assert.equal(themeRegionOf("CA-ON"), "CA");
    assert.equal(themeRegionOf("EEA-DE"), null);
    assert.equal(themeRegionOf(null), null);
  });
});

describe("VideoPersonalizationSchema", () => {
  it("accepts the defaults and caps interests at three", () => {
    assert.ok(VideoPersonalizationSchema.safeParse(DEFAULT_VIDEO_PERSONALIZATION).success);
    assert.ok(!VideoPersonalizationSchema.safeParse({ ...DEFAULT_VIDEO_PERSONALIZATION, interests: ["a", "b", "c", "d"] }).success);
  });
  it("rejects an impossible date and an unknown fixed theme", () => {
    assert.ok(!VideoPersonalizationSchema.safeParse({ ...DEFAULT_VIDEO_PERSONALIZATION, birthday: { month: 2, day: 31 } }).success);
    assert.ok(VideoPersonalizationSchema.safeParse({ ...DEFAULT_VIDEO_PERSONALIZATION, birthday: { month: 2, day: 29 } }).success);
    assert.ok(!VideoPersonalizationSchema.safeParse({ ...DEFAULT_VIDEO_PERSONALIZATION, theme: { mode: "fixed", themeId: "neon" } }).success);
  });
});
