import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import {
  setPlanOverride,
  type OverridablePlanSlug,
} from "@/lib/services/superadmin-plan-override-service";
import { overrideFormFromUser } from "./helpers";
import type { ApiUser, OverrideTokenMode } from "./types";

/** Plan-override dialog — SuperAdmin comp / trial / custom token limit. */
export function usePlanOverride(refresh: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [overrideTarget, setOverrideTarget] = useState<ApiUser | null>(null);
  const [overridePlan, setOverridePlan] = useState<OverridablePlanSlug | "keep">("pro");
  const [overrideTokenMode, setOverrideTokenMode] = useState<OverrideTokenMode>("default");
  const [overrideTokenCustom, setOverrideTokenCustom] = useState("");
  const [overrideExpires, setOverrideExpires] = useState(""); // yyyy-mm-dd
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const openOverride = (user: ApiUser) => {
    setOverrideTarget(user);
    // Pre-fill from the existing override if one is active, otherwise default
    // to "promote to Pro" which is the most common comp action.
    const form = overrideFormFromUser(user);
    setOverridePlan(form.plan);
    setOverrideTokenMode(form.tokenMode);
    setOverrideTokenCustom(form.tokenCustom);
    setOverrideExpires(form.expires);
    setOverrideReason(form.reason);
  };

  const closeOverride = () => setOverrideTarget(null);

  const submitOverride = async () => {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      toast({ title: t("errors.reasonRequired"), variant: "destructive" });
      return;
    }
    let monthlyTokenLimit: number | "unlimited" | null | undefined;
    if (overrideTokenMode === "default") {
      monthlyTokenLimit = null;
    } else if (overrideTokenMode === "unlimited") {
      monthlyTokenLimit = "unlimited";
    } else {
      const n = Number(overrideTokenCustom);
      if (!Number.isInteger(n) || n <= 0) {
        toast({ title: t("errors.customLimitMustBePositive"), variant: "destructive" });
        return;
      }
      monthlyTokenLimit = n;
    }

    // Date input gives us yyyy-mm-dd; treat as end-of-day UTC so the trial
    // runs through that calendar day in every timezone.
    let expiresAt: string | null = null;
    if (overrideExpires) {
      const d = new Date(`${overrideExpires}T23:59:59.999Z`);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        toast({ title: t("errors.expiryMustBeFuture"), variant: "destructive" });
        return;
      }
      expiresAt = d.toISOString();
    }

    try {
      setSavingOverride(true);
      await setPlanOverride(overrideTarget.id, {
        planSlug: overridePlan === "keep" ? null : overridePlan,
        monthlyTokenLimit,
        expiresAt,
        reason: overrideReason.trim(),
      });
      toast({ title: t("messages.overrideApplied", { name: overrideTarget.name }) });
      setOverrideTarget(null);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.failedToApplyOverride"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingOverride(false);
    }
  };

  return {
    overrideTarget,
    overridePlan,
    setOverridePlan,
    overrideTokenMode,
    setOverrideTokenMode,
    overrideTokenCustom,
    setOverrideTokenCustom,
    overrideExpires,
    setOverrideExpires,
    overrideReason,
    setOverrideReason,
    savingOverride,
    openOverride,
    closeOverride,
    submitOverride,
  };
}
