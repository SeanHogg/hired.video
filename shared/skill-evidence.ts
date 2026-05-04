/**
 * Skill evidence — pure helpers shared by the API extractor merge step
 * and the frontend SkillNetwork visualizer. Stays in shared/ because
 * the year-counting and level-inference rules must agree across the
 * wire: the LLM prompt asks the model to assert a level, the merge
 * step verifies/derives it, and the visualizer reads the same number
 * the API persisted. One module, one source of truth.
 *
 * No IO, no Zod parsing — those live in resume.ts. This file is
 * normalisation logic only.
 */

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
} from "./resume.js";

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

// ─── Resolver: title → item id ─────────────────────────────────────────────

// ─── Flattened skill view ──────────────────────────────────────────────────

/**
 * Flatten a `skills[]` array into one row per atomic skill — every
 * keyword becomes its own row, inheriting the parent row's level and
 * years. Used by the visualizer (so a "Cloud Architecture (Expert)"
 * category renders as separate AWS / Azure / Kubernetes nodes, each at
 * Expert) and by the "By Skill" tab (so keyword-bound evidence groups
 * under the keyword's name, not the parent category's).
 *
 * Why flatten only at the view layer instead of in storage? The JSON
 * Resume spec keeps category groupings in `keywords`, and the merge UI
 * lets users curate which skills are top-level vs keywords. The view
 * layer's job is to make a graph the user can read; the storage layer's
 * job is to round-trip cleanly with standard JSON Resume tooling.
 *
 * Deduped case-insensitively — first occurrence wins. Emits the bare
 * row when no keywords, or one row per keyword when keywords are
 * present (the category row itself is dropped — "Languages" or
 * "Frameworks" isn't a skill, just a label).
 */
export function flattenSkillsForView(skills: Skill[] | undefined): Skill[] {
  if (!Array.isArray(skills) || skills.length === 0) return [];
  const out: Skill[] = [];
  const seen = new Set<string>();
  for (const s of skills) {
    const rowName = (s?.name ?? "").trim();
    const hasKeywords = Array.isArray(s?.keywords) && s.keywords.length > 0;
    if (hasKeywords) {
      for (const kw of s.keywords ?? []) {
        const trimmed = (kw ?? "").trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: s.id ? `${s.id}::${key}` : undefined,
          name: trimmed,
          level: s.level ?? "",
          keywords: [],
          ...(s.yearsOfExperience != null
            ? { yearsOfExperience: s.yearsOfExperience }
            : {}),
        });
      }
    } else if (rowName) {
      const key = rowName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...s, name: rowName, keywords: [] });
    }
  }
  return out;
}

// ─── Graph model with lineage ──────────────────────────────────────────────

/** One node in the skill graph. Same shape as `Skill` but we add a
 *  `parent` pointer so the visualizer can draw lineage edges between a
 *  parent skill and its keyword sub-skills. */
export interface SkillGraphNodeSpec extends Skill {
  /** Canonical (case-preserved) name of the parent skill row, when this
   *  node is a keyword listed under another row. Undefined for top-level
   *  skills and for keywords whose parent row has no level (those parents
   *  are pure categories like "Languages" — they aren't themselves
   *  skills, so there's nothing to draw a lineage edge to). */
  parent?: string;
}

export interface SkillLineageEdge {
  parent: string;
  child: string;
}

/**
 * The graph model that powers the SkillNetwork visualizer. Returns a
 * flat node list AND the lineage edges that tie keyword nodes back to
 * their parent skill — the missing link that turns "18 floating orphan
 * skills" (the 2026-05-04 user complaint) into "skills clustered around
 * the parent's evidenced positions."
 *
 * Decision rule for emitting the parent row as its own node:
 *   - Has a level set → it's a concrete skill (e.g. "Leadership · Advanced")
 *     that the candidate demonstrated. Emit as a node, draw lineage edges
 *     to its keywords. Direct evidence pointing at the parent name binds
 *     to this node; keywords inherit transitively via the lineage edges.
 *   - No level → it's a pure category (e.g. "Languages", "Frameworks").
 *     Don't emit as a node; keywords stand alone. Drawing a lineage edge
 *     to a category-only label would just clutter the graph.
 *
 * Pure — does not mutate input. Deduped case-insensitively across all
 * names (first occurrence wins, same rule as flattenSkillsForView).
 */
