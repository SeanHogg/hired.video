/**
 * Tailor, told in the chat: Original → Tailored score, the changes grouped
 * by section (each says why; Revert / redo), "The job asks for · not on
 * your résumé" questions with "Also add what you confirm to your master"
 * (on by default), and the match recommendations.
 */
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import type { TailorReview } from "@/lib/build/review/use-tailor-review";
import type { ReviewChange } from "@/lib/build/review/review-model";
import GapQuestionCard from "./GapQuestionCard";

function groupBySection(changes: readonly ReviewChange[]): Array<[string, ReviewChange[]]> {
  const map = new Map<string, ReviewChange[]>();
  for (const c of changes) map.set(c.section, [...(map.get(c.section) ?? []), c]);
  return [...map.entries()];
}

export default function TailorPanel({ review, onSelect }: { review: TailorReview; onSelect: (index: number) => void }) {
  const { t } = useTranslation();
  if (review.status !== "ready") return null;
  const kept = review.changes.filter((c) => c.status === "kept").length;

  return (
    <div className="flex flex-col gap-3 text-[14.5px] leading-[1.5] text-foreground">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("review.tailor.original")}</p>
          <p className="text-xl font-semibold">{review.oldScore}%</p>
        </div>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
        <div>
          <p className="text-xs text-muted-foreground">{t("review.tailor.tailored")}</p>
          <p className="text-xl font-semibold text-diff-added-foreground">{review.score}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("review.tailor.change")}</p>
          <p className="text-xl font-semibold">+{review.score - review.oldScore}</p>
        </div>
      </div>
      <p>{t("review.tailor.intro", { count: review.changes.length, title: review.subject })}</p>
      <div className="overflow-hidden rounded-xl border border-border">
        <p className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("review.tailor.kept", { kept, total: review.changes.length })}
          <button type="button" className="min-h-11 font-medium text-primary hover:underline sm:min-h-0" onClick={() => review.setAll("reverted")}>
            {t("review.compare.revertAll")}
          </button>
        </p>
        {groupBySection(review.changes).map(([section, items]) => (
          <div key={section}>
            <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`tabs.${section}`)}</p>
            <ul>
              {items.map((c) => (
                <li key={c.id} className="flex items-start gap-2 px-3 py-2 text-[13px]">
                  <button
                    type="button"
                    onClick={() => onSelect(c.pin - 1)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left hover:underline"
                  >
                    <span className="mt-0.5 inline-flex h-[19px] min-w-[19px] flex-none items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                      {c.pin}
                    </span>
                    <span className={c.status === "reverted" ? "text-muted-foreground line-through" : ""}>{c.why || c.after}</span>
                  </button>
                  <button
                    type="button"
                    className="min-h-11 flex-none rounded-md border border-border px-2 text-xs hover:bg-muted sm:min-h-8"
                    onClick={() => review.setChange(c.id, c.status === "kept" ? "reverted" : "kept")}
                  >
                    {t(c.status === "kept" ? "review.change.revert" : "review.change.redo")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {review.gaps.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">{t("review.tailor.asksFor")}</p>
          <p className="text-[13px] text-muted-foreground">{t("review.tailor.wontAdd")}</p>
          <label className="flex min-h-11 items-center gap-2 text-[13px] sm:min-h-0">
            <Checkbox checked={review.answers.alsoMaster} onCheckedChange={(v) => review.answers.setAlsoMaster(v === true)} />
            {t("review.tailor.alsoMaster")}
          </label>
          {review.gaps.map((g) => (
            <GapQuestionCard key={g.id} gap={g} answers={review.answers} compact />
          ))}
        </div>
      )}
      {review.recommendations && (
        <details className="text-[13px]">
          <summary className="min-h-11 cursor-pointer font-medium text-primary sm:min-h-0">{t("review.tailor.recommendations")}</summary>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{review.recommendations}</p>
        </details>
      )}
    </div>
  );
}
