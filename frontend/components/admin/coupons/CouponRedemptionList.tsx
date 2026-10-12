// SuperAdmin: who redeemed one coupon code, newest first.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { couponService } from "@/lib/services/coupon-service";

export function CouponRedemptionList({ couponId }: { couponId: string }) {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ["admin", "coupons", couponId, "redemptions"],
    queryFn: () => couponService.adminRedemptions(couponId),
  });
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  if (q.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("admin.coupons.loading")}
      </p>
    );
  }
  if (q.isError) return <p className="text-sm text-destructive">{t("admin.coupons.loadFailed")}</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("admin.coupons.noRedemptions")}</p>;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
          <span className="min-w-0 break-all text-foreground">{r.name || r.email || r.userId}</span>
          <span className="text-xs text-muted-foreground">
            {t("admin.coupons.redeemedOn", { redeemed: fmt(r.redeemedAt), until: fmt(r.grantedUntil) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
