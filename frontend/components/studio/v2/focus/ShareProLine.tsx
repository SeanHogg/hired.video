import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";

/**
 * The Post panel's one-line Pro offer before posting (Post board): "Free
 * posts to N channels, with the mark · Pro posts to all of them, no mark".
 * Shows only to a free account whose cap is below the channels on offer.
 */
export default function ShareProLine({ limit, channelCount }: { limit: number; channelCount: number }) {
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const price = useProMonthlyPriceLabel();
  if (isPro || !Number.isFinite(limit) || channelCount <= limit) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-accent px-3 py-2.5 ring-1 ring-inset ring-primary/20">
      <span className="min-w-0 flex-[1_1_200px] text-[13px] text-accent-foreground">
        {t("studio.share.proLine", { count: channelCount, price })}
      </span>
      <Link to="/pricing" className="inline-flex min-h-[40px] items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90">
        {t("studio.share.proLineCta", { price })}
      </Link>
    </div>
  );
}
