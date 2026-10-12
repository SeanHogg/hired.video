/**
 * #1769 / #1770 — targeting runs in SQL (never per-user in memory), the
 * serving-context rules (device, daypart) are pure, and the reach cache key
 * is stable per spec.
 *
 * Run: node --import tsx --test src/services/advertising/__tests__/targeting.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { AdSetTargetingSchema, parseAdSetTargeting, type AdSetTargeting } from "../../../../../shared/ad-targeting.js";
import { buildTargetingWhere } from "../targeting-sql.js";
import {
  canonicalTargeting,
  deviceFromUserAgent,
  matchesServingContext,
  targetingCacheKey,
} from "../targeting-evaluator.js";

const dialect = new PgDialect();
const NOW = new Date("2026-10-10T15:30:00.000Z"); // Saturday
const compile = (spec: AdSetTargeting) => dialect.sqlToQuery(buildTargetingWhere(spec, NOW));

// Shaped like a real inspector save.
const RECRUITER_SPEC: AdSetTargeting = {
  geo: { countries: ["US", "CA"] },
  attributes: { requiredSkills: ["TypeScript", "React"], yearsExperienceMin: 3, openToWorkOnly: true },
  behavioural: { activeWithinDays: 30 },
  device: { platforms: ["desktop"] },
  dayparting: { hoursOfDay: [9, 10, 11, 12, 13, 14, 15, 16, 17], daysOfWeek: [1, 2, 3, 4, 5], timezone: "America/New_York" },
  exclusions: {
    excludeApplicantsOfJobIds: ["4f2c9a7e-1b3d-4e8f-9a6b-2c5d7e9f1a3b"],
    excludeCountries: ["MX"],
  },
};

describe("buildTargetingWhere — SQL predicate", () => {
  it("an empty spec is just the base audience (active, not banned, not guest)", () => {
    const q = compile({});
    assert.match(q.sql, /"is_active" = true/);
    assert.match(q.sql, /"is_banned" = false/);
    assert.match(q.sql, /"is_guest" = false/);
    assert.equal(q.params.length, 0);
  });

  it("compiles every user-attribute rule into the WHERE clause", () => {
    const q = compile(RECRUITER_SPEC);
    assert.match(q.sql, /"iso2" in \(\$\d+, \$\d+\)/i);
    assert.doesNotMatch(q.sql, /= ANY\(/i);
    assert.match(q.sql, /jsonb_array_elements_text/);
    assert.match(q.sql, /"years_of_experience" >= \$\d+/);
    assert.match(q.sql, /"open_to_work" = true OR .*"is_open_to_work" = true/);
    assert.match(q.sql, /"activity_logs"/);
    assert.match(q.sql, /NOT IN \(\s*select "job_applications"\."user_id"|NOT IN \(\s*SELECT "job_applications"\."user_id"/i);
    assert.match(q.sql, /"home_country_id" IS NULL OR .*NOT IN/);
  });

  it("binds every list element as its own scalar (no JS array in one slot)", () => {
    const q = compile(RECRUITER_SPEC);
    for (const p of q.params) assert.ok(!Array.isArray(p), `array param leaked: ${JSON.stringify(p)}`);
    assert.ok(q.params.includes("US") && q.params.includes("CA") && q.params.includes("MX"));
    // Required skills are matched case-insensitively.
    assert.ok(q.params.includes("typescript") && q.params.includes("react"));
  });

  it("escapes LIKE metacharacters in role keywords", () => {
    const q = compile({ attributes: { currentRoleKeywords: ["100%_remote"] } });
    assert.ok(q.params.includes("%100\\%\\_remote%"));
  });

  it("device and daypart never reach SQL (request-context rules)", () => {
    const q = compile({ device: { platforms: ["mobile"] }, dayparting: { hoursOfDay: [9] } });
    assert.equal(q.params.length, 0);
  });
});

describe("matchesServingContext — device + daypart", () => {
  it("passes a desktop impression on a weekday inside the daypart", () => {
    const d = matchesServingContext(RECRUITER_SPEC, {
      device: "desktop",
      now: new Date("2026-10-12T14:00:00.000Z"), // Mon 10:00 New York
    });
    assert.deepEqual(d, { eligible: true, reasons: [] });
  });

  it("rejects the wrong device and a weekend hour (zone from the spec)", () => {
    const d = matchesServingContext(RECRUITER_SPEC, { device: "mobile", now: NOW }); // Sat 11:30 NY
    assert.equal(d.eligible, false);
    assert.equal(d.reasons.length, 2);
  });

  it("falls back to the viewer's zone, then UTC, and tolerates an unknown zone", () => {
    const spec: AdSetTargeting = { dayparting: { hoursOfDay: [15] } };
    assert.equal(matchesServingContext(spec, { now: NOW }).eligible, true); // 15:xx UTC
    assert.equal(matchesServingContext(spec, { now: NOW, viewerTimezone: "Asia/Tokyo" }).eligible, false);
    assert.equal(matchesServingContext(spec, { now: NOW, viewerTimezone: "Not/AZone" }).eligible, true);
  });

  it("an unknown device does not exclude", () => {
    assert.equal(matchesServingContext({ device: { platforms: ["desktop"] } }, { device: null }).eligible, true);
  });
});

describe("deviceFromUserAgent", () => {
  it("classifies real UA strings", () => {
    assert.equal(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "mobile");
    assert.equal(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15"), "tablet");
    assert.equal(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"), "desktop");
    assert.equal(deviceFromUserAgent(null), null);
  });
});

describe("reach cache key", () => {
  it("is stable across key order and empty values", async () => {
    const a = await targetingCacheKey({ geo: { countries: ["US"] }, attributes: { requiredSkills: [] } });
    const b = await targetingCacheKey({ attributes: {}, geo: { countries: ["US"] } });
    assert.equal(a, b);
    assert.match(a, /^ad-reach:v1:[0-9a-f]{64}$/);
    assert.equal(canonicalTargeting({}), "{}");
  });

  it("differs when the spec differs", async () => {
    assert.notEqual(await targetingCacheKey({ geo: { countries: ["US"] } }), await targetingCacheKey({ geo: { countries: ["CA"] } }));
  });
});

describe("AdSetTargetingSchema", () => {
  it("accepts the full inspector shape and upper-cases country codes", () => {
    const parsed = AdSetTargetingSchema.parse({ ...RECRUITER_SPEC, exclusions: { excludeCountries: ["mx"] } });
    assert.deepEqual(parsed.exclusions?.excludeCountries, ["MX"]);
  });

  it("rejects an out-of-range hour and an unknown device", () => {
    assert.equal(AdSetTargetingSchema.safeParse({ dayparting: { hoursOfDay: [24] } }).success, false);
    assert.equal(AdSetTargetingSchema.safeParse({ device: { platforms: ["fridge"] } }).success, false);
  });

  it("parseAdSetTargeting falls back to everyone ({}) on junk", () => {
    assert.deepEqual(parseAdSetTargeting({ geo: { countries: "US" } }), {});
    assert.deepEqual(parseAdSetTargeting(null), {});
  });
});
