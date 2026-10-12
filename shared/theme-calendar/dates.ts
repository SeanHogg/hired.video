/**
 * Calendar dates as plain day numbers (days since 1970-01-01, UTC), so a
 * window test is integer arithmetic and never drifts with a time zone.
 */

export type DayNumber = number;

const MS_PER_DAY = 86_400_000;

/** Day number of a calendar date (month 1–12). */
export function dayOf(year: number, month: number, day: number): DayNumber {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Day number of an ISO date ("2026-10-31") or null when it isn't one. */
export function parseIsoDay(iso: string): DayNumber | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const n = dayOf(y, mo, d);
  const back = new Date(n * MS_PER_DAY);
  return back.getUTCMonth() + 1 === mo && back.getUTCDate() === d ? n : null;
}

/** ISO date ("2026-10-31") of a day number. */
export function isoOf(day: DayNumber): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Today's day number in the viewer's local calendar (what "today" means to
 *  the person making the video). */
export function localToday(now: Date = new Date()): DayNumber {
  return dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The calendar year a day number falls in. */
export function yearOf(day: DayNumber): number {
  return new Date(day * MS_PER_DAY).getUTCFullYear();
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: DayNumber): number {
  return new Date(day * MS_PER_DAY).getUTCDay();
}

/** The nth (1–5) weekday of a month, or the last one for nth = -1; null
 *  when that month has no 5th such weekday. */
export function nthWeekday(year: number, month: number, weekday: number, nth: number): DayNumber | null {
  if (nth === -1) {
    const last = dayOf(year, month + 1, 0);
    return last - ((weekdayOf(last) - weekday + 7) % 7);
  }
  const first = dayOf(year, month, 1);
  const day = first + ((weekday - weekdayOf(first) + 7) % 7) + (nth - 1) * 7;
  return new Date(day * MS_PER_DAY).getUTCMonth() + 1 === month ? day : null;
}

/** Easter Sunday (Gregorian, anonymous computus). */
export function easterSunday(year: number): DayNumber {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayOf(year, month, day);
}

/** Equinoxes and solstices (UTC calendar day, Meeus mean values; accurate
 *  to the day for 2000–2100, which is all a theme window needs). */
export const ASTRONOMICAL_POINTS = ["springEquinox", "summerSolstice", "fallEquinox", "winterSolstice"] as const;
export type AstronomicalPoint = (typeof ASTRONOMICAL_POINTS)[number];

const MEEUS: Record<AstronomicalPoint, readonly [number, number, number, number, number]> = {
  springEquinox: [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  summerSolstice: [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  fallEquinox: [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  winterSolstice: [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
};

export function astronomicalDay(point: AstronomicalPoint, year: number): DayNumber {
  const [c0, c1, c2, c3, c4] = MEEUS[point];
  const y = (year - 2000) / 1000;
  const jde = c0 + c1 * y + c2 * y * y + c3 * y ** 3 + c4 * y ** 4;
  // Julian day 2440587.5 = 1970-01-01T00:00Z.
  return Math.floor(jde - 2440587.5);
}
