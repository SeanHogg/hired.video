/**
 * Builds the picker's PersonContext from what the person gave us (Settings ›
 * Video personalization), their résumé dates, their region, and who the
 * video speaks to. Pure — it runs in the person's browser so their dates
 * never leave it.
 */
import type { VideoPersonalization } from "../video-personalization.js";
import type { PersonMoment, ThemeFit } from "./event.js";
import type { MomentDate, PersonContext } from "./pick.js";
import { parseIsoDay, type DayNumber } from "./dates.js";

/** A graduation counts as "recent" for a year after it. */
const RECENT_GRADUATION_DAYS = 365;

export interface ResumeDates {
  /** ISO start date of the current job ("2024-12-01"), if any. */
  currentJobStart?: string | null;
  /** ISO end date of the latest education, if any. */
  latestGraduation?: string | null;
  /** Works in a school (Back to school fits). */
  schoolRole?: boolean;
  /** Served in the military (Veterans Day fits). */
  veteran?: boolean;
}

function monthDayOf(iso: string | null | undefined): (MomentDate & { day0: DayNumber }) | null {
  if (!iso) return null;
  const full = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : /^\d{4}-\d{2}$/.test(iso) ? `${iso}-01` : null;
  const day0 = full ? parseIsoDay(full) : null;
  if (!full || day0 === null) return null;
  return { month: Number(full.slice(5, 7)), day: Number(full.slice(8, 10)), day0 };
}

export function buildPersonContext(input: {
  personalization: VideoPersonalization | null;
  resume?: ResumeDates;
  region: string | null;
  /** The video speaks to a hiring manager (Boss's Day fits). */
  speaksToHiringManager?: boolean;
  today: DayNumber;
}): PersonContext {
  const p = input.personalization;
  const moments: Partial<Record<PersonMoment, MomentDate>> = {};
  const fits = new Set<ThemeFit>();
  if (input.speaksToHiringManager) fits.add("hiringManager");
  if (input.resume?.schoolRole) fits.add("teacher");
  if (input.resume?.veteran) fits.add("veteran");
  if (p) {
    if (p.birthday) moments.birthday = p.birthday;
    if (p.wedding) moments.wedding = p.wedding;
    if (p.inMemory) moments.inMemory = p.inMemory;
    if (p.isParent) fits.add("parent");
    if (p.useWorkAnniversary) {
      const start = monthDayOf(input.resume?.currentJobStart);
      // An anniversary needs at least a year in the job.
      if (start && input.today - start.day0 >= 365) moments.workAnniversary = { month: start.month, day: start.day };
    }
    if (p.useGraduation) {
      const grad = monthDayOf(input.resume?.latestGraduation);
      if (grad && input.today - grad.day0 <= RECENT_GRADUATION_DAYS) {
        moments.graduation = { month: grad.month, day: grad.day };
        fits.add("student");
      }
    }
  }
  return { region: input.region, fits, moments };
}
