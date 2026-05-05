/**
 * Pure transform that walks every date field on a `ResumeContent` and
 * normalizes it to a consistent shape:
 *   • All non-empty start/end dates → `YYYY-MM` (or `YYYY-MM-DD` if a
 *     day was given), preserving day precision.
 *   • Open-ended end dates ("", "Present", "Current", "Now") on
 *     work/volunteer/project entries → `Present`.
 *   • Strings the parser can't make sense of are left untouched (caller
 *     gets an `unchanged` count back so the action button can warn).
 *
 * Used by the `standardize_resume_dates` registry tool — both the
 * Optimizer page's Action button and the AI Brain function-caller
 * route through this. No backend round-trip.
 */

import type { ResumeContent, Work, Volunteer, Project, Education } from "@shared/resume";

interface NormalizeOutcome {
  /** Original input, untouched. */
  raw: string;
  /** Normalized form (or the raw value if unparseable). */
  normalized: string;
  /** Whether the value changed. */
  changed: boolean;
}

const PRESENT_TOKENS = new Set([
  "present",
  "current",
  "now",
  "ongoing",
  "today",
]);

const MONTHS: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function normalizeOne(raw: string, allowPresent: boolean): NormalizeOutcome {
  const input = (raw ?? "").trim();
  if (!input) {
    return { raw, normalized: allowPresent ? "Present" : "", changed: allowPresent && raw !== "Present" };
  }
  const lower = input.toLowerCase();
  if (allowPresent && PRESENT_TOKENS.has(lower)) {
    return { raw, normalized: "Present", changed: input !== "Present" };
  }

  // ISO already (YYYY-MM or YYYY-MM-DD).
  const iso = /^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/.exec(input);
  if (iso) {
    const year = iso[1];
    const month = iso[2] ? pad2(Number(iso[2])) : undefined;
    const day = iso[3] ? pad2(Number(iso[3])) : undefined;
    const normalized = day ? `${year}-${month}-${day}` : month ? `${year}-${month}` : year;
    return { raw, normalized, changed: input !== normalized };
  }

  // "January 2024", "Jan 2024", "January, 2024"
  const monthYear = /^([A-Za-z]+)[\s,]+(\d{4})$/.exec(input);
  if (monthYear) {
    const m = MONTHS[monthYear[1].toLowerCase()];
    if (m) {
      const normalized = `${monthYear[2]}-${m}`;
      return { raw, normalized, changed: input !== normalized };
    }
  }

  // "01/2024" or "1/2024" or "01-2024"
  const numericMonthYear = /^(\d{1,2})[\s/\-.](\d{4})$/.exec(input);
  if (numericMonthYear) {
    const m = pad2(Number(numericMonthYear[1]));
    const y = numericMonthYear[2];
    const normalized = `${y}-${m}`;
    return { raw, normalized, changed: input !== normalized };
  }

  // "Jan 5, 2024" or "January 5, 2024"
  const fullDate = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(input);
  if (fullDate) {
    const m = MONTHS[fullDate[1].toLowerCase()];
    if (m) {
      const normalized = `${fullDate[3]}-${m}-${pad2(Number(fullDate[2]))}`;
      return { raw, normalized, changed: input !== normalized };
    }
  }

  // Year alone — already canonical.
  if (/^\d{4}$/.test(input)) {
    return { raw, normalized: input, changed: false };
  }

  return { raw, normalized: input, changed: false };
}

export interface StandardizeDatesReport {
  changedCount: number;
  unchangedCount: number;
  /** Sample of the changes (capped) for the preview UI. */
  changes: Array<{ location: string; from: string; to: string }>;
  /** Sample of unparseable values (capped) so the user can fix manually. */
  unparseable: Array<{ location: string; value: string }>;
}

const PREVIEW_CAP = 8;

/** Walk and normalize every date on the resume. Pure — returns a new
 *  content object plus a report. Caller decides whether to persist. */
export function standardizeResumeDates(
  content: ResumeContent,
): { next: ResumeContent; report: StandardizeDatesReport } {
  const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
  const report: StandardizeDatesReport = {
    changedCount: 0,
    unchangedCount: 0,
    changes: [],
    unparseable: [],
  };

  function visit(loc: string, raw: string, allowPresent: boolean): string {
    const out = normalizeOne(raw, allowPresent);
    if (out.changed) {
      report.changedCount += 1;
      if (report.changes.length < PREVIEW_CAP) {
        report.changes.push({ location: loc, from: raw, to: out.normalized });
      }
    } else {
      report.unchangedCount += 1;
      // If the value is non-empty + non-iso + we left it alone, surface it.
      if (raw && raw.trim() && !/^(\d{4}(-\d{2}){0,2}|Present)$/.test(raw.trim())) {
        if (report.unparseable.length < PREVIEW_CAP) {
          report.unparseable.push({ location: loc, value: raw });
        }
      }
    }
    return out.normalized;
  }

  type Datable = Work | Volunteer | Project | Education;
  function walkArray<T extends Datable>(arr: T[] | undefined, prefix: string, allowPresent: boolean) {
    if (!arr) return;
    arr.forEach((item, i) => {
      if (item.startDate !== undefined) {
        item.startDate = visit(`${prefix}[${i}].startDate`, item.startDate, false);
      }
      if (item.endDate !== undefined) {
        item.endDate = visit(`${prefix}[${i}].endDate`, item.endDate, allowPresent);
      }
    });
  }

  walkArray(next.work, "work", true);
  walkArray(next.volunteer, "volunteer", true);
  walkArray(next.projects, "projects", true);
  walkArray(next.education, "education", false);

  return { next, report };
}
