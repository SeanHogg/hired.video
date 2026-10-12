/**
 * Create-from-a-job, told in the chat: what was read ("6 requirements, built
 * from your résumé only — nothing is made up"), Built from (★ master /
 * master + its versions / this résumé), and Requirement → your evidence
 * (R1…Rn, "4 of 6 covered"); a gap says to answer it on the page.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { EvidenceSource, JobDraftReview } from "@/lib/build/review/use-job-draft-review";
import type { RequirementStatus } from "@shared/resume-from-job";

const MARK: Record<RequirementStatus, string> = { covered: "✓", partial: "½", gap: "?" };
const SOURCES: readonly EvidenceSource[] = ["master", "masterAndVersions", "open"];

export default function RequirementChecklist({ review }: { review: JobDraftReview }) {
  const { t } = useTranslation();
  const selectId = useId();
  const total = review.requirements.length;
  const pct = total ? Math.round((review.covered / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 text-[14.5px] leading-[1.5] text-foreground">
      {review.draft && (
        <p>
          {t("review.job.read", { job: review.subject, count: total })} <strong>{t("review.job.nothingMadeUp")}</strong>
        </p>
      )}
      <label htmlFor={selectId} className="flex flex-col gap-1.5 text-[13px]">
        <span className="font-semibold">{t("review.job.builtFrom")}</span>
        <select
          id={selectId}
          value={review.evidence}
          disabled={review.status === "loading"}
          onChange={(e) => review.setEvidence(e.target.value as EvidenceSource)}
          className="h-11 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`review.job.source.${s}`)}
            </option>
          ))}
        </select>
      </label>
      {total > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
            {t("review.job.checklist")}
            <span>{t("review.job.covered", { covered: review.covered, total })}</span>
          </p>
          <div className="h-1.5 bg-muted" aria-hidden="true">
            <div className="h-1.5 bg-diff-added-foreground" style={{ width: `${pct}%` }} />
          </div>
          <ul>
            {review.requirements.map((r) => (
              <li key={r.id} className={cn("flex gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0", r.status === "gap" && "bg-review/50")}>
                <span className="h-fit rounded-full bg-accent px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-foreground">{r.id}</span>
                <span className="min-w-0 flex-1">
                  <strong>{r.text}</strong>
                  <span className={cn("block", r.status === "gap" ? "text-review-foreground" : "text-muted-foreground")}>
                    {r.status === "gap" ? t("review.job.noEvidence") : r.note}
                  </span>
                </span>
                <span aria-label={t(`review.job.status.${r.status}`)} className="font-bold">
                  {MARK[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
