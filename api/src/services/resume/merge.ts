/**
 * Resume Merge Service
 *
 * Provides section-by-section comparison and merge logic for consolidating
 * multiple resumes. Uses deterministic matching (Levenshtein, Jaccard) with
 * optional AI refinement for ambiguous cases.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import { normalizeJsonResume } from "./parse.js";

/**
 * Coerce a skills/keywords/etc entry into a canonical `{ name, keywords[] }`
 * object shape. Callers sometimes ship skills as plain strings
 * (["JavaScript","React"]) — the merge scorer expects objects, so we
 * widen the input here instead of branching on shape throughout the
 * scoring code.
 */
function coerceSkillShape(item: unknown): Record<string, any> {
  if (typeof item === "string") return { name: item, level: "", keywords: [] };
  if (item && typeof item === "object") return item as Record<string, any>;
  return { name: "", level: "", keywords: [] };
}

/**
 * Normalise a resume content blob ahead of merge analysis/execution:
 *   - Lowercase every key via `normalizeJsonResume` (handles PascalCase exports).
 *   - Coerce scalar skills to the `{name, keywords}` object shape.
 * Always returns a fresh object — never mutates the caller's data.
 */
function normalizeContentForMerge(content: unknown): Record<string, any> {
  const normalized = normalizeJsonResume(content);
  if (Array.isArray(normalized.skills)) {
    normalized.skills = (normalized.skills as unknown[]).map(coerceSkillShape);
  }
  if (Array.isArray(normalized.interests)) {
    normalized.interests = (normalized.interests as unknown[]).map(coerceSkillShape);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MergeSectionType =
  | "work"
  | "education"
  | "skills"
  | "volunteer"
  | "awards"
  | "certificates"
  | "publications"
  | "languages"
  | "interests"
  | "references"
  | "projects";

/** Counts of items that appear only in source, only in target, or in
 *  both — used for both highlight bullets and array-of-strings fields
 *  like `courses` or `keywords`. */
export interface ArrayDiff {
  onlyInSource: number;
  onlyInTarget: number;
  shared: number;
}

/** Fields that differ between two identity-matched entries. Each value
 *  is the pair of values found (source first, target second) so the UI
 *  can render a before/after view. Empty when the field matches. */
export type ScalarFieldDiffs = Record<string, { source: string; target: string }>;

export interface SectionMatch {
  sectionType: MergeSectionType;
  sourceIndex: number;
  targetIndex: number | null;
  confidence: number;
  matchReason: string;
  mergeAction: "auto" | "manual" | "skip";
  /** True when source and target represent the same record (identity
   *  matched) but any meaningful content differs — signals the UI that
   *  the user should review which values to keep even though the match
   *  itself is solid. Covers bullets AND scalar fields (dates, summary,
   *  URL, description, institution name variants, etc.). */
  hasContentDifferences?: boolean;
  /** Bullet-level diff for fields like `highlights` (work/volunteer/
   *  projects) and `courses` (education). Present only when the section
   *  has such a field. */
  highlightDiff?: ArrayDiff;
  /** Keyword-level diff for projects/skills/interests. */
  keywordDiff?: ArrayDiff;
  /** Which scalar fields (dates, summary, url, etc.) differ between the
   *  two entries. Key = field name, value = { source, target } text. */
  scalarDiffs?: ScalarFieldDiffs;
  /** Set when the SOURCE entry's identity also appears in a different
   *  section type within the same source resume — e.g. a volunteer row
   *  whose `organization` matches a `work[].name`. Almost always means
   *  the parser misclassified the entry; the UI surfaces a warning and
   *  defaults the action to skip so bad data doesn't ride along into
   *  the merge. */
  crossSectionConflict?: {
    suggestedSection: string;
    /** Human-readable reason ("Also appears in Work as 'VP at Acme'"). */
    reason: string;
  };
}

export interface BasicsConflict {
  field: string;
  sourceValue: string;
  targetValue: string;
}

export interface MergeAnalysis {
  basics: {
    conflicts: BasicsConflict[];
    autoMerge: boolean;
  };
  sectionMatches: SectionMatch[];
  newSections: Array<{
    sectionType: MergeSectionType;
    sourceIndex: number;
    item: Record<string, unknown>;
    /** See SectionMatch.crossSectionConflict — same semantics for new
     *  items that have no matching target. */
    crossSectionConflict?: {
      suggestedSection: string;
      reason: string;
    };
  }>;
  summary: {
    totalSections: number;
    autoMerge: number;
    manualReview: number;
    skip: number;
    newItems: number;
  };
}

export interface MergeDecision {
  sectionType: string;
  sourceIndex: number;
  targetIndex: number | null;
  action: "merge" | "replace" | "skip" | "add";
  mergeHighlights?: "combine" | "source_only" | "target_only";
  /** Exact list of highlight strings to use, overriding `mergeHighlights`.
   *  Set by the UI when the user has ticked/unticked individual bullets.
   *  When present, this wins. */
  selectedHighlights?: string[];
  /** Per-field picks for scalar values that differ between source and
   *  target (e.g. startDate, summary, url). Value is which side to take. */
  scalarChoices?: Record<string, "source" | "target">;
}

export interface MergeRequest {
  sourceResumeId: string;
  targetResumeId: string;
  decisions: MergeDecision[];
  createNew: boolean;
  newTitle?: string;
}

export interface MergeResult {
  resumeId: string;
  title: string;
  mergedSections: number;
  skippedSections: number;
  newSections: number;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

const COMPANY_SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|company|group|holdings|plc|gmbh|sa|ag|pty|limited)\b\.?/gi;

export function normalizeString(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(COMPANY_SUFFIXES, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function levenshteinRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a?.length && !b?.length) return 1;
  if (!a?.length || !b?.length) return 0;
  const setA = new Set(a.map(normalizeString));
  const setB = new Set(b.map(normalizeString));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function parseMonthYear(dateStr: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  // Handle "YYYY-MM", "YYYY-MM-DD", "MM/YYYY", or just "YYYY"
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]) };
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{4})/);
  if (slashMatch) return { year: parseInt(slashMatch[2]), month: parseInt(slashMatch[1]) };
  const yearOnly = dateStr.match(/^(\d{4})$/);
  if (yearOnly) return { year: parseInt(yearOnly[1]), month: 1 };
  return null;
}

