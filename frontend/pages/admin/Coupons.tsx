// /admin/billing?view=coupons — SuperAdmin coupon codes. Each code grants a
// time-boxed Pro comp (default: a free month) covering résumé creation,
// cover letters, video résumés and promotion. Chrome comes from
// <AdminLayout> at the route.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { couponService } from "@/lib/services/coupon-service";
import { CreateCouponForm } from "@/components/admin/coupons/CreateCouponForm";
import { CouponListItem } from "@/components/admin/coupons/CouponListItem";

const COUPONS_KEY = ["admin", "coupons"] as const;

export default function Coupons() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: COUPONS_KEY, queryFn: () => couponService.adminList() });
  const refresh = () => qc.invalidateQueries({ queryKey: COUPONS_KEY });
  const coupons = listQ.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("admin.coupons.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.coupons.subtitle")}</p>
      </header>

      <div className="mb-6">
        <CreateCouponForm onCreated={refresh} />
      </div>

      {listQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("admin.coupons.loading")}
        </p>
      ) : listQ.isError ? (
        <p className="text-sm text-destructive">{t("admin.coupons.loadFailed")}</p>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.coupons.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {coupons.map((c) => (
            <li key={c.id}>
              <CouponListItem coupon={c} onChanged={refresh} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
