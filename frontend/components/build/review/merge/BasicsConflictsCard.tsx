/** "1 · Your two résumés disagree" — pick Master (keep) or the new file for
 *  each header field they disagree on. Sits under the name on the page. */
import { useTranslation } from "react-i18next";
import MergeValuePick from "@/components/merge/MergeValuePick";
import { mergeFieldLabelKey } from "@/lib/merge/merge-labels";
import type { MergeReview } from "@/lib/build/review/use-merge-review";
import CardShell from "./CardShell";
import { useMergeSideNames } from "./side-names";

export default function BasicsConflictsCard({ review, numbers }: { review: MergeReview; numbers: ReadonlyMap<string, number> }) {
  const { t } = useTranslation();
  const names = useMergeSideNames(review);
  const conflicts = review.analysis?.basics.conflicts ?? [];
  if (conflicts.length === 0) return null;
  return (
    <>
      {conflicts.map((c) => {
        const id = `basics:${c.field}`;
        const done = review.queue.find((q) => q.id === id)?.done ?? true;
        const field = t(mergeFieldLabelKey(c.field), { field: c.field });
        return (
          <CardShell key={id} queueId={id} number={numbers.get(id)} needsYou={!done} title={t("review.merge.basicsConflict", { field })}>
            <MergeValuePick
              sourceValue={c.sourceValue}
              targetValue={c.targetValue}
              sourceName={names.source}
              targetName={names.target}
              value={review.decisions.basics[c.field]}
              onChange={(side) => review.decisions.setBasic(c.field, side)}
            />
          </CardShell>
        );
      })}
    </>
  );
}
