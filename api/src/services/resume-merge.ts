/**
 * Resume Merge Service
 *
 * Provides section-by-section comparison and merge logic for consolidating
 * multiple resumes. Uses deterministic matching (Levenshtein, Jaccard) with
 * optional AI refinement for ambiguous cases.
 */

import { z } from "zod";
import { callLLMJson, getApiKey } from "./ai.js";
import { normalizeJsonResume } from "./resume-parse.js";

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

export interface SectionMatch {
  sectionType: MergeSectionType;
  sourceIndex: number;
  targetIndex: number | null;
  confidence: number;
  matchReason: string;
  mergeAction: "auto" | "manual" | "skip";
  /** True when source and target represent the same record (identity
   *  matched) but their highlights/summary/URL/etc differ — signals the
   *  UI that the user should review which content to keep even though
   *  the match itself is solid. */
  hasContentDifferences?: boolean;
  /** Counts of bullet-level differences between source and target
   *  highlights. Present only when hasContentDifferences is true. */
  highlightDiff?: {
    onlyInSource: number;
    onlyInTarget: number;
    shared: number;
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
  const kwScore = jaccardSimilarity(source.keywords ?? [], target.keywords ?? []);
  return nameScore * 0.7 + kwScore * 0.3;
}

function projectSimilarity(source: Record<string, any>, target: Record<string, any>): number {
  const nameScore = levenshteinRatio(source.name ?? "", target.name ?? "");
  const kwScore = jaccardSimilarity(source.keywords ?? [], target.keywords ?? []);
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

/**
 * Count how many highlights appear only in source, only in target, or
 * in both (by normalised text). Used during analysis to flag identity-
 * matched entries whose accomplishment bullets differ — the UI surfaces
 * these so the user can decide which bullets survive the merge.
 */
export function computeHighlightDiff(
  sourceItem: Record<string, any> | null | undefined,
  targetItem: Record<string, any> | null | undefined,
): { onlyInSource: number; onlyInTarget: number; shared: number } {
  const sourceHighlights: string[] = Array.isArray(sourceItem?.highlights) ? sourceItem!.highlights : [];
  const targetHighlights: string[] = Array.isArray(targetItem?.highlights) ? targetItem!.highlights : [];
  const sNormalized = new Set(sourceHighlights.map(normalizeString).filter(Boolean));
  const tNormalized = new Set(targetHighlights.map(normalizeString).filter(Boolean));
  let shared = 0;
  let onlyInSource = 0;
  let onlyInTarget = 0;
  for (const n of sNormalized) {
    if (tNormalized.has(n)) shared++;
    else onlyInSource++;
  }
  for (const n of tNormalized) {
    if (!sNormalized.has(n)) onlyInTarget++;
  }
  return { onlyInSource, onlyInTarget, shared };
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

function analyzeSections(
  sourceContent: Record<string, any>,
  targetContent: Record<string, any>,
): { matches: SectionMatch[]; newSections: MergeAnalysis["newSections"] } {
  const matches: SectionMatch[] = [];
  const newSections: MergeAnalysis["newSections"] = [];

  for (const sectionType of SECTION_KEYS) {
    const sourceArr: Record<string, any>[] = sourceContent[sectionType] ?? [];
    const targetArr: Record<string, any>[] = targetContent[sectionType] ?? [];

    if (!Array.isArray(sourceArr) || sourceArr.length === 0) continue;

    // Track which target items have been claimed by a source match
    const claimedTargets = new Set<number>();

    for (let si = 0; si < sourceArr.length; si++) {
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
        const diff = computeHighlightDiff(sourceArr[si], targetArr[bestTi]);
        matches.push({
          sectionType,
          sourceIndex: si,
          targetIndex: bestTi,
          confidence: bestScore,
          matchReason: `Similarity ${(bestScore * 100).toFixed(0)}%`,
          mergeAction: classifyAction(bestScore),
          hasContentDifferences: diff.onlyInSource > 0 || diff.onlyInTarget > 0,
          highlightDiff: diff,
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
        });
      } else {
        // No match — new item
        newSections.push({
          sectionType,
          sourceIndex: si,
          item: sourceArr[si],
        });
      }
    }
  }

  return { matches, newSections };
}

export async function analyzeMerge(
  sourceContent: Record<string, any>,
  targetContent: Record<string, any>,
  apiKey?: string,
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
  if (apiKey) {
    const ambiguous = matches.filter((m) => m.confidence >= 0.3 && m.confidence < 0.95);
    if (ambiguous.length > 0) {
      try {
        const refined = await refineMatchesWithAI(ambiguous, source, target, apiKey);
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
  apiKey: string,
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

  const result = await callLLMJson(
    apiKey,
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
      temperature: 0.1,
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
): Record<string, any> {
  const merged = { ...target };

  // Prefer longer summary
  if ((source.summary ?? "").length > (target.summary ?? "").length) {
    merged.summary = source.summary;
  }

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

  // Fill empty scalar fields from source
  const scalarFields = ["url", "name", "position", "institution", "area", "studyType",
    "score", "title", "date", "awarder", "issuer", "publisher", "releaseDate",
    "language", "fluency", "description", "entity", "type", "organization",
    "startDate", "endDate", "level", "reference"];
  for (const field of scalarFields) {
    if (!merged[field] && source[field]) {
      merged[field] = source[field];
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
