// Skill evidence core — date math, level inference, resolvable-item lookup,
// evidence math, enrichment/grouping, and the label → item resolver.

import type {
  ResumeContent,
  Skill,
  SkillEvidence,
  SkillEvidenceItemType,
  Work,
  Volunteer,
  Project,
  Education,
  Certificate,
  Award,
  Publication,
} from "../resume.js";

// ─── Date math ─────────────────────────────────────────────────────────────

/** Whole months between two date strings. Returns 0 when either side is
 *  unparseable so the visualizer doesn't render NaN years for sloppy
 *  resume dates ("Spring 2019"). `endDate` falsy or "present" means now. */
export function monthsBetween(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date = new Date(),
): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 0;
  const isPresent = !endDate || endDate.trim() === "" || endDate.trim().toLowerCase() === "present";
  const end = isPresent ? now : new Date(endDate as string);
  if (!isPresent && isNaN(end.getTime())) return 0;
  const diffDays = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 30);
}

// ─── Level inference ───────────────────────────────────────────────────────

/** Years → proficiency label. Tuned to match how recruiters typically
 *  read seniority on a resume; not a hard credential ladder. <1y is the
 *  Beginner cutoff because 11 months of one stack rarely reads as
 *  "Intermediate" on a CV. */
export function inferLevelFromYears(years: number): Skill["level"] {
  if (years >= 7) return "Expert";
  if (years >= 3) return "Advanced";
  if (years >= 1) return "Intermediate";
  return "Beginner";
}

// ─── Item lookup ───────────────────────────────────────────────────────────

/** A normalised view of any section item that can be evidence-bound, with
 *  its dates and a human-readable label/sublabel for the visualizer. The
 *  fields that don't apply to a given itemType are left undefined rather
 *  than empty-string so the consumer can decide whether to hide them. */
export interface ResolvedItem {
  itemType: SkillEvidenceItemType;
  id: string;
  title: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
}

/** Walk all evidence-bindable sections of a resume and emit ResolvedItem
 *  rows. Used by the merge step (to validate evidence references against
 *  real items) and by the visualizer (to render evidence pointers as
 *  "Position at Org, 2020-2024"). */
export function listResolvableItems(content: ResumeContent | undefined): ResolvedItem[] {
  if (!content) return [];
  const out: ResolvedItem[] = [];
  for (const w of (content.work ?? []) as Work[]) {
    if (!w.id) continue;
    out.push({
      itemType: "work",
      id: w.id,
      title: w.position || w.name || "Position",
      organization: w.name || undefined,
      startDate: w.startDate || undefined,
      endDate: w.endDate || undefined,
    });
  }
  for (const v of (content.volunteer ?? []) as Volunteer[]) {
    if (!v.id) continue;
    out.push({
      itemType: "volunteer",
      id: v.id,
      title: v.position || v.organization || "Volunteer",
      organization: v.organization || undefined,
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
    });
  }
  for (const p of (content.projects ?? []) as Project[]) {
    if (!p.id) continue;
    out.push({
      itemType: "project",
      id: p.id,
      title: p.name || "Project",
      organization: p.entity || undefined,
      startDate: p.startDate || undefined,
      endDate: p.endDate || undefined,
    });
  }
  for (const e of (content.education ?? []) as Education[]) {
    if (!e.id) continue;
    const title = [e.studyType, e.area].filter(Boolean).join(" in ") || "Education";
    out.push({
      itemType: "education",
      id: e.id,
      title,
      organization: e.institution || undefined,
      startDate: e.startDate || undefined,
      endDate: e.endDate || undefined,
    });
  }
  for (const c of (content.certificates ?? []) as Certificate[]) {
    if (!c.id) continue;
    out.push({
      itemType: "certificate",
      id: c.id,
      title: c.name || "Certificate",
      organization: c.issuer || undefined,
      startDate: c.date || undefined,
      endDate: c.date || undefined,
    });
  }
  for (const a of (content.awards ?? []) as Award[]) {
    if (!a.id) continue;
    out.push({
      itemType: "award",
      id: a.id,
      title: a.title || "Award",
      organization: a.awarder || undefined,
      startDate: a.date || undefined,
      endDate: a.date || undefined,
    });
  }
  for (const p of (content.publications ?? []) as Publication[]) {
    if (!p.id) continue;
    out.push({
      itemType: "publication",
      id: p.id,
      title: p.name || "Publication",
      organization: p.publisher || undefined,
      startDate: p.releaseDate || undefined,
      endDate: p.releaseDate || undefined,
    });
  }
  return out;
}

/** Index ResolvedItem rows by id for O(1) joins from evidence rows. */
export function indexResolvedItems(items: ResolvedItem[]): Map<string, ResolvedItem> {
  const map = new Map<string, ResolvedItem>();
  for (const it of items) map.set(it.id, it);
  return map;
}

// ─── Evidence math ─────────────────────────────────────────────────────────

/** Sum months across the evidence rows attached to a single skill, joined
 *  to their referenced items. Overlapping date ranges are NOT deduplicated
 *  because a recruiter reading a resume reads parallel work as separate
 *  experience signals — using Python at company A while contributing to a
 *  side project at company B is two pieces of evidence, not one. The merge
 *  step persists this number on Skill.yearsOfExperience so the renderer
 *  doesn't have to recompute it on every paint. */
