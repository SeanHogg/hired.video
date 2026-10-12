/**
 * The strip above the page while a review is open: what it is (MERGE
 * PREVIEW · TAILORED · NEW FROM JOB POST …), where the page sits (★ Master /
 * Version of ★ Master), Changes / Before / After, Side by side, Discard and
 * the ONE primary action — disabled until the "Needs you" queue is empty.
 */
import { useTranslation } from "react-i18next";
import { Loader2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import type { ReviewView } from "@/lib/build/review/review-model";
import LineageBadge from "./LineageBadge";

const VIEWS: readonly ReviewView[] = ["changes", "before", "after"];

export default function ReviewBar({ review }: { review: BuildReview }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const active = review.active;
  if (!active) return null;
  const loading = active.status === "loading";
  const primary = active.primary;
  const blocked = active.remaining > 0;
  const viewLabel = (v: ReviewView) => t(active.kind === "fromJob" && v !== "changes" ? `review.view.job.${v}` : `review.view.${v}`);

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-accent px-1.5 py-1 text-[11px] font-semibold uppercase leading-none text-accent-foreground">
        {t(`review.kind.${active.kind}`)}
      </span>
      <LineageBadge lineage={review.lineage} />
      {active.subject && <span className="min-w-0 truncate text-[13px] text-foreground">{active.subject}</span>}
      {active.kind === "fromJob" && active.openQuestions > 0 && (
        <span className="text-[13px] text-muted-foreground">{t("review.job.questionsOpen", { count: active.openQuestions })}</span>
      )}
      {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label={t("review.loading")} />}
      <span className="flex-1" />
      <div role="group" aria-label={t("review.view.label")} className="flex overflow-hidden rounded-lg border border-input">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={review.view === v}
            onClick={() => review.setView(v)}
            className={cn(
              "min-h-11 px-3 text-[13px] font-medium transition-colors sm:min-h-9",
              review.view === v ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {viewLabel(v)}
          </button>
        ))}
        <button
          type="button"
          onClick={review.openCompare}
          disabled={loading || !active.proposed}
          className="flex min-h-11 items-center gap-1.5 border-l border-input bg-card px-3 text-[13px] font-semibold text-primary hover:bg-muted disabled:opacity-50 sm:min-h-9"
        >
          {t("review.sideBySide")}
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={active.discard}>
        {t(active.kind === "compare" ? "actions.close" : "review.discard")}
      </Button>
      {primary && (
        <Button
          size="sm"
          className="min-h-11 sm:min-h-9"
          disabled={blocked || primary.busy || loading}
          onClick={() => primary.run().catch(() => toast({ title: t("review.error.saveFailed"), variant: "destructive" }))}
        >
          {primary.busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {blocked ? t("review.leftToDecide", { label: t(primary.labelKey), count: active.remaining }) : t(primary.labelKey)}
        </Button>
      )}
    </div>
  );
}
