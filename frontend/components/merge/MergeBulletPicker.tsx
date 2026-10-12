/**
 * The bullet checklist of a matched entry: tick what to keep (in both /
 * new from the other file / only in the target), select all / clear /
 * reset, and "AI consolidate" — a proposal shown for Accept / Reject before
 * anything changes. Used by the merge dialog and by the kit's on-page card.
 */
import { useTranslation } from "react-i18next";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { bulletListLabelKey } from "@/lib/merge/merge-labels";
import { useBulletSelection, type BulletOrigin } from "@/lib/merge/use-bullet-selection";
import { useBulletConsolidate } from "@/lib/merge/use-bullet-consolidate";
import type { MergeDecision } from "@/types/resume";

interface MergeBulletPickerProps {
  sectionType: string;
  /** "AiM · VP of Technology" — context for the AI rewrite. */
  entryLabel: string;
  sourceHighlights: readonly string[];
  targetHighlights: readonly string[];
  decision: MergeDecision;
  onDecisionChange: (d: MergeDecision) => void;
}

const ORIGIN_CLASS: Record<BulletOrigin, string> = {
  source: "rounded-[3px] bg-diff-added px-0.5 text-diff-added-foreground",
  target: "text-muted-foreground",
  both: "text-foreground",
};

export default function MergeBulletPicker({
  sectionType,
  entryLabel,
  sourceHighlights,
  targetHighlights,
  decision,
  onDecisionChange,
}: MergeBulletPickerProps) {
  const { t } = useTranslation();
  const pick = useBulletSelection(sourceHighlights, targetHighlights, decision, onDecisionChange);
  const ai = useBulletConsolidate(sectionType, entryLabel);

  if (pick.items.length === 0) return <p className="text-xs italic text-muted-foreground">{t("merge.bullets.none")}</p>;

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{t(bulletListLabelKey(sectionType))}</p>
        <span className="text-xs text-muted-foreground">
          {t("merge.bullets.selected", { count: pick.selected.size, total: pick.items.length })}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {pick.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={pick.selected.has(item.key)}
              onCheckedChange={() => pick.toggle(item.key)}
              aria-label={t("merge.bullets.keep")}
              className="mt-0.5"
            />
            <span className={ORIGIN_CLASS[item.origin]}>
              {item.text}
              {item.origin !== "target" && (
                <span className="ml-1.5 inline-flex rounded bg-muted px-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t(item.origin === "both" ? "merge.bullets.inBoth" : "merge.bullets.new")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={pick.selectAll}>
          {t("merge.bullets.selectAll")}
        </Button>
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={pick.clear}>
          {t("merge.bullets.clear")}
        </Button>
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={pick.reset} title={t("merge.bullets.resetHint")}>
          {t("merge.bullets.reset")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1 text-xs"
          disabled={ai.busy || pick.selected.size < 2}
          onClick={() => void ai.run(pick.selectedTexts)}
          title={t("merge.ai.hint")}
        >
          {ai.busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3 w-3" aria-hidden="true" />}
          {t("merge.ai.consolidate")}
        </Button>
      </div>
      {ai.proposal && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              {t("merge.ai.proposal", { from: pick.selected.size, to: ai.proposal.length })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={ai.dismiss}>
                <X className="mr-1 h-3 w-3" aria-hidden="true" />
                {t("merge.ai.reject")}
              </Button>
              <Button
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  pick.replaceWith(ai.proposal ?? []);
                  ai.dismiss();
                }}
              >
                <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                {t("merge.ai.accept")}
              </Button>
            </div>
          </div>
          <ul className={cn("list-disc space-y-1 pl-5 text-sm text-foreground")}>
            {ai.proposal.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {ai.notes.length > 0 && (
            <ul className="mt-2 border-t border-primary/20 pt-2 text-xs text-muted-foreground">
              {ai.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
