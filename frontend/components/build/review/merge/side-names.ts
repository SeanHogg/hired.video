/** How a merge names its two sides on the kit workspace: the target is "★ Master" (or
 *  "This version" / "This résumé"); the source is the file or résumé name. */
import { useTranslation } from "react-i18next";
import type { MergeReview } from "@/lib/build/review/use-merge-review";

export function useMergeSideNames(review: MergeReview): { source: string; target: string } {
  const { t } = useTranslation();
  const role = review.lineage?.role;
  const target =
    role === "master" ? t("review.lineage.masterShort") : role === "version" ? t("review.merge.thisVersion") : t("review.merge.thisResume");
  return { source: review.kind === "pull" ? t("review.lineage.masterShort") : review.subject, target };
}
