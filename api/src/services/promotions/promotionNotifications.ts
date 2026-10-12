/**
 * Tell the creator what happened to their promotion submission (#2046).
 * Bell + push + email (pref-gated by the shared dispatcher). Best-effort: a
 * notification failure never undoes the review.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification } from "../notifications/notificationService.js";
import { SOCIAL_PLATFORM_META } from "../../../../shared/social-platforms.js";
import type { PromotionPlatform } from "../../../../shared/promotions.js";
import type { PromotionSubmission } from "./promotionRepository.js";

export async function notifyPromotionOutcome(row: PromotionSubmission): Promise<void> {
  if (row.status !== "published" && row.status !== "rejected") return;
  const platform = SOCIAL_PLATFORM_META[row.platform as PromotionPlatform].label;
  const published = row.status === "published";
  try {
    await emitNotification(
      { repos: buildRepos(getDb()) },
      {
        recipientIds: [row.submittedBy],
        type: published ? "promotion_published" : "promotion_rejected",
        actor: null,
        title: published
          ? `"${row.title}" is now featured on hired.video's ${platform}`
          : `"${row.title}" wasn't selected for hired.video's ${platform}`,
        message: published ? undefined : row.rejectReason ?? undefined,
        target: { id: row.id, type: "promotion_submission" },
        url: published && row.externalUrl ? row.externalUrl : `/studio/${row.projectId}?share=1`,
        email: true,
      },
    );
  } catch (err) {
    console.error("[promotions] outcome notification failed:", err);
  }
}