export function buildSkillGraphModel(skills: Skill[] | undefined): {
  nodes: SkillGraphNodeSpec[];
  lineage: SkillLineageEdge[];
} {
  if (!Array.isArray(skills) || skills.length === 0) {
    return { nodes: [], lineage: [] };
  }

  const nodes: SkillGraphNodeSpec[] = [];
  const lineage: SkillLineageEdge[] = [];
  const seen = new Set<string>();

  const upsert = (spec: SkillGraphNodeSpec) => {
    const key = spec.name.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    nodes.push(spec);
  };

  for (const s of skills) {
    const rowName = (s?.name ?? "").trim();
    const level = s?.level ?? "";
    const yrs = s?.yearsOfExperience;
    const hasKeywords = Array.isArray(s?.keywords) && s.keywords.length > 0;

    if (hasKeywords) {
      const isParentNode = !!level && !!rowName;
      if (isParentNode) {
        upsert({
          ...(s.id ? { id: s.id } : {}),
          name: rowName,
          level,
          keywords: [],
          ...(yrs != null ? { yearsOfExperience: yrs } : {}),
        });
      }
      for (const kw of s.keywords ?? []) {
        const trimmed = (kw ?? "").trim();
        if (!trimmed) continue;
        upsert({
          ...(s.id ? { id: `${s.id}::${trimmed.toLowerCase()}` } : {}),
          name: trimmed,
          level,
          keywords: [],
          ...(yrs != null ? { yearsOfExperience: yrs } : {}),
          ...(isParentNode ? { parent: rowName } : {}),
        });
        if (isParentNode) {
          lineage.push({ parent: rowName, child: trimmed });
        }
      }
    } else if (rowName) {
      upsert({
        ...(s.id ? { id: s.id } : {}),
        name: rowName,
        level,
        keywords: [],
        ...(yrs != null ? { yearsOfExperience: yrs } : {}),
      });
    }
  }

  return { nodes, lineage };
}

// ─── Heuristic text-mention binder ─────────────────────────────────────────

/** Build the searchable text blob for one item — what the heuristic
 *  binder grep's against to decide whether a skill was used here. Source
 *  fields per item type:
 *    work / volunteer  : position + summary + highlights
 *    project           : description + highlights
 *    education         : area + courses
 *    certificate/award : name/title only
 *  We deliberately don't include the organization name — "AWS" appearing
 *  as part of "AWS re:Invent 2024" award doesn't mean the candidate USED
 *  AWS; it means they attended a conference. Same reason a skill tag like
 *  "Python" shouldn't bind to a position just because "python" appears in
 *  the company URL. */
function buildItemSearchableText(content: ResumeContent | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!content) return out;
  for (const w of (content.work ?? []) as Work[]) {
    if (!w.id) continue;
    out.set(w.id, [w.position, w.summary, ...(w.highlights ?? [])].filter(Boolean).join(" \n "));
  }
  for (const v of (content.volunteer ?? []) as Volunteer[]) {
    if (!v.id) continue;
    out.set(v.id, [v.position, v.summary, ...(v.highlights ?? [])].filter(Boolean).join(" \n "));
  }
  for (const p of (content.projects ?? []) as Project[]) {
    if (!p.id) continue;
    out.set(
      p.id,
      [p.name, p.description, ...(p.highlights ?? []), ...(p.keywords ?? [])]
        .filter(Boolean)
        .join(" \n "),
    );
  }
  for (const e of (content.education ?? []) as Education[]) {
    if (!e.id) continue;
    out.set(e.id, [e.area, ...(e.courses ?? [])].filter(Boolean).join(" \n "));
  }
  return out;
}

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word case-insensitive scan of `text` for `term`. Word boundary
 *  is JavaScript's `\b`, which doesn't fire for tokens like "C#" or
 *  ".NET" — we extend the boundary check manually for those. */
function textMentionsTerm(text: string, term: string): boolean {
  if (!text || !term) return false;
  const trimmed = term.trim();
  if (!trimmed) return false;
  const lower = text.toLowerCase();
  const needle = trimmed.toLowerCase();

  // Multi-character symbol terms (C#, .NET, C++) — fall back to a manual
  // boundary check using surrounding non-letter-non-digit chars.
  if (/[^a-z0-9 ]/i.test(needle)) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) return false;
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = idx + needle.length >= lower.length ? "" : lower[idx + needle.length];
      const ok = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      if (ok) return true;
      from = idx + needle.length;
    }
  }

  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
  return re.test(text);
}

