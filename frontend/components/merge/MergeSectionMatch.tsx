/**
 * One matched entry in the merge dialog: confidence, the action (Merge /
 * Replace / Add as new / Skip), and — expanded — the two sides, the fields
 * that differ and the bullet checklist. Composed from the shared merge
 * pieces (MergeConfidenceBadge, MergeActionSelect, MergeScalarPicks,
 * MergeBulletPicker) that the kit's on-page merge card uses too.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { describeMergeItem } from "@/lib/merge/merge-labels";
import type { MergeDecision, SectionMatch } from "@/types/resume";
import MergeActionSelect from "./MergeActionSelect";
import MergeBulletPicker from "./MergeBulletPicker";
import MergeConfidenceBadge from "./MergeConfidenceBadge";
import MergeScalarPicks from "./MergeScalarPicks";

interface MergeSectionMatchProps {
  match: SectionMatch;
  sourceItem: Record<string, any>;
  targetItem: Record<string, any> | null;
  decision: MergeDecision;
  onDecisionChange: (decision: MergeDecision) => void;
}

function useEntryName() {
  const { t } = useTranslation();
  return (section: string, item: Record<string, unknown>) => {
    const d = describeMergeItem(section, item);
    return [d.label || t(d.fallbackKey), d.secondary].filter(Boolean).join(" · ");
  };
}

function Side({ title, name, summary }: { title: string; name: string | null; summary?: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      {name ? (
        <>
          <p className="text-sm font-medium text-foreground">{name}</p>
          {summary && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{summary}</p>}
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">{t("merge.match.noTarget")}</p>
      )}
    </div>
  );
}

/** Keywords of both sides as the merge will keep them (case-insensitive union). */
function CombinedKeywords({ source, target }: { source?: unknown; target?: unknown }) {
  const { t } = useTranslation();
  const all = [...(Array.isArray(target) ? target : []), ...(Array.isArray(source) ? source : [])].filter(
    (k): k is string => typeof k === "string",
  );
  const keywords = all.filter((k, i) => all.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i);
  if (keywords.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-foreground">{t("merge.match.keywords")}</p>
      <div className="flex flex-wrap gap-1">
        {keywords.map((k) => (
          <span key={k} className="rounded-md border border-border px-1.5 py-0.5 text-xs text-foreground">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MergeSectionMatch({ match, sourceItem, targetItem, decision, onDecisionChange }: MergeSectionMatchProps) {
  const { t } = useTranslation();
  const entryName = useEntryName();
  // Open by default when the person has something to decide.
  const [expanded, setExpanded] = useState(match.mergeAction === "manual" || !!match.hasContentDifferences);
  const diff = match.highlightDiff;
  const sourceName = t("merge.side.source");
  const targetName = t("merge.side.target");

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <MergeConfidenceBadge confidence={match.confidence} action={match.mergeAction} />
              {match.crossSectionConflict && (
                <span className="inline-flex items-center gap-1 rounded-md bg-diff-removed px-1.5 py-1 text-[11px] font-semibold leading-none text-diff-removed-foreground">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {t("merge.match.misclassified")}
                </span>
              )}
              <span className="truncate text-sm font-medium text-foreground">{entryName(match.sectionType, sourceItem)}</span>
            </span>
            {diff && (diff.onlyInSource > 0 || diff.onlyInTarget > 0) && (
              <span className="text-xs text-muted-foreground">
                {t("merge.match.bulletDiff", { added: diff.onlyInSource, only: diff.onlyInTarget })}
              </span>
            )}
          </span>
        </button>
        <MergeActionSelect
          value={decision.action}
          hasTarget={!!targetItem}
          onChange={(action) => onDecisionChange({ ...decision, action })}
        />
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3">
          {match.crossSectionConflict && (
            <p className="rounded-md bg-diff-removed p-3 text-xs text-diff-removed-foreground">
              {t("merge.match.misclassifiedBody", { reason: match.crossSectionConflict.reason, section: t(`tabs.${match.sectionType}`) })}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Side title={sourceName} name={entryName(match.sectionType, sourceItem)} summary={sourceItem.summary} />
            <Side title={targetName} name={targetItem ? entryName(match.sectionType, targetItem) : null} summary={targetItem?.summary} />
          </div>
          {decision.action === "merge" && (
            <>
              <MergeScalarPicks
                diffs={match.scalarDiffs}
                decision={decision}
                onDecisionChange={onDecisionChange}
                sourceName={sourceName}
                targetName={targetName}
              />
              <MergeBulletPicker
                sectionType={match.sectionType}
                entryLabel={entryName(match.sectionType, sourceItem)}
                sourceHighlights={Array.isArray(sourceItem.highlights) ? sourceItem.highlights : []}
                targetHighlights={Array.isArray(targetItem?.highlights) ? targetItem.highlights : []}
                decision={decision}
                onDecisionChange={onDecisionChange}
              />
              <CombinedKeywords source={sourceItem.keywords} target={targetItem?.keywords} />
            </>
          )}
          <p className="text-xs text-muted-foreground">{match.matchReason}</p>
        </div>
      )}
    </div>
  );
}
