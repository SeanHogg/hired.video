/** "6 auto-merge · 1 review · 1 skip · 4 new" — the shape of a merge at a
 *  glance. `review` can be overridden with what is still left to decide. */
import { useTranslation } from "react-i18next";
import type { MergeAnalysis } from "@/types/resume";

const DOT: Record<string, string> = {
  auto: "bg-diff-added-foreground",
  review: "bg-review-border",
  skip: "bg-muted-foreground",
  new: "bg-primary",
};

export default function MergeSummaryChips({ summary, reviewLeft }: { summary: MergeAnalysis["summary"]; reviewLeft?: number }) {
  const { t } = useTranslation();
  const chips: Array<[keyof typeof DOT, number]> = [
    ["auto", summary.autoMerge],
    ["review", reviewLeft ?? summary.manualReview],
    ["skip", summary.skip],
    ["new", summary.newItems],
  ];
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("merge.summary.label")}>
      {chips.map(([kind, count]) => (
        <li
          key={kind}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[kind]}`} />
          {t(`merge.summary.${kind}`, { count })}
        </li>
      ))}
    </ul>
  );
}
