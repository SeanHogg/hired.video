/**
 * The merge dialog's review list (résumé list "Merge", vendor sync):
 * summary, basics conflicts, matched entries by section, and new entries
 * with an include toggle (a likely-misclassified one starts excluded).
 * The kit workspace shows the same decisions ON the page instead (components/build/
 * review/merge); both are built from the shared merge pieces.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { describeMergeItem, mergeFieldLabelKey, mergeSectionLabelKey } from "@/lib/merge/merge-labels";
import type { MergeAnalysis, MergeDecision } from "@/types/resume";
import MergeSectionMatch from "./MergeSectionMatch";
import MergeSummaryChips from "./MergeSummaryChips";
import MergeValuePick from "./MergeValuePick";

interface MergeAnalysisViewProps {
  analysis: MergeAnalysis;
  sourceContent: Record<string, any>;
  targetContent: Record<string, any>;
  decisions: MergeDecision[];
  onDecisionChange: (index: number, decision: MergeDecision) => void;
  newItemDecisions: Map<string, boolean>; // key = "sectionType:sourceIndex", value = include
  onNewItemToggle: (key: string) => void;
  basicDecisions: Record<string, "source" | "target">;
  onBasicDecisionChange: (field: string, choice: "source" | "target") => void;
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

export default function MergeAnalysisView({
  analysis,
  sourceContent,
  targetContent,
  decisions,
  onDecisionChange,
  newItemDecisions,
  onNewItemToggle,
  basicDecisions,
  onBasicDecisionChange,
}: MergeAnalysisViewProps) {
  const { t } = useTranslation();
  const matchesBySection = groupBy(
    decisions.map((d, index) => ({ d, index })),
    ({ d }) => d.sectionType,
  );
  const newBySection = groupBy(analysis.newSections, (i) => i.sectionType);

  return (
    <div className="space-y-4">
      <MergeSummaryChips summary={analysis.summary} />

      {analysis.basics.conflicts.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">{t("merge.basics.title")}</h4>
          <div className="space-y-3">
            {analysis.basics.conflicts.map((c) => (
              <MergeValuePick
                key={c.field}
                label={t(mergeFieldLabelKey(c.field), { field: c.field })}
                sourceValue={c.sourceValue}
                targetValue={c.targetValue}
                sourceName={t("merge.side.source")}
                targetName={t("merge.side.target")}
                value={basicDecisions[c.field]}
                onChange={(side) => onBasicDecisionChange(c.field, side)}
              />
            ))}
          </div>
          <Separator className="mt-4" />
        </div>
      )}

      {Array.from(matchesBySection.entries()).map(([sectionType, rows]) => (
        <div key={sectionType}>
          <h4 className="mb-2 text-sm font-semibold">{t(mergeSectionLabelKey(sectionType))}</h4>
          <div className="space-y-2">
            {rows.map(({ d, index }) => {
              const match = analysis.sectionMatches.find((m) => m.sectionType === d.sectionType && m.sourceIndex === d.sourceIndex);
              const sourceItem = (sourceContent[sectionType] ?? [])[d.sourceIndex];
              if (!match || !sourceItem) return null;
              const targetItem = d.targetIndex !== null ? (targetContent[sectionType] ?? [])[d.targetIndex] : null;
              return (
                <MergeSectionMatch
                  key={`${sectionType}-${d.sourceIndex}`}
                  match={match}
                  sourceItem={sourceItem}
                  targetItem={targetItem}
                  decision={d}
                  onDecisionChange={(updated) => onDecisionChange(index, updated)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {analysis.newSections.length > 0 && (
        <>
          <Separator />
          <h4 className="text-sm font-semibold">{t("merge.newItems.title")}</h4>
          {Array.from(newBySection.entries()).map(([sectionType, items]) => (
            <div key={sectionType}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t(mergeSectionLabelKey(sectionType))}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const key = `${item.sectionType}:${item.sourceIndex}`;
                  const conflict = item.crossSectionConflict;
                  const included = newItemDecisions.get(key) ?? !conflict;
                  const d = describeMergeItem(item.sectionType, item.item as Record<string, unknown>);
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted/50 ${
                        conflict ? "border-diff-removed-foreground/40 bg-diff-removed/40" : "border-border"
                      }`}
                    >
                      <Checkbox checked={included} onCheckedChange={() => onNewItemToggle(key)} className="mt-0.5" />
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 py-1 text-[11px] font-semibold leading-none text-accent-foreground">
                        {conflict && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                        {t(conflict ? "merge.match.misclassified" : "merge.newItems.badge")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-medium">{d.label || t(d.fallbackKey)}</span>
                          {d.secondary && <span className="text-xs text-muted-foreground">{d.secondary}</span>}
                        </span>
                        {d.hint && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{d.hint}</span>}
                        {conflict && <span className="mt-1 block text-xs text-diff-removed-foreground">{conflict.reason}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
