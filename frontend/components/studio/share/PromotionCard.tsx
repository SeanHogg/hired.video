/**
 * PromotionCard — "Feature this on hired.video's channels" (Lane A, #2046).
 * Submits a saved, rendered project to the SuperAdmin promotion queue and
 * shows where each submission stands. Self-gating: renders nothing for an
 * unsaved draft, a signed-out visitor, or when no brand account is live.
 *
 * When the master doesn't fit a platform's preset, `resolveCut` (the Post
 * dock's fitted cuts, #2045) makes or reuses that platform's cut and the
 * submission names it, so the brand channel posts the same cut Lane B would.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { serverErrorCode } from "@/lib/errors";
import { promotionService, type PromotionSubmission } from "@/lib/services/promotion-service";
import { promotionQueryKey, usePromotionLane } from "./usePromotionLane";
import { SOCIAL_PLATFORM_META } from "@shared/social-platforms";
import type { PromotionPlatform } from "@shared/promotions";

export interface PromotionCardProps {
  projectId: string | null;
  /** Used as the post title; the reviewer sees it in the queue. */
  title: string;
  /** The fitted cut for a platform (undefined = the master); reports the cut
   *  being made so the card can say so. */
  resolveCut?: (
    platform: PromotionPlatform,
    report: (cut: { label: string; progress: number | null } | null) => void,
  ) => Promise<string | undefined>;
}

const STATUS_KEY: Record<PromotionSubmission["status"], string> = {
  pending: "studio.promotion.statusPending",
  published: "studio.promotion.statusPublished",
  failed: "studio.promotion.statusPending",
  rejected: "studio.promotion.statusRejected",
};

export default function PromotionCard({ projectId, title, resolveCut }: PromotionCardProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { query: q, ready, available } = usePromotionLane(projectId);
  const [cut, setCut] = useState<{ label: string; progress: number | null } | null>(null);
  const submit = useMutation({
    mutationFn: async (platform: PromotionPlatform) => {
      const variantVideoId = await resolveCut?.(platform, setCut);
      return promotionService.submit({
        projectId: projectId!,
        platform,
        title: title.trim() || t("studio.promotion.untitled"),
        description: "",
        variantVideoId,
      });
    },
    onSettled: () => {
      setCut(null);
      void qc.invalidateQueries({ queryKey: promotionQueryKey(projectId) });
    },
  });

  if (!available) return null;
  const unbranded = serverErrorCode(submit.error) === "VIDEO_UNBRANDED";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" aria-labelledby="promotion-heading">
      <h3 id="promotion-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />
        {t("studio.promotion.heading")}
      </h3>
      <p className="text-[13px] text-muted-foreground">{t("studio.promotion.body")}</p>
      {ready.map(({ platform }) => {
        const label = SOCIAL_PLATFORM_META[platform].label;
        const latest = q.data?.submissions.find((s) => s.platform === platform);
        const canSubmit = !latest || latest.status === "rejected";
        return (
          <div key={platform} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-[13px]">
              {latest ? (
                <span className="text-foreground">
                  {t(STATUS_KEY[latest.status], { platform: label })}
                  {latest.status === "published" && latest.views != null && (
                    <span className="block text-muted-foreground">
                      {t("studio.promotion.views", { count: latest.views })}
                    </span>
                  )}
                  {latest.status === "rejected" && latest.rejectReason && (
                    <span className="block text-muted-foreground">{latest.rejectReason}</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{label}</span>
              )}
            </div>
            {latest?.status === "published" && latest.externalUrl && (
              <a
                href={latest.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-primary hover:bg-accent"
              >
                {t("studio.promotion.view")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
            {canSubmit && (
              <button
                type="button"
                disabled={submit.isPending}
                onClick={() => submit.mutate(platform)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
              >
                {submit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t(latest ? "studio.promotion.resubmit" : "studio.promotion.submit", { platform: label })}
              </button>
            )}
          </div>
        );
      })}
      {cut && (
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {t("publish.variant.progressOne", { cut: cut.label })}
          {cut.progress !== null && ` ${Math.round(cut.progress * 100)}%`}
        </p>
      )}
      {submit.isError && (
        <p role="alert" className="text-[13px] text-destructive">
          {t(unbranded ? "studio.promotion.errorUnbranded" : "studio.promotion.errorGeneric")}
        </p>
      )}
    </section>
  );
}
