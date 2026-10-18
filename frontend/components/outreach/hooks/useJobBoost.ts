import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";
import { useCheckoutPayment } from "@/hooks/use-checkout-payment";
import { checkoutIdFor } from "@shared/checkout";
import { checkoutService } from "@/lib/services/checkout-service";
import {
  advertisingService,
  type AdvertisingStats,
  type JobBoost,
} from "@/lib/services/advertising-service";

export type BoostPlacementType = "search_top" | "discovery_feed" | "both" | "";
export type BoostPricingModel = "cpm" | "cpc" | "";

/** Boost-job dialog state + server-priced checkout/payment flow. */
export function useJobBoost({
  setActiveBoosts,
  setAdStats,
}: {
  setActiveBoosts: Dispatch<SetStateAction<JobBoost[]>>;
  setAdStats: Dispatch<SetStateAction<AdvertisingStats | null>>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [boostJobId, setBoostJobId] = useState("");
  const [boostPlacementType, setBoostPlacementType] = useState<BoostPlacementType>("");
  const [boostPricingModel, setBoostPricingModel] = useState<BoostPricingModel>("");
  const [boostBudget, setBoostBudget] = useState("");
  const [boostDuration, setBoostDuration] = useState("");
  const [boostSubmitting, setBoostSubmitting] = useState(false);
  const { pay: payCheckout } = useCheckoutPayment();

  /** Pay what's due on a job boost (server-priced checkout → widget →
   *  provider-verified confirm). The job is sponsored only on a confirmed
   *  payment; a cancelled widget leaves the boost "awaiting payment". */
  const payJobBoost = useCallback(
    async (jobBoostId: string) => {
      const result = await payCheckout(checkoutIdFor("job_boost", jobBoostId));
      const [boosts, stats] = await Promise.all([
        advertisingService.getBoosts().catch(() => null),
        advertisingService.getStats().catch(() => null),
      ]);
      if (boosts) setActiveBoosts(boosts);
      if (stats) setAdStats(stats);
      if (result.status === "paid") {
        toast({ title: t("outreach.jobBoost.toast.paidTitle"), description: t("outreach.jobBoost.toast.paidDescription") });
      } else if (result.status === "verifying") {
        toast({ title: t("outreach.jobBoost.toast.verifyingTitle"), description: t("outreach.jobBoost.toast.verifyingDescription") });
      } else if (result.status === "cancelled") {
        toast({ title: t("outreach.jobBoost.toast.cancelledTitle"), description: t("outreach.jobBoost.toast.cancelledDescription") });
      } else {
        toast({ title: t("outreach.jobBoost.toast.errorTitle"), description: t("outreach.jobBoost.toast.errorDescription"), variant: "destructive" });
      }
    },
    [payCheckout, t],
  );

  const resetForm = () => {
    setBoostJobId("");
    setBoostPlacementType("");
    setBoostPricingModel("");
    setBoostBudget("");
    setBoostDuration("");
  };

  const cancel = () => {
    setOpen(false);
    resetForm();
  };

  const canSubmit = !(
    boostSubmitting ||
    !boostJobId ||
    !boostPlacementType ||
    !boostPricingModel ||
    !boostBudget ||
    parseFloat(boostBudget) < 10 ||
    !boostDuration
  );

  const submit = async () => {
    if (!boostPlacementType || !boostPricingModel) return;
    setBoostSubmitting(true);
    try {
      // Server-priced checkout: the boost is created awaiting
      // payment and the job is sponsored only once paid.
      const checkout = await checkoutService.start<"job_boost">({
        kind: "job_boost",
        jobId: boostJobId,
        placementType: boostPlacementType,
        pricingModel: boostPricingModel,
        budgetCents: Math.round(parseFloat(boostBudget) * 100),
        durationDays: parseInt(boostDuration),
      });
      setOpen(false);
      resetForm();
      await payJobBoost(checkout.details.jobBoostId);
    } catch (err) {
      console.error("Failed to create boost:", err);
      toast({ title: t("outreach.jobBoost.toast.errorTitle"), description: t("outreach.jobBoost.toast.errorDescription"), variant: "destructive" });
    } finally {
      setBoostSubmitting(false);
    }
  };

  return {
    open,
    setOpen,
    boostJobId,
    setBoostJobId,
    boostPlacementType,
    setBoostPlacementType,
    boostPricingModel,
    setBoostPricingModel,
    boostBudget,
    setBoostBudget,
    boostDuration,
    setBoostDuration,
    boostSubmitting,
    canSubmit,
    payJobBoost,
    cancel,
    submit,
  };
}

export type JobBoostState = ReturnType<typeof useJobBoost>;
