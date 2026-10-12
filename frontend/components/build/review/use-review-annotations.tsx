/**
 * The page annotations for the open review in the Changes view: diff marks
 * for every kind, numbered pins + the selected change's popover for edit
 * reviews (tailor, create-from-a-job, chat revision), and each kind's own
 * cards (merge decisions; requirement chips, gap questions, left-out).
 * Before / After show the plain page.
 */
import { useMemo } from "react";
import { pathAfterOmit } from "@shared/resume-path";
import type { ResumeAnnotations } from "@/components/resume-renderer/annotations";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import { addMarks, addPins, type Mutable } from "./annotation-builders";
import ChangePopover from "./ChangePopover";
import { addMergeCards } from "./merge/merge-annotations";
import { addJobCards } from "./job-annotations";

export function useReviewAnnotations(review: BuildReview): ResumeAnnotations | undefined {
  const { active, view, selected, select } = review;
  return useMemo(() => {
    if (!active || view !== "changes" || !active.baseline || !active.proposed) return undefined;
    const map: Mutable = {};
    addMarks(map, active.baseline, active.proposed);
    if (active.kind === "merge" || active.kind === "pull") {
      addMergeCards(map, active);
    } else if (active.kind !== "compare") {
      const change = active.changes[selected];
      const popover = change ? (
        <ChangePopover review={active} change={change} index={selected} onSelect={select} variant="pin" />
      ) : null;
      const hidden = active.kind === "fromJob" ? active.hiddenPaths : [];
      addPins(map, active.changes, change?.id ?? null, popover, (p) => pathAfterOmit(p, hidden));
      if (active.kind === "fromJob") addJobCards(map, active);
    }
    return map;
  }, [active, view, selected, select]);
}
