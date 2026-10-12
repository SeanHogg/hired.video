// SuperAdmin: one coupon code — usage, copy code / share link, activate or
// deactivate, and the redemption list on demand.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Copy, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { couponRedeemUrl, couponService } from "@/lib/services/coupon-service";
import type { CouponDTO } from "@shared/coupons";
import { CouponRedemptionList } from "./CouponRedemptionList";

type CouponState = "active" | "inactive" | "expired" | "exhausted";

function stateOf(c: CouponDTO): CouponState {
  if (!c.isActive) return "inactive";
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) return "expired";
  if (c.maxRedemptions != null && c.redemptionCount >= c.maxRedemptions) return "exhausted";
  return "active";
}

export function CouponListItem({ coupon, onChanged }: { coupon: CouponDTO; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const toggle = useMutation({
    mutationFn: () => couponService.adminUpdate(coupon.id, { isActive: !coupon.isActive }),
    onSettled: onChanged,
  });
  const state = stateOf(coupon);

  const copy = async (text: string, doneKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t(doneKey) });
    } catch {
      toast({ title: t("admin.coupons.copyFailed"), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-all font-mono text-lg font-semibold tracking-wider text-foreground">{coupon.code}</p>
            <p className="text-xs text-muted-foreground">
              {t("admin.coupons.summary", { count: coupon.durationDays })}
              {" · "}
              {coupon.maxRedemptions == null
                ? t("admin.coupons.usedUnlimited", { used: coupon.redemptionCount })
                : t("admin.coupons.usedOf", { used: coupon.redemptionCount, max: coupon.maxRedemptions })}
              {coupon.expiresAt &&
                ` · ${t("admin.coupons.expires", { date: new Date(coupon.expiresAt).toLocaleDateString(i18n.language) })}`}
            </p>
            {coupon.note && <p className="mt-1 break-words text-sm text-muted-foreground">{coupon.note}</p>}
          </div>
          <Badge variant={state === "active" ? "default" : "secondary"}>{t(`admin.coupons.state.${state}`)}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(coupon.code, "admin.coupons.codeCopied")}>
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t("admin.coupons.copyCode")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => copy(couponRedeemUrl(coupon.code), "admin.coupons.linkCopied")}>
            <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t("admin.coupons.copyLink")}
          </Button>
          <Button size="sm" variant={coupon.isActive ? "ghost" : "default"} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            {t(coupon.isActive ? "admin.coupons.deactivate" : "admin.coupons.activate")}
          </Button>
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
            {t("admin.coupons.redemptions", { count: coupon.redemptionCount })}
          </Button>
        </div>

        {toggle.isError && <p role="alert" className="text-sm text-destructive">{t("admin.coupons.updateFailed")}</p>}
        {open && <CouponRedemptionList couponId={coupon.id} />}
      </CardContent>
    </Card>
  );
}
