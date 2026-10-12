/**
 * The résumé dates the theme picker can use as personal moments (Settings ›
 * Video personalization lets the person turn each off): the current job's
 * start (work anniversary) and the latest education end (graduation) — and
 * the fits the résumé shows (a school role, military service).
 */
import type { ResumeContent } from "@shared/resume";
import type { ResumeDates } from "@shared/theme-calendar/person";

/** "2024-12", "2024-12-01" or "2024" → a sortable ISO-ish string, or "". */
function iso(date: string | undefined | null): string {
  const d = (date ?? "").trim();
  return /^\d{4}(-\d{2}){0,2}$/.test(d) ? d : "";
}

// Tight on purpose: a fit picks a theme that SAYS something about the person
// ("Veteran, ready for my next mission"), so a loose match would invent a
// fact ("Principal Engineer", "Navy Federal Credit Union" must not match).
const SCHOOL = /\b(teacher|educator|professor|lecturer|teaching assistant)\b|\b(elementary|middle|high) school\b|\bschool district\b/i;
const MILITARY = /\b(veteran|national guard|usmc|usaf)\b|\b(u\.?s\.?|united states) (army|navy|air force|marine corps|coast guard|space force)\b/i;

export function resumeMomentDates(content: ResumeContent): ResumeDates {
  const current = (content.work ?? [])
    .filter((w) => !iso(w.endDate) && iso(w.startDate).length >= 7)
    .map((w) => iso(w.startDate))
    .sort()
    .pop();
  const graduation = (content.education ?? [])
    .map((e) => iso(e.endDate))
    .filter((d) => d.length >= 7)
    .sort()
    .pop();
  const roles = (content.work ?? []).map((w) => `${w.position ?? ""} ${w.name ?? ""}`);
  const currentRoles = (content.work ?? []).filter((w) => !iso(w.endDate)).map((w) => `${w.position ?? ""} ${w.name ?? ""}`);
  return {
    currentJobStart: current ?? null,
    latestGraduation: graduation ?? null,
    schoolRole: currentRoles.some((r) => SCHOOL.test(r)),
    veteran: roles.some((r) => MILITARY.test(r)),
  };
}
