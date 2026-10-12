/**
 * useBulletSelection — which bullets of a matched entry survive a merge.
 *
 * Bullets are compared normalised (shared normalizeText), so the same
 * accomplishment worded with different spacing/case counts once. The
 * selection lives on the merge decision (`selectedHighlights`); with none
 * set it follows the decision's `mergeHighlights` mode (default: keep both
 * sides). Committed lists keep the master's order, then the new file's
 * additions.
 */
import { useCallback, useMemo } from "react";
import { normalizeText } from "@shared/resume-path";
import type { MergeDecision } from "@/types/resume";

export type BulletOrigin = "both" | "source" | "target";

export interface BulletItem {
  key: string;
  text: string;
  origin: BulletOrigin;
}

/** Every distinct bullet of both sides, target first, tagged by origin. */
export function bulletCatalog(source: readonly string[], target: readonly string[]): BulletItem[] {
  const inSource = new Set(source.map(normalizeText));
  const items: BulletItem[] = [];
  const seen = new Set<string>();
  for (const text of target) {
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, text, origin: inSource.has(key) ? "both" : "target" });
  }
  for (const text of source) {
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, text, origin: "source" });
  }
  return items;
}

export function useBulletSelection(
  source: readonly string[],
  target: readonly string[],
  decision: MergeDecision,
  onDecisionChange: (d: MergeDecision) => void,
) {
  const items = useMemo(() => bulletCatalog(source, target), [source, target]);

  const selected = useMemo(() => {
    if (decision.selectedHighlights) return new Set(decision.selectedHighlights.map(normalizeText));
    const mode = decision.mergeHighlights ?? "combine";
    if (mode === "source_only") return new Set(source.map(normalizeText));
    if (mode === "target_only") return new Set(target.map(normalizeText));
    return new Set(items.map((i) => i.key));
  }, [decision.selectedHighlights, decision.mergeHighlights, source, target, items]);

  const commit = useCallback(
    (keys: Set<string>) =>
      onDecisionChange({ ...decision, selectedHighlights: items.filter((i) => keys.has(i.key)).map((i) => i.text) }),
    [decision, items, onDecisionChange],
  );

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      commit(next);
    },
    [selected, commit],
  );

  const selectAll = useCallback(
    () => onDecisionChange({ ...decision, mergeHighlights: "combine", selectedHighlights: items.map((i) => i.text) }),
    [decision, items, onDecisionChange],
  );
  const clear = useCallback(() => onDecisionChange({ ...decision, selectedHighlights: [] }), [decision, onDecisionChange]);
  const reset = useCallback(() => {
    const { selectedHighlights: _dropped, ...rest } = decision;
    void _dropped;
    onDecisionChange({ ...rest, mergeHighlights: "combine" });
  }, [decision, onDecisionChange]);
  /** Replace the selection with a rewritten list (AI consolidate). */
  const replaceWith = useCallback(
    (bullets: string[]) => onDecisionChange({ ...decision, selectedHighlights: bullets }),
    [decision, onDecisionChange],
  );

  const selectedTexts = useMemo(() => items.filter((i) => selected.has(i.key)).map((i) => i.text), [items, selected]);

  return { items, selected, selectedTexts, toggle, selectAll, clear, reset, replaceWith };
}