function monthsSinceEpoch(d: { year: number; month: number }): number {
  return d.year * 12 + d.month;
}

function computeDateOverlap(
  sourceStart: string, sourceEnd: string,
  targetStart: string, targetEnd: string,
): number {
  const ss = parseMonthYear(sourceStart);
  const se = parseMonthYear(sourceEnd) ?? { year: 2099, month: 12 }; // "Present"
  const ts = parseMonthYear(targetStart);
  const te = parseMonthYear(targetEnd) ?? { year: 2099, month: 12 };
  if (!ss || !ts) return 0.5; // can't determine, assume partial

  const sStart = monthsSinceEpoch(ss);
  const sEnd = monthsSinceEpoch(se);
  const tStart = monthsSinceEpoch(ts);
  const tEnd = monthsSinceEpoch(te);

  const overlapStart = Math.max(sStart, tStart);
  const overlapEnd = Math.min(sEnd, tEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const totalSpan = Math.max(sEnd, tEnd) - Math.min(sStart, tStart);
  if (totalSpan === 0) return 1;
  return overlap / totalSpan;
}

// ---------------------------------------------------------------------------
// Per-section similarity scoring
// ---------------------------------------------------------------------------

function workSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const companyScore = levenshteinRatio(source.name ?? "", target.name ?? "");
  const positionScore = levenshteinRatio(source.position ?? "", target.position ?? "");
  const dateScore = computeDateOverlap(
    source.startDate ?? "", source.endDate ?? "",
    target.startDate ?? "", target.endDate ?? "",
  );
  let score = companyScore * 0.5 + positionScore * 0.3 + dateScore * 0.2;
  // Bonus for exact company match
  if (normalizeString(source.name ?? "") === normalizeString(target.name ?? "") &&
      normalizeString(source.name ?? "").length > 0) {
    score = Math.min(1.0, score + 0.15);
  }
  return score;
}

function educationSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const instScore = levenshteinRatio(source.institution ?? "", target.institution ?? "");
  const areaScore = levenshteinRatio(source.area ?? "", target.area ?? "");
  return instScore * 0.6 + areaScore * 0.4;
}

function skillSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const nameScore = levenshteinRatio(source.name ?? "", target.name ?? "");
  const sourceKw = Array.isArray(source.keywords) ? source.keywords : [];
  const targetKw = Array.isArray(target.keywords) ? target.keywords : [];
  // No keyword signal on either side — fall back to pure name match.
  // `jaccardSimilarity([], [])` returns 1 ("both empty = identical sets"),
  // which would falsely inflate every skill comparison by 0.3 and produce
  // positional pairings like "BlockChain" ↔ "Communication".
  if (sourceKw.length === 0 && targetKw.length === 0) {
    return nameScore;
  }
  const kwScore = jaccardSimilarity(sourceKw, targetKw);
  return nameScore * 0.7 + kwScore * 0.3;
}

function projectSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const nameScore = levenshteinRatio(source.name ?? "", target.name ?? "");
  const sourceKw = Array.isArray(source.keywords) ? source.keywords : [];
  const targetKw = Array.isArray(target.keywords) ? target.keywords : [];
  if (sourceKw.length === 0 && targetKw.length === 0) {
    return nameScore;
  }
  const kwScore = jaccardSimilarity(sourceKw, targetKw);
  return nameScore * 0.6 + kwScore * 0.4;
}

function volunteerSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const orgScore = levenshteinRatio(source.organization ?? "", target.organization ?? "");
  const posScore = levenshteinRatio(source.position ?? "", target.position ?? "");
  return orgScore * 0.6 + posScore * 0.4;
}

function nameSimilarity(source: Record<string, any>, target: Record<string, any>, field: string): number {
  return levenshteinRatio(source[field] ?? "", target[field] ?? "");
}

export function computeSectionSimilarity(
  sectionType: MergeSectionType,
  source: Record<string, any>,
  target: Record<string, any>,
): number {
  switch (sectionType) {
    case "work": return workSimilarity(source, target);
    case "education": return educationSimilarity(source, target);
    case "skills": return skillSimilarity(source, target);
    case "projects": return projectSimilarity(source, target);
    case "volunteer": return volunteerSimilarity(source, target);
    case "awards": return nameSimilarity(source, target, "title");
    case "certificates": return nameSimilarity(source, target, "name");
    case "publications": return nameSimilarity(source, target, "name");
    case "languages": return nameSimilarity(source, target, "language");
    case "interests": return nameSimilarity(source, target, "name");
    case "references": return nameSimilarity(source, target, "name");
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

export function mergeHighlights(source: string[], target: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...(target ?? []), ...(source ?? [])]) {
    const key = normalizeString(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function mergeKeywords(source: string[], target: string[]): string[] {
  return mergeHighlights(source, target); // same dedup logic
}

/** Diff two string-arrays by normalised text. */
function diffStringArray(source: unknown, target: unknown): ArrayDiff {
  const s = Array.isArray(source) ? source : [];
  const t = Array.isArray(target) ? target : [];
  const sNorm = new Set(s.map(normalizeString).filter(Boolean));
  const tNorm = new Set(t.map(normalizeString).filter(Boolean));
  let shared = 0, onlyInSource = 0, onlyInTarget = 0;
  for (const n of sNorm) {
    if (tNorm.has(n)) shared++;
    else onlyInSource++;
  }
  for (const n of tNorm) {
    if (!sNorm.has(n)) onlyInTarget++;
  }
  return { onlyInSource, onlyInTarget, shared };
}

/** Backwards-compatible export — delegates to the broader diffStringArray. */
export function computeHighlightDiff(
  sourceItem: Record<string, any> | null | undefined,
  targetItem: Record<string, any> | null | undefined,
): ArrayDiff {
  return diffStringArray(sourceItem?.highlights, targetItem?.highlights);
}

/** Scalar fields to check per section type. These are fields where both
 *  sides may hold meaningful values that differ — the merger would
 *  otherwise silently keep target's value, hiding the divergence. */
const SCALAR_FIELDS_BY_SECTION: Record<string, string[]> = {
  work:         ["startDate", "endDate", "summary", "url", "position", "name", "employmentType", "locationType"],
  volunteer:    ["startDate", "endDate", "summary", "url", "position", "organization"],
  education:    ["startDate", "endDate", "score", "url", "area", "studyType", "institution"],
  projects:     ["startDate", "endDate", "description", "url", "entity", "type", "name"],
  awards:       ["date", "summary", "awarder", "title"],
  certificates: ["date", "url", "issuer", "name"],
  publications: ["releaseDate", "summary", "url", "publisher", "name"],
  languages:    ["fluency", "language"],
  interests:    ["name"],
  references:   ["reference", "name"],
  skills:       ["level", "name"],
};

/** Array fields (besides `highlights`) to diff per section type. */
const ARRAY_FIELDS_BY_SECTION: Record<string, { highlights?: string; courses?: string; keywords?: string; roles?: string }> = {
  work:      { highlights: "highlights" },
  volunteer: { highlights: "highlights" },
  projects:  { highlights: "highlights", keywords: "keywords", roles: "roles" },
  education: { courses: "courses" },
  skills:    { keywords: "keywords" },
  interests: { keywords: "keywords" },
};

/**
 * Detect ALL meaningful differences between two identity-matched entries:
 *   - bullet lists (highlights, courses, roles)
 *   - keyword lists
 *   - scalar fields (dates, summary, url, description, etc.) that hold
 *     different non-empty values on each side
 *
 * Returns shape that the UI uses to: (a) decide whether to show the
 * "Content differs" badge, (b) show count breakdowns, and (c) show
 * per-field before/after pairs so the user can choose which value wins.
 */
export function computeContentDiff(
  sectionType: string,
  sourceItem: Record<string, any> | null | undefined,
  targetItem: Record<string, any> | null | undefined,
): { highlightDiff?: ArrayDiff; keywordDiff?: ArrayDiff; scalarDiffs: ScalarFieldDiffs; hasDifferences: boolean } {
  const s = sourceItem ?? {};
  const t = targetItem ?? {};
  const arrayMap = ARRAY_FIELDS_BY_SECTION[sectionType] ?? {};

  // Highlights / courses / roles all map to the "highlightDiff" surface
  // since the UI treats them as the same picker control.
  const highlightField = arrayMap.highlights ?? arrayMap.courses ?? arrayMap.roles;
  const highlightDiffRaw = highlightField ? diffStringArray(s[highlightField], t[highlightField]) : undefined;
  const highlightDiff = highlightDiffRaw && (highlightDiffRaw.onlyInSource > 0 || highlightDiffRaw.onlyInTarget > 0)
    ? highlightDiffRaw
    : undefined;

  // Keywords surface separately so the UI can render them as a tag cloud
  const keywordDiffRaw = arrayMap.keywords ? diffStringArray(s[arrayMap.keywords], t[arrayMap.keywords]) : undefined;
  const keywordDiff = keywordDiffRaw && (keywordDiffRaw.onlyInSource > 0 || keywordDiffRaw.onlyInTarget > 0)
    ? keywordDiffRaw
    : undefined;

  // Scalar fields: only report when BOTH sides have non-empty values
  // AND they disagree. If one side is empty, the merger fills it in
  // silently — that's not a "difference" the user needs to arbitrate.
  const scalarDiffs: ScalarFieldDiffs = {};
  const scalarFields = SCALAR_FIELDS_BY_SECTION[sectionType] ?? [];
  for (const field of scalarFields) {
    const sv = typeof s[field] === "string" ? s[field].trim() : "";
    const tv = typeof t[field] === "string" ? t[field].trim() : "";
    if (!sv || !tv) continue;
    if (normalizeString(sv) === normalizeString(tv)) continue;
    scalarDiffs[field] = { source: sv, target: tv };
  }

  const hasDifferences =
    !!highlightDiff || !!keywordDiff || Object.keys(scalarDiffs).length > 0;

  return { highlightDiff, keywordDiff, scalarDiffs, hasDifferences };
}

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------

const SECTION_KEYS: MergeSectionType[] = [
  "work", "education", "skills", "volunteer", "awards",
  "certificates", "publications", "languages", "interests",
  "references", "projects",
];

const AUTO_THRESHOLD = 0.8;
const MANUAL_THRESHOLD = 0.4;

function classifyAction(confidence: number): "auto" | "manual" | "skip" {
  if (confidence >= AUTO_THRESHOLD) return "auto";
  if (confidence >= MANUAL_THRESHOLD) return "manual";
  return "skip";
}

function analyzeBasics(
  sourceBasics: Record<string, any> | null,
  targetBasics: Record<string, any> | null,
): MergeAnalysis["basics"] {
  if (!sourceBasics) return { conflicts: [], autoMerge: true };
  if (!targetBasics) return { conflicts: [], autoMerge: true };

  const BASIC_FIELDS = ["name", "label", "email", "phone", "url", "summary", "image"];
  const conflicts: BasicsConflict[] = [];

  for (const field of BASIC_FIELDS) {
    const sv = (sourceBasics[field] ?? "").toString().trim();
    const tv = (targetBasics[field] ?? "").toString().trim();
    if (sv && tv && sv !== tv) {
      conflicts.push({ field, sourceValue: sv, targetValue: tv });
    }
  }

  return { conflicts, autoMerge: conflicts.length === 0 };
}

/** Identity field per section — used to spot when the same record was
 *  parsed into the wrong section (e.g. a work entry mis-stuck in volunteer). */
const IDENTITY_FIELD: Record<string, string> = {
  work: "name",
  volunteer: "organization",
  education: "institution",
  projects: "name",
};

/**
 * Detect when a SOURCE entry's identity also appears in a different
 * section of the same source resume. Returns a map keyed by
 * "sectionType:sourceIndex" -> conflict details. Almost always means
 * the parser misclassified an entry; the UI surfaces this as a warning
 * and defaults to skip so bad data doesn't ride along into the merge.
 *
 * Currently checks volunteer↔work and projects↔work — the most common
 * misclassification axes. Easy to extend if more cross-checks are
 * needed in future.
 */
function detectCrossSectionConflicts(
  sourceContent: Record<string, any>,
): Map<string, { suggestedSection: string; reason: string }> {
  const conflicts = new Map<string, { suggestedSection: string; reason: string }>();
  const work: Record<string, any>[] = Array.isArray(sourceContent.work) ? sourceContent.work : [];
  if (work.length === 0) return conflicts;

  // Normalised work company names with the original entry for the reason
  const workIndex = new Map<string, { idx: number; entry: Record<string, any> }>();
  work.forEach((w, idx) => {
    const norm = normalizeString(typeof w?.name === "string" ? w.name : "");
    if (norm) workIndex.set(norm, { idx, entry: w });
  });

  const checkAgainstWork = (sectionType: string, items: Record<string, any>[]) => {
    const idField = IDENTITY_FIELD[sectionType];
    if (!idField) return;
    items.forEach((item, sourceIndex) => {
      const norm = normalizeString(typeof item?.[idField] === "string" ? item[idField] : "");
      if (!norm) return;
      const hit = workIndex.get(norm);
      if (!hit) return;
      const role = typeof hit.entry.position === "string" ? hit.entry.position : "";
      const company = typeof hit.entry.name === "string" ? hit.entry.name : norm;
      conflicts.set(`${sectionType}:${sourceIndex}`, {
        suggestedSection: "work",
        reason: role
          ? `Also appears in Work as "${role} at ${company}" — likely a parser misclassification.`
          : `Also appears in Work under "${company}" — likely a parser misclassification.`,
      });
    });
  };

  if (Array.isArray(sourceContent.volunteer)) {
    checkAgainstWork("volunteer", sourceContent.volunteer);
  }
  if (Array.isArray(sourceContent.projects)) {
    checkAgainstWork("projects", sourceContent.projects);
  }
  return conflicts;
}

function analyzeSections(
  sourceContent: Record<string, any>,
  targetContent: Record<string, any>,
): { matches: SectionMatch[]; newSections: MergeAnalysis["newSections"] } {
  const matches: SectionMatch[] = [];
  const newSections: MergeAnalysis["newSections"] = [];

  // Pre-compute cross-section identity collisions in the source. These
  // are reported on every match/new-item the offending entry produces.
  const crossSection = detectCrossSectionConflicts(sourceContent);

  for (const sectionType of SECTION_KEYS) {
    const sourceArr: Record<string, any>[] = sourceContent[sectionType] ?? [];
    const targetArr: Record<string, any>[] = targetContent[sectionType] ?? [];

    if (!Array.isArray(sourceArr) || sourceArr.length === 0) continue;

    // Track which target items have been claimed by a source match
    const claimedTargets = new Set<number>();

    for (let si = 0; si < sourceArr.length; si++) {
      const conflict = crossSection.get(`${sectionType}:${si}`);

      let bestScore = 0;
      let bestTi: number | null = null;

      for (let ti = 0; ti < targetArr.length; ti++) {
        if (claimedTargets.has(ti)) continue;
        const score = computeSectionSimilarity(sectionType, sourceArr[si], targetArr[ti]);
        if (score > bestScore) {
          bestScore = score;
          bestTi = ti;
        }
      }

      if (bestTi !== null && bestScore >= MANUAL_THRESHOLD) {
        claimedTargets.add(bestTi);
        const diff = computeContentDiff(sectionType, sourceArr[si], targetArr[bestTi]);
        matches.push({
          sectionType,
          sourceIndex: si,
          targetIndex: bestTi,
          confidence: bestScore,
          matchReason: `Similarity ${(bestScore * 100).toFixed(0)}%`,
          // Force skip for cross-section conflicts so misclassified data
          // doesn't ride along into the merge by default.
          mergeAction: conflict ? "skip" : classifyAction(bestScore),
          hasContentDifferences: diff.hasDifferences,
          highlightDiff: diff.highlightDiff,
          keywordDiff: diff.keywordDiff,
          scalarDiffs: Object.keys(diff.scalarDiffs).length > 0 ? diff.scalarDiffs : undefined,
          crossSectionConflict: conflict,
        });
      } else if (bestTi !== null && bestScore > 0.1) {
        // Low confidence — still record but mark skip
        matches.push({
          sectionType,
          sourceIndex: si,
          targetIndex: bestTi,
          confidence: bestScore,
          matchReason: `Low similarity ${(bestScore * 100).toFixed(0)}%`,
          mergeAction: "skip",
          crossSectionConflict: conflict,
        });
      } else {
        // No match — new item
        newSections.push({
          sectionType,
          sourceIndex: si,
          item: sourceArr[si],
          crossSectionConflict: conflict,
        });
      }
    }
  }

  return { matches, newSections };
}

export async function analyzeMerge(
  sourceContent: Record<string, any>,
  targetContent: Record<string, any>,
  llm?: LLMClient | null,
  featureKey = "resume_merge_refine",
): Promise<MergeAnalysis> {
  // Normalise BOTH sides to canonical lowercase keys before comparing —
  // otherwise `source.name` vs `target.Name` both read undefined and
  // every entry looks "new" even when re-uploading identical content.
  const source = normalizeContentForMerge(sourceContent);
  const target = normalizeContentForMerge(targetContent);

  const basics = analyzeBasics(source.basics, target.basics);
  const { matches, newSections } = analyzeSections(source, target);

  // Refine any non-trivial matches with AI — the user's workflow is to
  // re-upload their own resume, so most matches are actually identical.
  // Heuristic above 0.95 is already safe (exact company+position+dates);
  // below 0.95 but above 0.3 is where AI confirmation earns its keep.
  if (llm) {
    const ambiguous = matches.filter((m) => m.confidence >= 0.3 && m.confidence < 0.95);
    if (ambiguous.length > 0) {
      try {
        const refined = await refineMatchesWithAI(ambiguous, source, target, llm, featureKey);
        for (const r of refined) {
          const idx = matches.findIndex(
            (m) => m.sectionType === r.sectionType && m.sourceIndex === r.sourceIndex && m.targetIndex === r.targetIndex,
          );
          if (idx !== -1) {
            matches[idx].confidence = r.confidence;
            matches[idx].matchReason = r.reasoning;
            matches[idx].mergeAction = classifyAction(r.confidence);
          }
        }
      } catch {
        // AI unavailable — keep deterministic scores
      }
    }
  }

  const summary = {
    totalSections: matches.length + newSections.length,
    autoMerge: matches.filter((m) => m.mergeAction === "auto").length,
    manualReview: matches.filter((m) => m.mergeAction === "manual").length,
    skip: matches.filter((m) => m.mergeAction === "skip").length,
    newItems: newSections.length,
  };

  return { basics, sectionMatches: matches, newSections, summary };
}

// ---------------------------------------------------------------------------
// AI refinement
// ---------------------------------------------------------------------------

const AiMatchResultSchema = z.object({
  matches: z.array(z.object({
    sectionType: z.string(),
    sourceIndex: z.number(),
    targetIndex: z.number(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
});

async function refineMatchesWithAI(
  ambiguousMatches: SectionMatch[],
  sourceContent: Record<string, any>,
  targetContent: Record<string, any>,
  llm: LLMClient,
  featureKey: string,
): Promise<Array<{ sectionType: string; sourceIndex: number; targetIndex: number; confidence: number; reasoning: string }>> {
  // Strip items down to the identity-relevant fields only. Highlights
  // vary between versions of the same role; sending them wastes tokens
  // and can confuse the matcher. Keep company/position/dates for work
  // and volunteer, institution/area/dates for education, name+keywords
  // for skills/projects.
  const identityFieldsFor = (sectionType: string, item: any) => {
    if (!item || typeof item !== "object") return item;
    switch (sectionType) {
      case "work":
        return { name: item.name, position: item.position, startDate: item.startDate, endDate: item.endDate };
      case "volunteer":
        return { organization: item.organization, position: item.position, startDate: item.startDate, endDate: item.endDate };
      case "education":
        return { institution: item.institution, area: item.area, studyType: item.studyType, startDate: item.startDate, endDate: item.endDate };
      case "projects":
        return { name: item.name, startDate: item.startDate, endDate: item.endDate };
      case "skills":
      case "interests":
        return { name: item.name };
      case "awards":
        return { title: item.title, date: item.date, awarder: item.awarder };
      case "certificates":
        return { name: item.name, issuer: item.issuer, date: item.date };
      case "publications":
        return { name: item.name, publisher: item.publisher, releaseDate: item.releaseDate };
      case "languages":
        return { language: item.language };
      case "references":
        return { name: item.name };
      default:
        return item;
    }
  };

  const pairs = ambiguousMatches.map((m) => ({
    sectionType: m.sectionType,
    sourceIndex: m.sourceIndex,
    targetIndex: m.targetIndex!,
    sourceItem: identityFieldsFor(m.sectionType, (sourceContent[m.sectionType] ?? [])[m.sourceIndex]),
    targetItem: identityFieldsFor(m.sectionType, (targetContent[m.sectionType] ?? [])[m.targetIndex!]),
  }));

  const { data: result } = await llm.callJson(
    featureKey,
    {
      systemPrompt: [
        "You are an identity matcher for resume entries. For each pair, decide whether the source and target represent the SAME underlying record (same job, same education, same skill, etc.), not whether their content is identical.",
        "",
        "RULES:",
        "  - Work: same role at the same company is a MATCH even if titles are rephrased ('Senior Dev' vs 'Sr. Developer'), company has suffix differences ('Acme Inc' vs 'Acme Corporation'), or date formats differ. Different roles at the same company are NOT a match.",
        "  - Volunteer: same role at the same organization is a MATCH. Different organizations are NOT.",
        "  - Education: same degree at the same institution is a MATCH. 'Bachelor of Science in Psychology' and 'Bachelor in Psychology' match. Two different degrees at the same institution (e.g. B.S. Computer Science vs B.S. Psychology) are SEPARATE entries, not a match.",
        "  - Skills / Languages / Interests: same name (case-insensitive, ignoring minor typos) is a MATCH.",
        "  - Certificates / Publications / Awards: same title/name + same issuer/publisher/awarder is a MATCH.",
        "",
        "CONFIDENCE:",
        "  - 1.0 = definitely the same record (identical or near-identical identity fields)",
        "  - 0.85-0.95 = very likely same (normalised names match, dates overlap)",
        "  - 0.5-0.85 = possibly same (some fields match, others ambiguous)",
        "  - < 0.5 = probably different records",
        "",
        'Return ONLY a JSON object with shape: { "matches": [{ "sectionType": "", "sourceIndex": 0, "targetIndex": 0, "confidence": 0.0, "reasoning": "short explanation" }] }',
      ].join("\n"),
      userMessage: JSON.stringify(pairs.map((p) => ({
        sectionType: p.sectionType,
        sourceIndex: p.sourceIndex,
        targetIndex: p.targetIndex,
        source: p.sourceItem,
        target: p.targetItem,
      }))),
      responseFormat: "json_object",
      useCase: "resume_merge",
    },
    AiMatchResultSchema,
  );

  return result.matches;
}

// ---------------------------------------------------------------------------
// Execute merge
// ---------------------------------------------------------------------------

function mergeBasics(
  source: Record<string, any> | null,
  target: Record<string, any> | null,
  basicDecisions?: Record<string, "source" | "target">,
): Record<string, any> {
  if (!target) return { ...(source ?? {}) };
  if (!source) return { ...target };

  const merged = { ...target };
  const FIELDS = ["name", "label", "email", "phone", "url", "summary", "image"];

  for (const field of FIELDS) {
    const sv = (source[field] ?? "").toString().trim();
    const tv = (target[field] ?? "").toString().trim();
    if (!tv && sv) {
      merged[field] = sv;
    } else if (basicDecisions?.[field] === "source") {
      merged[field] = sv;
    }
    // else keep target
  }

  // Location: merge field-by-field, prefer non-empty
  if (source.location || target.location) {
    const sl = source.location ?? {};
    const tl = target.location ?? {};
    merged.location = { ...tl };
    for (const k of ["address", "city", "region", "postalCode", "countryCode"]) {
      if (!tl[k] && sl[k]) merged.location[k] = sl[k];
    }
  }

  return merged;
}

function mergeSingleItem(
  source: Record<string, any>,
  target: Record<string, any>,
  sectionType: MergeSectionType,
  hlMode: "combine" | "source_only" | "target_only" = "combine",
  selectedHighlights?: string[],
  scalarChoices?: Record<string, "source" | "target">,
): Record<string, any> {
  const merged = { ...target };

  // Merge array fields based on section type
  const arrayFields: string[] = [];
  if (sectionType === "work" || sectionType === "volunteer") arrayFields.push("highlights");
  if (sectionType === "skills") arrayFields.push("keywords");
  if (sectionType === "projects") arrayFields.push("highlights", "keywords", "roles");
  if (sectionType === "education") arrayFields.push("courses");
  if (sectionType === "interests") arrayFields.push("keywords");

  // When the user has picked exact highlights via checkboxes, that wins
  // over the coarse hlMode. Only applies to the `highlights` field; other
  // array fields (keywords, courses, roles) still follow hlMode.
  const hasExplicitHighlights = Array.isArray(selectedHighlights);

  for (const field of arrayFields) {
    if (field === "highlights" && hasExplicitHighlights) {
      merged[field] = selectedHighlights as string[];
      continue;
    }
    if (field === "highlights" || field === "keywords" || field === "courses" || field === "roles") {
      if (hlMode === "combine") {
        merged[field] = mergeHighlights(source[field] ?? [], target[field] ?? []);
      } else if (hlMode === "source_only") {
        merged[field] = source[field] ?? [];
      }
      // target_only = keep target[field] unchanged
    }
  }

  // Scalar fields. Default rule: fill empty target fields from source;
  // keep target's non-empty value otherwise. `scalarChoices` lets the
  // user override — "source" always takes source's value, "target"
  // always keeps target's.
  const scalarFields = ["url", "name", "position", "institution", "area", "studyType",
    "score", "title", "date", "awarder", "issuer", "publisher", "releaseDate",
    "language", "fluency", "description", "entity", "type", "organization",
    "startDate", "endDate", "level", "reference", "summary",
    "employmentType", "locationType"];
  for (const field of scalarFields) {
    const choice = scalarChoices?.[field];
    if (choice === "source" && source[field]) {
      merged[field] = source[field];
      continue;
    }
    if (choice === "target") {
      // explicit keep-target — no-op, merged already holds target value
      continue;
    }
    if (!merged[field] && source[field]) {
      merged[field] = source[field];
      continue;
    }
    // Default: prefer the longer summary when both are non-empty (old behaviour)
    if (field === "summary" && source[field] && target[field]) {
      if ((source[field] ?? "").length > (target[field] ?? "").length) {
        merged[field] = source[field];
      }
    }
  }

  return merged;
}

export function executeMerge(
  targetContent: Record<string, any>,
  sourceContent: Record<string, any>,
  decisions: MergeDecision[],
  basicDecisions?: Record<string, "source" | "target">,
): Record<string, any> {
  // Normalise both sides to canonical lowercase keys. The merged output
  // is therefore canonical too — progressively migrates any lingering
  // PascalCase content in storage to the lowercase JSON Resume shape.
  const source = normalizeContentForMerge(sourceContent);
  const target = normalizeContentForMerge(targetContent);

  const result: Record<string, any> = { ...target };

  // Merge basics
  result.basics = mergeBasics(source.basics, target.basics, basicDecisions);

  // Group decisions by section type (normalise section keys too, in
  // case a client still sends PascalCase section names)
  const bySectionType = new Map<string, MergeDecision[]>();
  for (const d of decisions) {
    const sectionKey = (d.sectionType || "").toLowerCase();
    const arr = bySectionType.get(sectionKey) ?? [];
    arr.push({ ...d, sectionType: sectionKey });
    bySectionType.set(sectionKey, arr);
  }

  for (const sectionType of SECTION_KEYS) {
    const sectionDecisions = bySectionType.get(sectionType) ?? [];
    if (sectionDecisions.length === 0) continue;

    const sourceArr: Record<string, any>[] = source[sectionType] ?? [];
    const targetArr: Record<string, any>[] = [...(target[sectionType] ?? [])];

    // Apply decisions that modify existing target items (merge/replace)
    for (const d of sectionDecisions) {
      if (d.action === "skip") continue;

      const sourceItem = sourceArr[d.sourceIndex];
      if (!sourceItem) continue;

      if (d.action === "merge" && d.targetIndex !== null && d.targetIndex < targetArr.length) {
        targetArr[d.targetIndex] = mergeSingleItem(
          sourceItem, targetArr[d.targetIndex], sectionType as MergeSectionType,
          d.mergeHighlights ?? "combine",
          d.selectedHighlights,
          d.scalarChoices,
        );
      } else if (d.action === "replace" && d.targetIndex !== null && d.targetIndex < targetArr.length) {
        targetArr[d.targetIndex] = { ...sourceItem };
      } else if (d.action === "add") {
        targetArr.push({ ...sourceItem });
      }
    }

    result[sectionType] = targetArr;
  }

  // Preserve meta if present
  if (target.meta) result.meta = { ...target.meta, lastModified: new Date().toISOString() };

  return result;
}
