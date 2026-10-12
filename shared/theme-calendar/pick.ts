/**
 * The theme picker — which theme a video wears by default on a given day,
 * for a given person (Calendar board, "How the default is picked"):
 *
 *   1. Every event whose run-up window includes today, in the person's region.
 *   2. "Offered" events are choices, never the default — unless they fit the
 *      person (Veterans Day for a veteran, Boss's Day when the video speaks
 *      to a hiring manager). Personal moments come from the person's own
 *      dates, so they always fit.
 *   3. Score = priority (personal 500 · career 400 · holiday 300 · sports 200
 *      · season 100) + 250 if it fits + 150 on the day − 1 per day to go.
 *   4. Highest score wins; the season fills any gap.
 *
 * Pure: the client picks with its own dates, so a birthday never leaves the
 * person's browser.
 */
import { astronomicalDay, dayOf, easterSunday, nthWeekday, parseIsoDay, yearOf, type DayNumber } from "./dates.js";
import type { PersonMoment, ThemeEvent, ThemeFit } from "./event.js";

/** A month + day the person gave (or the résumé holds). */
export interface MomentDate {
  month: number;
  day: number;
}

export interface PersonContext {
  /** "US", "US-MW", "CA"… or null when unknown (only region-free events). */
  region: string | null;
  fits: ReadonlySet<ThemeFit>;
  moments: Partial<Record<PersonMoment, MomentDate>>;
}

export const NO_PERSON: PersonContext = { region: null, fits: new Set(), moments: {} };

export interface ActiveEvent {
  event: ThemeEvent;
  main: DayNumber;
  start: DayNumber;
  end: DayNumber;
  fits: boolean;
  score: number;
}

export interface ThemePick {
  /** The default, or null when nothing at all is running. */
  winner: ActiveEvent | null;
  /** Everything else running today, best first (the "also offered" row). */
  others: ActiveEvent[];
}

/** The event's main day in a year, or null when it has none that year. */
export function mainDayIn(event: ThemeEvent, year: number, person: PersonContext): DayNumber | null {
  const rule = event.rule;
  switch (rule.type) {
    case "fixed":
      return dayOf(year, rule.month, rule.day);
    case "nthWeekday": {
      const day = nthWeekday(year, rule.month, rule.weekday, rule.nth);
      return day === null ? null : day + (rule.offset ?? 0);
    }
    case "computed":
      return rule.point === "easter" ? easterSunday(year) : astronomicalDay(rule.point, year);
    case "table": {
      const row = event.dates.find((d) => d.year === year);
      return row ? parseIsoDay(row.date) : null;
    }
    case "person": {
      const m = person.moments[rule.moment];
      return m ? dayOf(year, m.month, m.day) : null;
    }
  }
}

/** True when a region-scoped event applies to the person's region. */
export function inRegion(regions: readonly string[], region: string | null): boolean {
  if (regions.length === 0) return true;
  if (!region) return false;
  return regions.some((r) => r === region || region.startsWith(`${r}-`));
}

/** The occurrence whose window covers `today` (windows can cross a new year). */
export function occurrenceOn(
  event: ThemeEvent,
  today: DayNumber,
  person: PersonContext,
): { main: DayNumber; start: DayNumber; end: DayNumber } | null {
  const year = yearOf(today);
  for (const y of [year - 1, year, year + 1]) {
    const main = mainDayIn(event, y, person);
    if (main === null) continue;
    const start = main - event.runupDays;
    const end = main + event.afterDays;
    if (today >= start && today <= end) return { main, start, end };
  }
  return null;
}

function fitsPerson(event: ThemeEvent, person: PersonContext): boolean {
  if (event.kind === "personal") return true;
  return event.fits.some((f) => person.fits.has(f));
}

function autoEligible(a: ActiveEvent): boolean {
  if (a.event.autoPick === "everyone") return true;
  if (a.event.autoPick === "whenFits") return a.fits;
  return false;
}

/** Every event running today for this person, scored, best first. */
export function activeEvents(events: readonly ThemeEvent[], today: DayNumber, person: PersonContext): ActiveEvent[] {
  const out: ActiveEvent[] = [];
  for (const event of events) {
    if (!event.isActive || !inRegion(event.regions, person.region)) continue;
    const occ = occurrenceOn(event, today, person);
    if (!occ) continue;
    const fits = fitsPerson(event, person);
    const score = event.priority + (fits ? 250 : 0) + (today === occ.main ? 150 : 0) - Math.max(0, occ.main - today);
    out.push({ event, ...occ, fits, score });
  }
  return out.sort((a, b) => b.score - a.score || a.event.slug.localeCompare(b.event.slug));
}

/** The default theme event for today, plus what else is offered. */
export function pickThemeEvent(events: readonly ThemeEvent[], today: DayNumber, person: PersonContext): ThemePick {
  const active = activeEvents(events, today, person);
  const winner = active.find(autoEligible) ?? null;
  return { winner, others: active.filter((a) => a !== winner) };
}

/** What's "in season" for everyone right now (the home page's seasonal row):
 *  events anyone gets by default, no personal moments or offered-only ones. */
export function inSeasonEvents(events: readonly ThemeEvent[], today: DayNumber, region: string | null): ActiveEvent[] {
  return activeEvents(events, today, { ...NO_PERSON, region }).filter(
    (a) => a.event.autoPick === "everyone" && a.event.kind !== "personal" && a.event.kind !== "offered",
  );
}

/** Yearly-table events missing a date whose run-up starts within `horizon`
 *  days (the SuperAdmin "dates need entering" alert). Estimated from the
 *  latest entered date one year on. */
export function missingYearlyDates(
  events: readonly ThemeEvent[],
  today: DayNumber,
  horizon = 120,
): { event: ThemeEvent; year: number }[] {
  const year = yearOf(today);
  const out: { event: ThemeEvent; year: number }[] = [];
  for (const event of events) {
    if (!event.isActive || event.rule.type !== "table") continue;
    for (const y of [year, year + 1]) {
      if (event.dates.some((d) => d.year === y)) continue;
      const known = [...event.dates].sort((a, b) => b.year - a.year)[0];
      const guess = known ? parseIsoDay(known.date) : null;
      const estimate = guess === null ? dayOf(y, 1, 1) : guess + (y - known!.year) * 365;
      if (estimate - event.runupDays - today <= horizon && estimate + event.afterDays >= today) out.push({ event, year: y });
    }
  }
  return out;
}
