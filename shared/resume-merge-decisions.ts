/**
 * Résumé merge — the analysis shape the merge endpoints return, and the pure
 * decision builders every merge surface starts from (the web résumé-list
 * merge dialog, the kit's on-page merge, the Chrome extension's profile
 * import). One source, so the surfaces can't drift. Pure: no React, no i18n.
 *
 *   matches     auto + manual → merge (bullets combined), weak → skip
 *   new items   included, EXCEPT a likely-misclassified one (a "volunteer"
 *               row that is really one of your jobs) starts excluded
 *   basics      the target's value wins until the person picks
 *
 * The analysis is produced by api/src/services/resume/merge.ts (analyzeMerge),
 * which imports these types from here.
 */
import type { MergeSectionType } from "./resume.js";

export type { MergeSectionType };

/** Counts of items that appear only in source, only in target, or in both —
 *  used for highlight bullets and array-of-strings fields like `courses`. */
export interface ArrayDiff {
  onlyInSource: number;
  onlyInTarget: number;
  shared: number;
}

/** Fields that differ between two identity-matched entries (source first,
 *  target second). Empty when the field matches. */
export type ScalarFieldDiffs = Record<string, { source: string; target: string }>;

/** The SOURCE entry's identity also appears in a different section of the
 *  same source résumé — almost always a parser misclassification. */
export interface CrossSectionConflict {
  suggestedSection: string;
  /** Human-readable reason ("Also appears in Work as 'VP at Acme'"). */
  reason: string;
}

export interface SectionMatch {
  sectionType: MergeSectionType;
  sourceIndex: number;
  targetIndex: number | null;
  confidence: number;
  matchReason: string;
  mergeAction: "auto" | "manual" | "skip";
  /** Same record (identity matched) but meaningful content differs. */
  hasContentDifferences?: boolean;
  /** Bullet-level diff (work/volunteer/projects highlights, education courses). */
  highlightDiff?: ArrayDiff;
  /** Keyword-level diff for projects/skills/interests. */
  keywordDiff?: ArrayDiff;
  /** Which scalar fields (dates, summary, url, …) differ. */
  scalarDiffs?: ScalarFieldDiffs;
  crossSectionConflict?: CrossSectionConflict;
}

export interface BasicsConflict {
  field: string;
  sourceValue: string;
  targetValue: string;
}

export interface MergeNewItem {
  sectionType: MergeSectionType;
  sourceIndex: number;
  item: Record<string, unknown>;
  crossSectionConflict?: CrossSectionConflict;
}

export interface MergeAnalysis {
  basics: {
    conflicts: BasicsConflict[];
    autoMerge: boolean;
  };
  sectionMatches: SectionMatch[];
  newSections: MergeNewItem[];
  summary: {
    totalSections: number;
    autoMerge: number;
    manualReview: number;
    skip: number;
    newItems: number;
  };
}

export type MergeAction = "merge" | "replace" | "skip" | "add";

export interface MergeDecision {
  sectionType: string;
  sourceIndex: number;
  targetIndex: number | null;
  action: MergeAction;
  mergeHighlights?: "combine" | "source_only" | "target_only";
  /** Exact highlight strings to keep, overriding `mergeHighlights`. */
  selectedHighlights?: string[];
  /** Per-field picks for scalar values that differ between source and target. */
  scalarChoices?: Record<string, "source" | "target">;
}

export type BasicDecisions = Record<string, "source" | "target">;

export function buildDecisions(a: MergeAnalysis): MergeDecision[] {
  return a.sectionMatches.map((m) => ({
    sectionType: m.sectionType,
    sourceIndex: m.sourceIndex,
    targetIndex: m.targetIndex,
    action: m.mergeAction === "skip" ? ("skip" as const) : ("merge" as const),
    mergeHighlights: "combine" as const,
  }));
}

/** Every basics conflict starts on the target's (my) value. */
export function buildBasicDecisions(a: MergeAnalysis): BasicDecisions {
  return Object.fromEntries(a.basics.conflicts.map((c) => [c.field, "target" as const]));
}

export const newItemKey = (sectionType: string, sourceIndex: number) => `${sectionType}:${sourceIndex}`;

export function buildNewItemDecisions(a: MergeAnalysis): Map<string, boolean> {
  return new Map(a.newSections.map((item) => [newItemKey(item.sectionType, item.sourceIndex), !item.crossSectionConflict]));
}

/** Matches + every included new item as an "add" — what preview and
 *  execute receive, built in one place so they can't disagree. */
export function buildFinalDecisions(decisions: readonly MergeDecision[], newItems: ReadonlyMap<string, boolean>): MergeDecision[] {
  const all: MergeDecision[] = [...decisions];
  for (const [key, included] of newItems) {
    if (!included) continue;
    const [sectionType, index] = key.split(":");
    all.push({ sectionType, sourceIndex: Number(index), targetIndex: null, action: "add" });
  }
  return all;
}

/**
 * Where each "add" lands in the merged document: the engine keeps the
 * target's entries in place and appends adds in decision order, so the n-th
 * add of a section sits at `targetLength + n`. Keyed by newItemKey.
 */
export function addedEntryPaths(
  finalDecisions: readonly MergeDecision[],
  target: Record<string, unknown>,
): Map<string, string> {
  const next = new Map<string, number>();
  const out = new Map<string, string>();
  for (const d of finalDecisions) {
    if (d.action !== "add") continue;
    const base = Array.isArray(target[d.sectionType]) ? (target[d.sectionType] as unknown[]).length : 0;
    const n = next.get(d.sectionType) ?? 0;
    next.set(d.sectionType, n + 1);
    out.set(newItemKey(d.sectionType, d.sourceIndex), `${d.sectionType}.${base + n}`);
  }
  return out;
}
