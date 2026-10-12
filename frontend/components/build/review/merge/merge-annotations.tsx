/**
 * Where a merge's decisions sit on the After page:
 *
 *   basics conflicts      under the name
 *   matched entry         above the merged entry (its target position; an
 *                         "Add as new" sits above where it is appended)
 *   included new entry    a "+ NEW" strip above where it is appended
 *   held-back new entry   a card at the end of its section
 *
 * Queue numbers match the chat's "Needs you" list.
 */
import { newItemKey, addedEntryPaths } from "@/lib/merge/merge-decisions";
import type { MergeReview } from "@/lib/build/review/use-merge-review";
import { annotate, type Mutable } from "../annotation-builders";
import BasicsConflictsCard from "./BasicsConflictsCard";
import MatchCard from "./MatchCard";
import NewItemCard from "./NewItemCard";

export function addMergeCards(map: Mutable, review: MergeReview): void {
  const analysis = review.analysis;
  if (!analysis || !review.baseline) return;
  const numbers = new Map(review.queue.map((q, i) => [q.id, i + 1]));
  const added = addedEntryPaths(review.decisions.finalDecisions, review.baseline as unknown as Record<string, unknown>);

  if (analysis.basics.conflicts.length > 0) {
    annotate(map, "basics", { kind: "pin", card: <BasicsConflictsCard review={review} numbers={numbers} /> });
  }

  review.decisions.decisions.forEach((d, index) => {
    const match = analysis.sectionMatches.find((m) => m.sectionType === d.sectionType && m.sourceIndex === d.sourceIndex);
    if (!match) return;
    const anchor =
      d.action === "add"
        ? added.get(newItemKey(d.sectionType, d.sourceIndex))
        : match.targetIndex !== null
          ? `${match.sectionType}.${match.targetIndex}`
          : match.sectionType;
    if (!anchor) return;
    const queueId = `match:${match.sectionType}:${match.sourceIndex}`;
    annotate(map, anchor, {
      kind: numbers.has(queueId) ? "review" : "pin",
      card: <MatchCard review={review} match={match} decisionIndex={index} number={numbers.get(queueId)} />,
    });
  });

  for (const item of analysis.newSections) {
    const key = newItemKey(item.sectionType, item.sourceIndex);
    const path = added.get(key);
    const card = <NewItemCard review={review} item={item} number={numbers.get(`new:${key}`)} />;
    if (path) annotate(map, path, { kind: "new", card });
    else annotate(map, item.sectionType, { kind: "pin", cardAfter: card });
  }
}
