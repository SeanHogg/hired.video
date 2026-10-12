/**
 * useMergeDecisions — the person's choices over one merge analysis: per
 * matched entry (action, fields, bullets), per new item (include), per
 * basics conflict (which value). Seeded from merge-decisions.ts defaults
 * whenever a new analysis arrives. Shared by the merge dialog and the kit workspace.
 */
import { useCallback, useMemo, useState } from "react";
import type { MergeAnalysis, MergeDecision } from "@/types/resume";
import {
  buildDecisions,
  buildFinalDecisions,
  buildNewItemDecisions,
  type BasicDecisions,
} from "./merge-decisions";

export function useMergeDecisions(analysis: MergeAnalysis | null) {
  const [seededFor, setSeededFor] = useState<MergeAnalysis | null>(null);
  const [decisions, setDecisions] = useState<MergeDecision[]>([]);
  const [newItems, setNewItems] = useState<Map<string, boolean>>(new Map());
  const [basics, setBasics] = useState<BasicDecisions>({});

  // Re-seed during render when the analysis changes (no effect → no
  // one-frame flash of the previous analysis' decisions).
  if (analysis !== seededFor) {
    setSeededFor(analysis);
    setDecisions(analysis ? buildDecisions(analysis) : []);
    setNewItems(analysis ? buildNewItemDecisions(analysis) : new Map());
    setBasics({});
  }

  const setDecision = useCallback((index: number, d: MergeDecision) => {
    setDecisions((prev) => prev.map((x, i) => (i === index ? d : x)));
  }, []);

  const setNewItem = useCallback((key: string, include: boolean) => {
    setNewItems((prev) => new Map(prev).set(key, include));
  }, []);
  const toggleNewItem = useCallback((key: string) => {
    setNewItems((prev) => new Map(prev).set(key, !prev.get(key)));
  }, []);

  const setBasic = useCallback((field: string, side: "source" | "target") => {
    setBasics((prev) => ({ ...prev, [field]: side }));
  }, []);

  const finalDecisions = useMemo(() => buildFinalDecisions(decisions, newItems), [decisions, newItems]);

  return { decisions, newItems, basics, finalDecisions, setDecision, setNewItem, toggleNewItem, setBasic };
}

export type MergeDecisionState = ReturnType<typeof useMergeDecisions>;
