/** "Auto 92%" / "Review 61%" / "Low 30%" — how sure the merge is that two
 *  entries are the same thing. */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { confidenceTier, type ConfidenceTier } from "@/lib/merge/merge-labels";

const TIER_CLASS: Record<ConfidenceTier, string> = {
  auto: "bg-diff-added text-diff-added-foreground",
  review: "bg-review text-review-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function MergeConfidenceBadge({ confidence, action }: { confidence: number; action: string }) {
  const { t } = useTranslation();
  const tier = confidenceTier(confidence, action);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-semibold leading-none",
        TIER_CLASS[tier],
      )}
    >
      {t(`merge.confidence.${tier}`, { pct: Math.round(confidence * 100) })}
    </span>
  );
}
