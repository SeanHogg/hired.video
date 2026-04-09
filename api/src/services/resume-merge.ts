/**
 * Resume Merge Service
 *
 * Provides section-by-section comparison and merge logic for consolidating
 * multiple resumes. Uses deterministic matching (Levenshtein, Jaccard) with
 * optional AI refinement for ambiguous cases.
 */

import { z } from "zod";
import { callLLMJson, getApiKey } from "./ai.js";

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
        matches.push({
          sectionType,
          sourceIndex: si,
          targetIndex: bestTi,
          confidence: bestScore,
          matchReason: `Similarity ${(bestScore * 100).toFixed(0)}%`,
          mergeAction: classifyAction(bestScore),
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
  const basics = analyzeBasics(sourceContent.basics, targetContent.basics);
  const { matches, newSections } = analyzeSections(sourceContent, targetContent);

  // Optionally refine ambiguous matches with AI
  if (apiKey) {
    const ambiguous = matches.filter((m) => m.confidence >= 0.3 && m.confidence <= 0.85);
    if (ambiguous.length > 0) {
      try {
        const refined = await refineMatchesWithAI(ambiguous, sourceContent, targetContent, apiKey);
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
  const pairs = ambiguousMatches.map((m) => ({
    sectionType: m.sectionType,
    sourceIndex: m.sourceIndex,
    targetIndex: m.targetIndex!,
    sourceItem: (sourceContent[m.sectionType] ?? [])[m.sourceIndex],
    targetItem: (targetContent[m.sectionType] ?? [])[m.targetIndex!],
  }));

  const result = await callLLMJson(
    apiKey,
    {
      systemPrompt: `You are a resume section matcher. For each pair of resume entries, determine if they represent the same job, education, skill, etc.
Return a JSON object with a "matches" array. Each entry has: sectionType, sourceIndex, targetIndex, confidence (0-1), reasoning (brief explanation).
Confidence guide: 1.0 = definitely same entry, 0.8+ = very likely same, 0.5-0.8 = possibly same, <0.5 = probably different entries.`,
      userMessage: JSON.stringify(pairs.map((p) => ({
        sectionType: p.sectionType,
        sourceIndex: p.sourceIndex,
        targetIndex: p.targetIndex,
        source: p.sourceItem,
        target: p.targetItem,
      }))),
      responseFormat: "json_object",
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

  for (const field of arrayFields) {
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
  const result: Record<string, any> = { ...targetContent };

  // Merge basics
  result.basics = mergeBasics(sourceContent.basics, targetContent.basics, basicDecisions);

  // Group decisions by section type
  const bySectionType = new Map<string, MergeDecision[]>();
  for (const d of decisions) {
    const arr = bySectionType.get(d.sectionType) ?? [];
    arr.push(d);
    bySectionType.set(d.sectionType, arr);
  }

  for (const sectionType of SECTION_KEYS) {
    const sectionDecisions = bySectionType.get(sectionType) ?? [];
    if (sectionDecisions.length === 0) continue;

    const sourceArr: Record<string, any>[] = sourceContent[sectionType] ?? [];
    const targetArr: Record<string, any>[] = [...(targetContent[sectionType] ?? [])];

    // Apply decisions that modify existing target items (merge/replace)
    for (const d of sectionDecisions) {
      if (d.action === "skip") continue;

      const sourceItem = sourceArr[d.sourceIndex];
      if (!sourceItem) continue;

      if (d.action === "merge" && d.targetIndex !== null && d.targetIndex < targetArr.length) {
        targetArr[d.targetIndex] = mergeSingleItem(
          sourceItem, targetArr[d.targetIndex], sectionType as MergeSectionType,
          d.mergeHighlights ?? "combine",
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
  if (targetContent.meta) result.meta = { ...targetContent.meta, lastModified: new Date().toISOString() };

  return result;
}
