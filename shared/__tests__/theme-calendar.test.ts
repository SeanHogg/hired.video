/**
 * Theme calendar: date rules (fixed, nth weekday, Easter, equinox, yearly
 * table, the person's own dates) and the picker's scoring (Calendar board).
 * Fixtures mirror rows seeded by api/drizzle/0502_theme_calendar.sql.
 *
 * Run: node --import tsx --test shared/__tests__/theme-calendar.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { astronomicalDay, dayOf, easterSunday, isoOf, nthWeekday, parseIsoDay } from "../theme-calendar/dates.js";
import { ThemeEventInputSchema, type ThemeEvent } from "../theme-calendar/event.js";
import { inRegion, inSeasonEvents, missingYearlyDates, NO_PERSON, pickThemeEvent, type PersonContext } from "../theme-calendar/pick.js";

let n = 0;
function ev(over: Partial<ThemeEvent> & Pick<ThemeEvent, "slug" | "kind" | "rule">): ThemeEvent {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    runupDays: 0,
    afterDays: 0,
    autoPick: "everyone",
    fits: [],
    regions: [],
    priority: { personal: 500, career: 400, holiday: 300, sports: 200, season: 100, offered: 0, custom: 300 }[over.kind],
    themeId: "standard",
    tone: "warm",
    name: { en: over.slug },
    line: null,
    isActive: true,
    isBuiltin: true,
    dates: [],
    updatedAt: "2026-10-08T00:00:00.000Z",
    ...over,
  };
}

const halloween = ev({ slug: "halloween", kind: "holiday", rule: { type: "fixed", month: 10, day: 31 }, runupDays: 30, themeId: "halloween" });
const boss = ev({ slug: "bosss-day", kind: "offered", rule: { type: "fixed", month: 10, day: 16 }, runupDays: 7, autoPick: "whenFits", fits: ["hiringManager"], regions: ["US"], themeId: "boss" });
const sweetest = ev({ slug: "sweetest-day", kind: "holiday", rule: { type: "nthWeekday", month: 10, weekday: 6, nth: 3 }, runupDays: 7, regions: ["US-MW"], themeId: "sweetest" });
const cathanks = ev({ slug: "thanksgiving-ca", kind: "holiday", rule: { type: "nthWeekday", month: 10, weekday: 1, nth: 2 }, runupDays: 7, regions: ["CA"], themeId: "thanks" });
const fall = ev({ slug: "season-fall", kind: "season", rule: { type: "computed", point: "fallEquinox" }, afterDays: 69, themeId: "fall" });
const winter = ev({ slug: "season-winter", kind: "season", rule: { type: "fixed", month: 12, day: 1 }, afterDays: 108, themeId: "winter" });
const newYear = ev({ slug: "new-year", kind: "career", rule: { type: "fixed", month: 1, day: 1 }, afterDays: 30, themeId: "newyear" });
const veterans = ev({ slug: "veterans-day", kind: "offered", rule: { type: "fixed", month: 11, day: 11 }, runupDays: 7, autoPick: "whenFits", fits: ["veteran"], regions: ["US"], themeId: "veteran" });
const diwali = ev({ slug: "diwali", kind: "offered", rule: { type: "table" }, runupDays: 7, autoPick: "never", themeId: "observe", tone: "respectful", dates: [{ year: 2026, date: "2026-11-08" }] });
const bigGame = ev({ slug: "big-game", kind: "sports", rule: { type: "table" }, runupDays: 14, themeId: "biggame", dates: [{ year: 2026, date: "2026-02-08" }] });
const birthday = ev({ slug: "birthday", kind: "personal", rule: { type: "person", moment: "birthday" }, runupDays: 7, autoPick: "whenFits", fits: ["person"], themeId: "birthday" });
const thanks = ev({ slug: "thanksgiving", kind: "holiday", rule: { type: "nthWeekday", month: 11, weekday: 4, nth: 4 }, runupDays: 10, regions: ["US"], themeId: "thanks" });
const memorial = ev({ slug: "memorial-day", kind: "offered", rule: { type: "nthWeekday", month: 5, weekday: 1, nth: -1 }, autoPick: "never", regions: ["US"], themeId: "observe", tone: "respectful" });

const ALL = [halloween, boss, sweetest, cathanks, fall, winter, newYear, veterans, diwali, bigGame, birthday, thanks, memorial];

const midwest: PersonContext = { region: "US-MW", fits: new Set(), moments: {} };
const winnerOn = (iso: string, person: PersonContext = midwest) => pickThemeEvent(ALL, parseIsoDay(iso)!, person).winner?.event.slug ?? null;

describe("dates", () => {
  it("finds nth weekdays (Sweetest Day 2026 = Oct 17, US Thanksgiving = Nov 26)", () => {
    assert.equal(isoOf(nthWeekday(2026, 10, 6, 3)!), "2026-10-17");
    assert.equal(isoOf(nthWeekday(2026, 11, 4, 4)!), "2026-11-26");
  });
  it("finds the last weekday of a month (Memorial Day 2026 = May 25)", () => {
    assert.equal(isoOf(nthWeekday(2026, 5, 1, -1)!), "2026-05-25");
  });
  it("returns null for a 5th weekday a month doesn't have", () => {
    assert.equal(nthWeekday(2026, 2, 1, 5), null);
  });
  it("computes Easter", () => {
    assert.equal(isoOf(easterSunday(2026)), "2026-04-05");
    assert.equal(isoOf(easterSunday(2027)), "2027-03-28");
  });
  it("computes equinoxes and solstices to the day", () => {
    assert.equal(isoOf(astronomicalDay("springEquinox", 2026)), "2026-03-20");
    assert.equal(isoOf(astronomicalDay("summerSolstice", 2026)), "2026-06-21");
    assert.equal(isoOf(astronomicalDay("fallEquinox", 2026)), "2026-09-23");
    assert.equal(isoOf(astronomicalDay("winterSolstice", 2026)), "2026-12-21");
  });
  it("rejects impossible ISO dates", () => {
    assert.equal(parseIsoDay("2026-02-30"), null);
    assert.equal(parseIsoDay("not a date"), null);
    assert.equal(parseIsoDay("2026-10-31"), dayOf(2026, 10, 31));
  });
});

describe("pickThemeEvent", () => {
  it("picks Halloween through its October run-up, not just on the 31st", () => {
    assert.equal(winnerOn("2026-10-08"), "halloween");
    assert.equal(winnerOn("2026-10-31"), "halloween");
  });
  it("falls back to the season when nothing else runs", () => {
    assert.equal(winnerOn("2026-09-25"), "season-fall");
  });
  it("prefers the event on its own day over a longer run-up (Sweetest Day, Midwest)", () => {
    assert.equal(winnerOn("2026-10-17"), "sweetest-day");
  });
  it("never shows a region's event outside it", () => {
    const elsewhere: PersonContext = { region: "US", fits: new Set(), moments: {} };
    assert.equal(winnerOn("2026-10-17", elsewhere), "halloween");
    const pick = pickThemeEvent(ALL, parseIsoDay("2026-10-12")!, { region: "CA", fits: new Set(), moments: {} });
    assert.equal(pick.winner?.event.slug, "thanksgiving-ca");
  });
  it("keeps offered events as choices, never the default", () => {
    const pick = pickThemeEvent(ALL, parseIsoDay("2026-11-08")!, midwest);
    assert.notEqual(pick.winner?.event.slug, "diwali");
    assert.ok(pick.others.some((a) => a.event.slug === "diwali"));
  });
  it("auto-picks an offered event that fits (Boss's Day speaking to a hiring manager)", () => {
    const hm: PersonContext = { region: "US-MW", fits: new Set(["hiringManager"]), moments: {} };
    assert.equal(winnerOn("2026-10-16", hm), "bosss-day");
    assert.notEqual(winnerOn("2026-10-16"), "bosss-day");
  });
  it("auto-picks Veterans Day for a veteran only", () => {
    const vet: PersonContext = { region: "US", fits: new Set(["veteran"]), moments: {} };
    assert.equal(winnerOn("2026-11-11", vet), "veterans-day");
    assert.equal(winnerOn("2026-11-11", { region: "US", fits: new Set(), moments: {} }), "season-fall");
  });
  it("lets a personal moment win from the person's own date", () => {
    const me: PersonContext = { region: "US-MW", fits: new Set(), moments: { birthday: { month: 10, day: 20 } } };
    assert.equal(winnerOn("2026-10-15", me), "birthday");
  });
  it("ignores a personal event when the person gave no date", () => {
    assert.ok(!pickThemeEvent(ALL, parseIsoDay("2026-10-15")!, midwest).others.some((a) => a.event.slug === "birthday"));
  });
  it("handles windows that cross a new year (New year's January)", () => {
    assert.equal(winnerOn("2027-01-20"), "new-year");
    assert.equal(winnerOn("2026-12-28"), "season-winter");
  });
  it("reads yearly-table dates and skips years without one", () => {
    assert.equal(winnerOn("2026-02-01"), "big-game");
    assert.notEqual(winnerOn("2027-02-01"), "big-game");
  });
  it("skips turned-off events", () => {
    const off = ALL.map((e) => (e.slug === "halloween" ? { ...e, isActive: false } : e));
    assert.equal(pickThemeEvent(off, parseIsoDay("2026-10-08")!, midwest).winner?.event.slug, "season-fall");
  });
  it("returns no winner for an empty calendar", () => {
    assert.equal(pickThemeEvent([], parseIsoDay("2026-10-08")!, NO_PERSON).winner, null);
  });
});

describe("inSeasonEvents", () => {
  it("lists what everyone gets by default, no personal or offered events", () => {
    const slugs = inSeasonEvents(ALL, parseIsoDay("2026-10-16")!, "US-MW").map((a) => a.event.slug);
    assert.ok(slugs.includes("halloween") && slugs.includes("season-fall") && slugs.includes("sweetest-day"));
    assert.ok(!slugs.includes("bosss-day") && !slugs.includes("birthday"));
  });
});

describe("inRegion", () => {
  it("treats an empty list as everywhere and matches a country's regions", () => {
    assert.equal(inRegion([], null), true);
    assert.equal(inRegion(["US"], "US-MW"), true);
    assert.equal(inRegion(["US-MW"], "US"), false);
    assert.equal(inRegion(["CA"], null), false);
  });
});

describe("missingYearlyDates", () => {
  it("flags a yearly date whose run-up starts within 120 days", () => {
    const missing = missingYearlyDates([bigGame, diwali], parseIsoDay("2026-11-01")!).map((m) => `${m.event.slug}:${m.year}`);
    assert.deepEqual(missing, ["big-game:2027"]);
  });
  it("ignores events whose date is worked out automatically", () => {
    assert.deepEqual(missingYearlyDates([halloween], parseIsoDay("2026-11-01")!), []);
  });
});

describe("ThemeEventInputSchema", () => {
  const base = {
    slug: "detroit-career-fair",
    kind: "custom",
    rule: { type: "fixed", month: 10, day: 22 },
    runupDays: 7,
    afterDays: 0,
    autoPick: "everyone",
    fits: [],
    regions: ["US-MW"],
    priority: 300,
    themeId: "standard",
    tone: "warm",
    name: { en: "Detroit career fair" },
    line: { en: "See you at the fair." },
    isActive: true,
  };
  it("accepts a custom event", () => assert.ok(ThemeEventInputSchema.safeParse(base).success));
  it("rejects an opening line on a respectful theme", () => {
    assert.ok(!ThemeEventInputSchema.safeParse({ ...base, tone: "respectful" }).success);
  });
  it("requires who it fits when it picks only when it fits", () => {
    assert.ok(!ThemeEventInputSchema.safeParse({ ...base, autoPick: "whenFits" }).success);
  });
  it("keeps person dates for personal moments only", () => {
    assert.ok(!ThemeEventInputSchema.safeParse({ ...base, rule: { type: "person", moment: "birthday" } }).success);
  });
  it("rejects an unknown theme and a bad slug", () => {
    assert.ok(!ThemeEventInputSchema.safeParse({ ...base, themeId: "neon" }).success);
    assert.ok(!ThemeEventInputSchema.safeParse({ ...base, slug: "Has Spaces" }).success);
  });
});
