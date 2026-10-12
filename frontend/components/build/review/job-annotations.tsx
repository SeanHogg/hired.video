/**
 * Create-from-a-job on the page: requirement chips (R1…) on the bullets /
 * entries that prove them, each open question in place (after the entry it
 * belongs to, else at the end of Work), and "Left out for this job: … Show"
 * at the end. Paths are remapped past hidden left-out entries.
 */
import { useTranslation } from "react-i18next";
import { pathAfterOmit } from "@shared/resume-path";
import type { JobDraftReview } from "@/lib/build/review/use-job-draft-review";
import { annotate, type Mutable } from "./annotation-builders";
import GapQuestionCard from "./GapQuestionCard";

function LeftOutCard({ review }: { review: JobDraftReview }) {
  const { t } = useTranslation();
  const items = review.draft?.leftOut ?? [];
  if (items.length === 0) return null;
  return (
    <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2.5 font-sans text-[13px] text-muted-foreground">
      <span>
        <strong className="text-foreground">{t("review.job.leftOut")}</strong> {items.map((i) => i.label).join(" · ")}
      </span>
      <button
        type="button"
        className="min-h-11 rounded-md px-2 font-medium text-primary underline-offset-2 hover:underline sm:min-h-0"
        onClick={() => review.setShowLeftOut(!review.showLeftOut)}
      >
        {t(review.showLeftOut ? "review.job.hideLeftOut" : "review.job.showLeftOut")}
      </button>
    </div>
  );
}

export function addJobCards(map: Mutable, review: JobDraftReview): void {
  const draft = review.draft;
  if (!draft) return;
  const hidden = review.hiddenPaths;
  const at = (path: string) => pathAfterOmit(path, hidden);

  for (const r of review.requirements) {
    for (const evidence of r.evidence) {
      const path = at(evidence);
      if (path) annotate(map, path, { kind: "pin", chips: [r.id] });
    }
  }

  const fallback = (draft.content.work?.length ?? 0) > 0 ? "work" : "skills";
  for (const gap of draft.gaps) {
    const anchor = (gap.anchorPath && at(gap.anchorPath)) || fallback;
    annotate(map, anchor, { kind: "pin", cardAfter: <GapQuestionCard key={gap.id} gap={gap} answers={review.answers} withMasterToggle /> });
  }

  if (draft.leftOut.length > 0) annotate(map, fallback, { kind: "pin", cardAfter: <LeftOutCard review={review} /> });
}
