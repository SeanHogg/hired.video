/**
 * Merge decisions — the pure defaults every merge surface starts from and
 * the request the merge endpoints take. One source, so the résumé-list
 * merge dialog and the kit's on-page merge can't drift.
 *
 *   matches     auto + manual → merge (bullets combined), weak → skip
 *   new items   included, EXCEPT a likely-misclassified one (a "volunteer"
 *               row that is really one of your jobs) starts excluded
 *   basics      the target's value wins until the person picks
 */
import type { MergeAnalysis, MergeDecision } from "@/types/resume";

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
