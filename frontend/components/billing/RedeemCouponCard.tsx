// Redeem a SuperAdmin coupon code for a time-boxed Pro comp (shared/coupons.ts).
// Self-gating: renders nothing for signed-out / guest users or anyone a code
// can't help (paid plan, trial, staff, permanent comp — `canRedeemCoupon`).
// Prefills from `?coupon=CODE` so a shared link lands ready to redeem:
//   /settings?tab=billing&coupon=CODE

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useSubscription, SUBSCRIPTION_CACHE_KEY } from "@/lib/hooks/useSubscription";
import { TOKEN_BUDGET_CACHE_KEY } from "@/hooks/use-token-budget";
import { refreshSharedResource } from "@/hooks/use-gated-resource";
import { couponService, couponRedeemErrorKey } from "@/lib/services/coupon-service";
import { canRedeemCoupon, COUPON_CODE_MAX, normalizeCouponCode } from "@shared/coupons";

interface RedeemCouponCardProps {
  /** Called after a successful redemption — e.g. to reload a billing view
   *  that fetches the plan itself. Shared plan/token hooks refresh on their own. */
  onRedeemed?: () => void;
  className?: string;
}

export function RedeemCouponCard({ onRedeemed, className }: RedeemCouponCardProps) {
  const { t, i18n } = useTranslation();
  const { user, isGuest } = useAuth();
  const subscription = useSubscription();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(() => normalizeCouponCode(searchParams.get("coupon") ?? ""));

  const redeem = useMutation({
    mutationFn: (value: string) => couponService.redeem(value),
    onSuccess: async () => {
      setCode("");
      await Promise.all([
        refreshSharedResource(SUBSCRIPTION_CACHE_KEY),
        refreshSharedResource(TOKEN_BUDGET_CACHE_KEY),
      ]);
      onRedeemed?.();
    },
  });

  if (!user || isGuest || subscription.loading) return null;
  if (!canRedeemCoupon(subscription) && !redeem.isSuccess) return null;

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { dateStyle: "long" });
  const trimmed = normalizeCouponCode(code);

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{t("billing.redeem.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("billing.redeem.subtitle")}</p>
          </div>
        </div>

        {subscription.compedUntil && (
          <p className="text-sm text-foreground">
            {t("billing.redeem.activeUntil", { date: formatDate(subscription.compedUntil) })}
          </p>
        )}

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) redeem.mutate(trimmed);
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={COUPON_CODE_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("billing.redeem.placeholder")}
            aria-label={t("billing.redeem.label")}
            className="min-w-0 flex-1 basis-48 font-mono uppercase tracking-wider"
          />
          <Button type="submit" disabled={!trimmed || redeem.isPending}>
            {redeem.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("billing.redeem.submit")}
          </Button>
        </form>

        {redeem.isSuccess && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {t("billing.redeem.success", { date: formatDate(redeem.data.grantedUntil) })}
          </p>
        )}
        {redeem.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t(couponRedeemErrorKey(redeem.error))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
