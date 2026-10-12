/**
 * The merge, told in the chat: how confidently the file was read, that
 * nothing is saved until Apply, the auto / review / skip / new counts, the
 * "Needs you" queue (each item jumps to its card on the page) and what
 * Apply does — update the master (recommended) or save a version of it.
 * A pull says it is bringing the master's changes into this version.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import MergeSummaryChips from "@/components/merge/MergeSummaryChips";
import { mergeFieldLabelKey } from "@/lib/merge/merge-labels";
import type { MergeReview } from "@/lib/build/review/use-merge-review";
import { scrollIntoViewWithin } from "@/lib/dom/scroll-within";
import { queueAnchorId } from "./merge/CardShell";

function jumpTo(queueId: string) {
  const el = document.getElementById(queueAnchorId(queueId));
  scrollIntoViewWithin(el, "center");
  el?.focus({ preventScroll: true });
}

export default function MergeQueue({ review }: { review: MergeReview }) {
  const { t } = useTranslation();
  const radioName = useId();
  const a = review.analysis;
  if (!a) return null;
  const isPull = review.kind === "pull";
  const role = review.lineage?.role;

  return (
    <div className="flex flex-col gap-3 text-[14.5px] leading-[1.5] text-foreground">
      <p>
        {review.parseConfidence !== null && t("review.merge.readConfidence", { pct: Math.round(review.parseConfidence * 100) }) + " "}
        {t(isPull ? "review.merge.pullIntro" : "review.merge.intro")} <strong>{t("review.merge.nothingSaved")}</strong>
      </p>
      {!isPull && role === "master" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          {t("review.merge.masterNote", { count: review.lineage?.versionCount ?? 0 })}
        </p>
      )}
      <MergeSummaryChips summary={a.summary} reviewLeft={review.remaining} />
      {review.queue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
            {t("review.merge.needsYou", { count: review.remaining })}
          </p>
          <ul>
            {review.queue.map((q, i) => (
              <li key={q.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => jumpTo(q.id)}
                  className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-muted"
                >
                  {q.done ? (
                    <Check className="h-4 w-4 flex-none text-diff-added-foreground" aria-label={t("review.merge.done")} />
                  ) : (
                    <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-review-border px-1 text-[11px] font-bold text-background">
                      {i + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={q.done ? "text-muted-foreground line-through" : "font-medium"}>{t(`review.merge.queue.${q.kind}`)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {q.kind === "basics" ? t(mergeFieldLabelKey(q.name), { field: q.name }) : q.name}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isPull && (
        <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">{t("review.merge.whenApply")}</legend>
          <RadioGroup value={review.saveChoice} onValueChange={(v) => review.setSaveChoice(v === "version" ? "version" : "update")}>
            <label className="flex min-h-11 items-center gap-2 text-[13.5px] sm:min-h-0">
              <RadioGroupItem value="update" id={`${radioName}-u`} />
              {t(role === "version" ? "review.merge.updateVersion" : role === "master" ? "review.merge.updateMaster" : "review.merge.updateThis")}
              {role === "master" && (
                <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">{t("review.merge.recommended")}</span>
              )}
            </label>
            <label className="flex min-h-11 flex-wrap items-center gap-2 text-[13.5px] sm:min-h-0">
              <RadioGroupItem value="version" id={`${radioName}-v`} />
              {t("review.merge.saveAsVersion")}
              {review.saveChoice === "version" && (
                <Input
                  aria-label={t("review.merge.versionTitle")}
                  value={review.versionTitle}
                  onChange={(e) => review.setVersionTitle(e.target.value)}
                  className="h-9 min-w-0 flex-[1_1_180px]"
                />
              )}
            </label>
          </RadioGroup>
          {review.alsoMaster !== null && review.saveChoice === "update" && (
            <label className="flex min-h-11 items-center gap-2 text-[13px] sm:min-h-0">
              <Checkbox checked={review.alsoMaster} onCheckedChange={(v) => review.setAlsoMaster(v === true)} />
              {t("review.merge.alsoMaster")}
            </label>
          )}
        </fieldset>
      )}
    </div>
  );
}