export function computeMonthsForSkill(
  skillName: string,
  evidence: SkillEvidence[],
  itemIndex: Map<string, ResolvedItem>,
  now: Date = new Date(),
): number {
  const lower = skillName.toLowerCase().trim();
  let months = 0;
  for (const ev of evidence) {
    if (ev.skillName.toLowerCase().trim() !== lower) continue;
    if (typeof ev.monthsUsed === "number" && ev.monthsUsed > 0) {
      months += ev.monthsUsed;
      continue;
    }
    const item = itemIndex.get(ev.referenceId);
    if (!item) continue;
    months += monthsBetween(item.startDate, item.endDate, now);
  }
  return months;
}

/** Years derived from `computeMonthsForSkill`, rounded to one decimal so
 *  the UI can show "2.5y" without leaking floating-point garbage. */
export function computeYearsForSkill(
  skillName: string,
  evidence: SkillEvidence[],
  itemIndex: Map<string, ResolvedItem>,
  now: Date = new Date(),
): number {
  const months = computeMonthsForSkill(skillName, evidence, itemIndex, now);
  return Math.round((months / 12) * 10) / 10;
}

// ─── Enrichment + grouping ─────────────────────────────────────────────────

/** Walk the skills[] of a resume and fill in `yearsOfExperience` and
 *  `level` from evidence + items where they're missing. Returns a fresh
 *  array — does not mutate. Used by both the API write path (so the
 *  blob persisted matches what the visualizer renders) and by frontend
 *  read paths that want enrichment without a re-fetch. */
export function enrichSkillsWithEvidence(content: ResumeContent | undefined): Skill[] {
  if (!content) return [];
  const skills = (content.skills ?? []) as Skill[];
  const evidence = (content.skillEvidence ?? []) as SkillEvidence[];
  if (evidence.length === 0) return skills;
  const itemIndex = indexResolvedItems(listResolvableItems(content));
  return skills.map((s) => {
    if (!s.name) return s;
    const years = computeYearsForSkill(s.name, evidence, itemIndex);
    const next: Skill = { ...s };
    if (years > 0 && next.yearsOfExperience == null) {
      next.yearsOfExperience = years;
    }
    if ((!next.level || next.level.trim() === "") && years > 0) {
      next.level = inferLevelFromYears(years);
    }
    return next;
  });
}

/** Group evidence rows by skill name (case-insensitive) — the data shape
 *  the "By Skill" tab of the visualizer renders directly. */
export function groupEvidenceBySkill(
  evidence: SkillEvidence[],
): Map<string, SkillEvidence[]> {
  const map = new Map<string, SkillEvidence[]>();
  for (const ev of evidence) {
    const key = ev.skillName.toLowerCase().trim();
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }
  return map;
}

/** Group evidence rows by the item they point at — the "By Position" tab
 *  of the visualizer. Skips evidence whose referenceId no longer matches
 *  a real item (the user might have deleted a position). */
export function groupEvidenceByItem(
  evidence: SkillEvidence[],
  itemIndex: Map<string, ResolvedItem>,
): Map<string, { item: ResolvedItem; skills: SkillEvidence[] }> {
  const map = new Map<string, { item: ResolvedItem; skills: SkillEvidence[] }>();
  for (const ev of evidence) {
    const item = itemIndex.get(ev.referenceId);
    if (!item) continue;
    const bucket = map.get(item.id) ?? { item, skills: [] };
    bucket.skills.push(ev);
    map.set(item.id, bucket);
  }
  return map;
}

/** Find the best ResolvedItem match for an LLM-emitted item label like
 *  "Senior Engineer at Stripe" or "Stripe Payments Project". Returns
 *  undefined when no item is similar enough — caller drops the evidence
 *  rather than binding it to the wrong item. The match is intentionally
 *  conservative: the LLM hallucinating evidence would fabricate the
 *  "qualified" claim the feature exists to prove. */
export function resolveItemByLabel(
  label: string,
  items: ResolvedItem[],
): ResolvedItem | undefined {
  const lower = label.toLowerCase().trim();
  if (!lower) return undefined;
  // 1. Exact title or organization match.
  const exact = items.find(
    (it) =>
      it.title.toLowerCase() === lower ||
      (it.organization && it.organization.toLowerCase() === lower),
  );
  if (exact) return exact;
  // 2. Title + organization concatenated either way.
  const combined = items.find((it) => {
    if (!it.organization) return false;
    const a = `${it.title} at ${it.organization}`.toLowerCase();
    const b = `${it.organization} ${it.title}`.toLowerCase();
    return a === lower || b === lower;
  });
  if (combined) return combined;
  // 3. Substring containment in either direction — favours a unique
  //    organization mention ("at Stripe" → the Stripe row) but bails when
  //    multiple items match so we don't pick arbitrarily.
  const candidates = items.filter((it) => {
    const t = it.title.toLowerCase();
    const o = it.organization?.toLowerCase() ?? "";
    return t.includes(lower) || lower.includes(t) || (o && (o.includes(lower) || lower.includes(o)));
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