/** Heuristic evidence builder. Walks every skill (top-level name AND
 *  category keywords), scans every evidence-bindable item's text fields
 *  for whole-word mentions, and emits evidence rows for matches that
 *  aren't already in `existingEvidence`. Used as a backstop when the LLM
 *  doesn't return `evidenceLabels` — without it, a freshly-extracted
 *  resume would show "N skills without linked evidence" and the
 *  visualizer's network would be all orphans.
 *
 *  Conservative on purpose: whole-word match only, no fuzzy spelling, no
 *  cross-section inference. The LLM's evidenceLabels (when present)
 *  remain the higher-quality signal — heuristic just covers the gap. */
export function deriveEvidenceFromText(
  content: ResumeContent | undefined,
  existingEvidence: SkillEvidence[],
  newId: () => string,
  now: Date = new Date(),
): SkillEvidence[] {
  if (!content) return [];
  const itemTexts = buildItemSearchableText(content);
  const itemTypeById = new Map<string, SkillEvidenceItemType>();
  for (const it of listResolvableItems(content)) itemTypeById.set(it.id, it.itemType);

  const seen = new Set(
    existingEvidence.map(
      (e) => `${e.skillName.toLowerCase().trim()}::${e.referenceId}`,
    ),
  );

  // Build the search list — every skill name AND every keyword. Keywords
  // are typically the actual technologies (e.g. "AWS" under a "Cloud
  // Architecture" parent), so they bind to evidence under their own name.
  const searchTerms: Array<{ skillName: string }> = [];
  for (const s of (content.skills ?? []) as Skill[]) {
    const top = (s.name ?? "").trim();
    if (top) searchTerms.push({ skillName: top });
    for (const kw of s.keywords ?? []) {
      const k = (kw ?? "").trim();
      if (k) searchTerms.push({ skillName: k });
    }
  }
  // Dedupe search terms case-insensitively so we don't scan the same word
  // under both a top-level name and a keyword.
  const uniqueTerms = new Map<string, string>();
  for (const t of searchTerms) {
    const key = t.skillName.toLowerCase();
    if (!uniqueTerms.has(key)) uniqueTerms.set(key, t.skillName);
  }

  const nowIso = now.toISOString();
  const fresh: SkillEvidence[] = [];
  for (const [, skillName] of uniqueTerms) {
    for (const [itemId, itemText] of itemTexts) {
      if (!textMentionsTerm(itemText, skillName)) continue;
      const dedupeKey = `${skillName.toLowerCase().trim()}::${itemId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const itemType = itemTypeById.get(itemId);
      if (!itemType) continue;
      fresh.push({
        id: newId(),
        skillName,
        itemType,
        referenceId: itemId,
        source: "derived",
        createdAt: nowIso,
      });
    }
  }
  return fresh;
}

// ─── Skill list normalisation ──────────────────────────────────────────────

const LEVEL_RANK: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
  Expert: 4,
};

function dedupeStringsCaseInsensitive(arr: readonly string[] | undefined): string[] {
  if (!arr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (typeof s !== "string") continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normalise a JSON Resume `skills[]` array to remove the duplication
 * patterns that accumulate across multiple extractor / parse passes:
 *
 *   1. **Drop bare top-level rows whose name appears as a keyword under
 *      another row's category.** Example from a real resume on 2026-05-03:
 *      "Cloud Architecture (Expert)" has keywords [AWS, Azure, …] AND the
 *      same array also has bare top-level rows "AWS", "Azure". The
 *      keyword-under-category form is canonical (it preserves the parent
 *      category's level and grouping); the bare row is the duplicate.
 *
 *   2. **Merge case-insensitive name duplicates.** Two "Python" rows
 *      collapse into one; the merged row keeps the highest level,
 *      highest yearsOfExperience, and a deduped union of keywords.
 *
 *   3. **Dedupe keywords within each row** (case-insensitive).
 *
 * Pure — does not mutate input. Used by `mergeExtractedSkillsIntoResume`
 * after every merge AND by the frontend save-back path so re-running the
 * Skill Extractor on the same resume tightens the list instead of
 * appending more duplicates.
 */
/** Accept any partial-Skill shape (some callers — including the API
 *  merge step — work with row records where `level` may be undefined
 *  rather than the empty-string default the schema enforces). The
 *  function tolerates missing fields and emits canonical Skill rows. */
export type OptimizableSkill = Partial<Skill> & { name?: string };

export function dedupeAndOptimizeSkills(skills: OptimizableSkill[] | undefined): Skill[] {
  if (!Array.isArray(skills) || skills.length === 0) return [];

  // Pass 1 — collect every keyword string used in the array. A keyword
  // here means "the skill is already represented under some category",
  // so a bare top-level row with the same name can be dropped.
  const keywordsAcrossGroups = new Set<string>();
  for (const s of skills) {
    if (!Array.isArray(s?.keywords)) continue;
    for (const kw of s.keywords) {
      if (typeof kw === "string" && kw.trim()) {
        keywordsAcrossGroups.add(kw.toLowerCase().trim());
      }
    }
  }

  // Pass 2 — walk the input and emit the cleaned array. seenNames lets us
  // merge by case-insensitive name without a second walk.
  const out: Skill[] = [];
  const seenNames = new Map<string, number>();

  for (const s of skills) {
    const rawName = (s?.name ?? "").trim();
    if (!rawName) continue;
    const nameKey = rawName.toLowerCase();

    const hasKeywords = Array.isArray(s.keywords) && s.keywords.length > 0;
    // Drop bare rows whose name is already a keyword under some category.
    // Don't drop rows that themselves carry keywords — those rows are
    // categories, not duplicates, even if their name happens to clash.
    if (!hasKeywords && keywordsAcrossGroups.has(nameKey)) continue;

    const existingIdx = seenNames.get(nameKey);
    if (existingIdx !== undefined) {
      const prev = out[existingIdx];
      // Merge keywords (case-insensitive union, preserving original casing
      // from whichever entry surfaced the keyword first).
      prev.keywords = dedupeStringsCaseInsensitive([
        ...(prev.keywords ?? []),
        ...(s.keywords ?? []),
      ]);
      // Highest level wins. Free-form level strings outside the canonical
      // four are treated as rank 0 — they only fill in when the prev had no
      // level either.
      const prevRank = LEVEL_RANK[prev.level ?? ""] ?? 0;
      const curRank = LEVEL_RANK[s.level ?? ""] ?? 0;
      if (curRank > prevRank) prev.level = s.level;
      // Highest years wins.
      if (
        s.yearsOfExperience != null &&
        (prev.yearsOfExperience == null ||
          s.yearsOfExperience > prev.yearsOfExperience)
      ) {
        prev.yearsOfExperience = s.yearsOfExperience;
      }
      // Earliest id wins (preserves stable React keys / evidence joins).
      continue;
    }

    out.push({
      ...s,
      name: rawName,
      level: s.level ?? "",
      keywords: dedupeStringsCaseInsensitive(s.keywords),
    });
    seenNames.set(nameKey, out.length - 1);
  }

  return out;
}

// ─── Manual merge of skills (and the evidence that points at them) ────────

/**
 * Merge a set of skill rows into a single canonical row, remapping any
 * evidence that pointed at the absorbed names. The user picks which
 * skill is the "primary" — its `name` and `level` survive; the others
 * contribute their keywords + their old name itself (folded in as a
 * keyword on the primary so the canonical name stays visible) and any
 * higher `yearsOfExperience` they recorded.
 *
 * Why a single shared helper instead of per-call merge logic?
 *   1. The DRY rule — both the resume editor and the SkillExtractor
 *      tool surface a Merge action, and they have to behave identically
 *      (otherwise users get different shapes depending on entry point).
 *   2. Evidence remapping is the subtle part — when "AWS" is merged
 *      INTO "Cloud Architecture", every evidence row with `skillName:
 *      "AWS"` either drops (because AWS is now a keyword under Cloud
 *      Architecture and the heuristic will rebind it) or rebinds to the
 *      new primary. Consumers shouldn't reimplement that rule.
 *
 * Returns `{ skills, evidence }` so callers can update both arrays in a
 * single state mutation. Pure — does not mutate inputs.
 */
export function mergeSkills(input: {
  skills: Skill[];
  evidence: SkillEvidence[];
  /** Indexes (into `skills`) of the rows to fuse together. Must contain
   *  at least 2 indexes; out-of-range or duplicate indexes are ignored. */
  selectedIndexes: number[];
  /** Index of the primary — the row whose name + level survive. Must be
   *  in `selectedIndexes`. When omitted, defaults to the first index. */
  primaryIndex?: number;
}): { skills: Skill[]; evidence: SkillEvidence[] } {
  const { skills, evidence } = input;
  if (!Array.isArray(skills) || skills.length === 0) {
    return { skills: skills ?? [], evidence: evidence ?? [] };
  }

  // Sanitise selection — keep distinct, in-range, ≥ 2 entries.
  const selected = Array.from(new Set(input.selectedIndexes ?? []))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < skills.length);
  if (selected.length < 2) return { skills, evidence };

  const primary =
    input.primaryIndex != null && selected.includes(input.primaryIndex)
      ? input.primaryIndex
      : selected[0];
  const primaryRow = skills[primary];
  const primaryName = (primaryRow.name ?? "").trim();
  if (!primaryName) {
    // Refuse to merge into a nameless row — there'd be nothing to bind
    // evidence to. Caller should rename first.
    return { skills, evidence };
  }
  const primaryNameLower = primaryName.toLowerCase();

  // Build the merged row — keywords are the union of every selected
  // row's keywords PLUS the absorbed rows' names themselves (so the
  // user can still see "AWS" as a keyword under "Cloud Architecture"
  // instead of losing the term entirely). Level/years take the highest.
  const mergedKeywords: string[] = [...(primaryRow.keywords ?? [])];
  let mergedLevel = primaryRow.level ?? "";
  let mergedYears = primaryRow.yearsOfExperience;

  const absorbedNamesLower = new Set<string>();
  for (const idx of selected) {
    if (idx === primary) continue;
    const row = skills[idx];
    const rowName = (row.name ?? "").trim();
    if (rowName && rowName.toLowerCase() !== primaryNameLower) {
      absorbedNamesLower.add(rowName.toLowerCase());
      mergedKeywords.push(rowName);
    }
    for (const kw of row.keywords ?? []) {
      const kwTrim = (kw ?? "").trim();
      if (kwTrim) mergedKeywords.push(kwTrim);
    }
    const prevRank = LEVEL_RANK[mergedLevel] ?? 0;
    const curRank = LEVEL_RANK[row.level ?? ""] ?? 0;
    if (curRank > prevRank) mergedLevel = row.level ?? mergedLevel;
    if (
      row.yearsOfExperience != null &&
      (mergedYears == null || row.yearsOfExperience > mergedYears)
    ) {
      mergedYears = row.yearsOfExperience;
    }
  }

  // Remove the absorbed name from keywords if it slipped in (the primary
  // shouldn't carry its own name as a keyword) and dedupe.
  const dedupedKeywords = dedupeStringsCaseInsensitive(
    mergedKeywords.filter(
      (kw) => kw.toLowerCase().trim() !== primaryNameLower,
    ),
  );

  const mergedRow: Skill = {
    ...primaryRow,
    name: primaryName,
    level: mergedLevel,
    keywords: dedupedKeywords,
    ...(mergedYears != null ? { yearsOfExperience: mergedYears } : {}),
  };

  // Replace primary in place; drop the others. Walking by index in
  // descending order so splice indexes stay valid as we mutate.
  const nextSkills = [...skills];
  nextSkills[primary] = mergedRow;
  for (const idx of [...selected].sort((a, b) => b - a)) {
    if (idx === primary) continue;
    nextSkills.splice(idx, 1);
  }

  // Remap evidence — every row whose `skillName` matches an absorbed name
  // gets rebound to the primary. Dedupe by (skillName, referenceId) since
  // two absorbed rows could have pointed at the same item.
  const remapped: SkillEvidence[] = [];
  const seen = new Set<string>();
  for (const ev of evidence ?? []) {
    const lower = ev.skillName.toLowerCase().trim();
    const next: SkillEvidence = absorbedNamesLower.has(lower)
      ? { ...ev, skillName: primaryName }
      : ev;
    const key = `${next.skillName.toLowerCase().trim()}::${next.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    remapped.push(next);
  }

  return { skills: nextSkills, evidence: remapped };
}

// ─── Manual merge of certificates (and the evidence that points at them) ───

/**
 * Merge a set of certificate rows into a single canonical row, remapping
 * any skill evidence whose `referenceId` pointed at the absorbed certs.
 * Mirrors `mergeSkills` in shape so the editor wiring is symmetric.
 *
 * Field rules (primary wins, but empty primary fields are filled from the
 * first absorbed row that has a value — so merging an "AWS Solutions
 * Architect" entry with the issuer/date filled into a same-named row that
 * had only the title doesn't lose the metadata):
 *   - name: primary's (the row whose name survives is the user's pick)
 *   - issuer / date / url / interactive: primary first, else first
 *     absorbed row that has a non-empty value
 *   - id: primary's (so existing skill evidence already pointing at the
 *     primary stays bound; only evidence pointing at absorbed ids is
 *     remapped)
 *
 * Evidence remap: any SkillEvidence row with `itemType === "certificate"`
 * and `referenceId` matching an absorbed cert's id has its `referenceId`
 * rewritten to the primary's id. Deduped by (skillName, referenceId) so
 * two absorbed certs that both proved the same skill collapse to one row.
 * If the primary has no id, we drop evidence pointing at absorbed ids
 * rather than orphan it (no anchor to remap to).
 */
export function mergeCertificates(input: {
  certificates: Certificate[];
  evidence: SkillEvidence[];
  /** Indexes (into `certificates`) of the rows to fuse. Must contain ≥ 2;
   *  out-of-range or duplicate indexes are ignored. */
  selectedIndexes: number[];
  /** Index of the primary — the row whose name survives. Must be in
   *  `selectedIndexes`. Defaults to the first selected index. */
  primaryIndex?: number;
}): { certificates: Certificate[]; evidence: SkillEvidence[] } {
  const { certificates, evidence } = input;
  if (!Array.isArray(certificates) || certificates.length === 0) {
    return { certificates: certificates ?? [], evidence: evidence ?? [] };
  }

  const selected = Array.from(new Set(input.selectedIndexes ?? []))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < certificates.length);
  if (selected.length < 2) return { certificates, evidence };

  const primary =
    input.primaryIndex != null && selected.includes(input.primaryIndex)
      ? input.primaryIndex
      : selected[0];
  const primaryRow = certificates[primary];
  const primaryName = (primaryRow.name ?? "").trim();
  if (!primaryName) {
    // Refuse to merge into a nameless row — same rule as mergeSkills.
    return { certificates, evidence };
  }

  const fillIfEmpty = (current: string | undefined, fallbacks: (string | undefined)[]): string => {
    const cur = (current ?? "").trim();
    if (cur) return current ?? "";
    for (const f of fallbacks) {
      const v = (f ?? "").trim();
      if (v) return f ?? "";
    }
    return current ?? "";
  };

  const absorbed = selected.filter((i) => i !== primary).map((i) => certificates[i]);
  const absorbedIds = new Set(
    absorbed.map((c) => c.id).filter((id): id is string => !!id),
  );

  const mergedRow: Certificate = {
    ...primaryRow,
    name: primaryName,
    issuer: fillIfEmpty(primaryRow.issuer, absorbed.map((c) => c.issuer)),
    date: fillIfEmpty(primaryRow.date, absorbed.map((c) => c.date)),
    url: fillIfEmpty(primaryRow.url, absorbed.map((c) => c.url)),
    interactive:
      primaryRow.interactive ??
      absorbed.find((c) => c.interactive != null)?.interactive,
  };

  const nextCertificates = [...certificates];
  nextCertificates[primary] = mergedRow;
  for (const idx of [...selected].sort((a, b) => b - a)) {
    if (idx === primary) continue;
    nextCertificates.splice(idx, 1);
  }

  // Remap (or drop) skill evidence pointing at the absorbed cert ids.
  const primaryId = primaryRow.id;
  const remapped: SkillEvidence[] = [];
  const seen = new Set<string>();
  for (const ev of evidence ?? []) {
    let next: SkillEvidence = ev;
    if (ev.itemType === "certificate" && absorbedIds.has(ev.referenceId)) {
      if (!primaryId) continue; // nothing to rebind to — drop
      next = { ...ev, referenceId: primaryId };
    }
    const key = `${next.skillName.toLowerCase().trim()}::${next.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    remapped.push(next);
  }

  return { certificates: nextCertificates, evidence: remapped };
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
