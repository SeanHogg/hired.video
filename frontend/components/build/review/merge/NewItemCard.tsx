/**
 * An entry only the other file has. Included → a "+ NEW" strip above it on
 * the page with an Include box. Not included (unticked, or held back as a
 * likely parsing slip) → a card in its section: "Not added", with Keep it
 * out / Add anyway for a misclassified one (in the "Needs you" queue until
 * decided).
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { describeMergeItem } from "@/lib/merge/merge-labels";
import { newItemKey } from "@/lib/merge/merge-decisions";
import type { MergeReview } from "@/lib/build/review/use-merge-review";
import type { MergeAnalysis } from "@/types/resume";
import CardShell from "./CardShell";

type NewItem = MergeAnalysis["newSections"][number];

interface NewItemCardProps {
  review: MergeReview;
  item: NewItem;
  number?: number;
}

export default function NewItemCard({ review, item, number }: NewItemCardProps) {
  const { t } = useTranslation();
  const key = newItemKey(item.sectionType, item.sourceIndex);
  const included = review.decisions.newItems.get(key) ?? !item.crossSectionConflict;
  const toggle = () => review.decisions.toggleNewItem(key);

  if (included) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-3 font-sans text-xs">
        <span className="rounded-md bg-diff-added px-1.5 py-1 font-semibold text-diff-added-foreground">
          {t("review.merge.newFrom", { name: review.subject })}
        </span>
        <label className="flex min-h-11 items-center gap-2 text-foreground sm:min-h-0">
          <Checkbox checked onCheckedChange={toggle} />
          {t("review.merge.include")}
        </label>
      </div>
    );
  }

  const d = describeMergeItem(item.sectionType, item.item as Record<string, unknown>);
  const name = d.label || t(d.fallbackKey);
  const conflict = item.crossSectionConflict;
  const queueId = `new:${key}`;
  const queued = review.queue.find((q) => q.id === queueId);

  if (!conflict) {
    return (
      <CardShell title={t("review.merge.notAdded", { name })}>
        <label className="flex min-h-11 items-center gap-2 sm:min-h-0">
          <Checkbox checked={false} onCheckedChange={toggle} />
          {t("review.merge.include")}
        </label>
      </CardShell>
    );
  }

  return (
    <CardShell
      queueId={queueId}
      number={number}
      needsYou={!!queued && !queued.done}
      title={t("review.merge.notAdded", { name })}
      badges={
        <span className="inline-flex items-center gap-1 rounded-md bg-diff-removed px-1.5 py-1 text-[11px] font-semibold leading-none text-diff-removed-foreground">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {t("merge.match.misclassified")}
        </span>
      }
    >
      <p className="text-muted-foreground">{conflict.reason}</p>
      {queued && !queued.done ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => review.resolve(queueId)}>
            {t("review.merge.keepOut")}
          </Button>
          <Button
            size="sm"
            className="min-h-11 sm:min-h-9"
            onClick={() => {
              review.decisions.setNewItem(key, true);
              review.resolve(queueId);
            }}
          >
            {t("review.merge.addAnyway")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">✓ {t("review.merge.decided")}</p>
      )}
    </CardShell>
  );
}
