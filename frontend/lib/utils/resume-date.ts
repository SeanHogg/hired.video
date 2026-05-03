/**
 * resume-date.ts — Shared parsing/formatting for resume work, education,
 * volunteer, project, certificate, etc. dates.
 *
 * Resume dates arrive in many shapes:
 *   • "10/2022"     — MM/YYYY (most common, from regex parser)
 *   • "10/2022"     — also dd/yyyy in some templates (we treat as MM/YYYY)
 *   • "2020-09"     — ISO yyyy-mm
 *   • "2020-09-15"  — full ISO date
 *   • "2020"        — year only
 *   • "Present" / "" — current / unknown
 *
 * The browser's `new Date(...)` constructor returns Invalid Date for many
 * of these formats (especially MM/YYYY) which causes downstream code to
 * silently drop the date. Use these helpers instead.
 */

export const PRESENT_TOKENS = ["", "present", "current", "now"] as const;

/** Returns true if the input represents "current / no end date". */
export function isPresent(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim().toLowerCase();
  return PRESENT_TOKENS.includes(trimmed as (typeof PRESENT_TOKENS)[number]);
}

/**
 * Parse a resume date string into a Date object.
 * Returns null when the string is empty / "Present" / unparseable.
 */
export function parseResumeDate(value: string | undefined | null): Date | null {
  if (value == null) return null;
  const s = value.trim();
  if (s === "" || isPresent(s)) return null;

  // ISO yyyy-mm-dd or yyyy-mm
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, d ? parseInt(d, 10) : 1);
  }

  // MM/YYYY (most common in our regex parser output)
  const slash = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, y] = slash;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  }

  // MM/DD/YYYY
  const usFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usFull) {
    const [, m, d, y] = usFull;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  // Year only
  const year = s.match(/^(\d{4})$/);
  if (year) {
    return new Date(parseInt(year[1], 10), 0, 1);
  }

  // Last resort: native parse (handles "Sep 2022", ISO with timezone, etc.)
  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

/**
 * Format a resume date for display: "Sep 2022", "2020", or "Present".
 * Empty/"Present" inputs render as the `presentLabel` (defaults to "Present").
 */
export function formatResumeDate(
  value: string | undefined | null,
  presentLabel = "Present",
): string {
  if (isPresent(value)) return presentLabel;
  const date = parseResumeDate(value);
  if (!date) return presentLabel;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

/**
 * Returns true if at least one endpoint is a valid, non-Present date worth
 * showing the user. (If both endpoints are "Present" / empty, the date row
 * is suppressed.)
 */
export function hasDisplayableDateRange(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): boolean {
  const startKnown = !isPresent(startDate) && parseResumeDate(startDate) !== null;
  const endKnown = !isPresent(endDate) && parseResumeDate(endDate) !== null;
  return startKnown || endKnown;
}

/**
 * Format a date range: "Sep 2022 - Present", "2020 - 2023", or "" when
 * neither endpoint is a real date.
 */
export function formatResumeDateRange(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): string {
  if (!hasDisplayableDateRange(startDate, endDate)) return "";

  const startKnown = !isPresent(startDate) && parseResumeDate(startDate) !== null;
  const endLabel = formatResumeDate(endDate);

  if (!startKnown) return endLabel;
  return `${formatResumeDate(startDate)} - ${endLabel}`;
}

/**
 * Compare two resume dates for chronological sorting. Items with no start
 * date sort last; "Present" / empty end-date sorts first (current roles).
 *
 * Returns a comparator suitable for Array.prototype.sort.
 */
export function compareByEndThenStartDesc<T extends { startDate?: string; endDate?: string }>(
  a: T,
  b: T,
): number {
  const aCurrent = isPresent(a.endDate);
  const bCurrent = isPresent(b.endDate);
  if (aCurrent && !bCurrent) return -1;
  if (!aCurrent && bCurrent) return 1;

  // Both current OR both ended — compare by relevant date, descending.
  const aRef = (aCurrent ? parseResumeDate(a.startDate) : parseResumeDate(a.endDate)) ?? new Date(0);
  const bRef = (bCurrent ? parseResumeDate(b.startDate) : parseResumeDate(b.endDate)) ?? new Date(0);
  return bRef.getTime() - aRef.getTime();
}

/** Internal: format a total month count as "Ny Mm" / "Ny" / "Mm" / "< 1m". */
function formatMonthsAsDuration(totalMonths: number): string {
  if (totalMonths <= 0) return "< 1m";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years > 0 && months > 0) return `${years}y ${months}m`;
  if (years > 0) return `${years}y`;
  return `${months}m`;
}

/** Internal: months between two parsed dates (always non-negative). */
function monthsBetween(start: Date, end: Date): number {
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.4375));
}

/**
 * Calculate a human-friendly duration between two resume dates.
 * Returns strings like "2y 7m", "6m", "1y", or "" when start is missing.
 * "Present" / empty end-date is treated as today.
 */
export function calculateResumeDuration(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): string {
  const start = parseResumeDate(startDate);
  if (!start) return "";

  const end = isPresent(endDate) ? new Date() : parseResumeDate(endDate);
  if (!end) return "";

  return formatMonthsAsDuration(monthsBetween(start, end));
}

/**
 * Sum durations across an array of resume entries (work, education,
 * volunteer, etc.). Entries with unparseable / missing start dates are
 * skipped silently. Used by Career Timeline totals — see
 * ResumeTimelines.tsx.
 *
 * Returns "0 years" when the array is empty (matches the original
 * per-section total format), "< 1m" when entries exist but sum to less
 * than a month, and "Ny Mm" otherwise.
 */
export function sumResumeDurations(
  entries: Array<{ startDate?: string | null; endDate?: string | null }> | null | undefined,
): string {
  if (!entries || entries.length === 0) return "0 years";

  let totalMonths = 0;
  for (const entry of entries) {
    const start = parseResumeDate(entry.startDate);
    if (!start) continue;
    const end = isPresent(entry.endDate) ? new Date() : parseResumeDate(entry.endDate);
    if (!end) continue;
    totalMonths += monthsBetween(start, end);
  }

  return formatMonthsAsDuration(totalMonths);
}
