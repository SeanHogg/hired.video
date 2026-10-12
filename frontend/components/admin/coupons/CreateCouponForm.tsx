// SuperAdmin: issue a coupon code (shared/coupons.ts). Code is optional —
// left blank the server generates one. Default grant is a free month of Pro.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { couponService } from "@/lib/services/coupon-service";
import { apiServerErrorCode } from "@/lib/api-error-code";
import {
  COUPON_CODE_MAX,
  COUPON_DEFAULT_DURATION_DAYS,
  COUPON_MAX_DURATION_DAYS,
  normalizeCouponCode,
} from "@shared/coupons";

/** A date input's local day → the last instant of that day (ISO). */
function endOfLocalDay(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export function CreateCouponForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [durationDays, setDurationDays] = useState(String(COUPON_DEFAULT_DURATION_DAYS));
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () =>
      couponService.adminCreate({
        ...(code.trim() ? { code: normalizeCouponCode(code) } : {}),
        durationDays: Number(durationDays),
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        expiresAt: expiresOn ? endOfLocalDay(expiresOn) : null,
        note: note.trim(),
      }),
    onSuccess: () => {
      setCode("");
      setMaxRedemptions("");
      setExpiresOn("");
      setNote("");
      onCreated();
    },
  });

  const days = Number(durationDays);
  const valid = Number.isInteger(days) && days >= 1 && days <= COUPON_MAX_DURATION_DAYS;

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t("admin.coupons.createTitle")}</h2>
        <form
          className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coupon-code">{t("admin.coupons.field.code")}</Label>
            <Input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={COUPON_CODE_MAX}
              placeholder={t("admin.coupons.field.codePlaceholder")}
              className="font-mono uppercase"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coupon-days">{t("admin.coupons.field.durationDays")}</Label>
            <Input
              id="coupon-days"
              type="number"
              min={1}
              max={COUPON_MAX_DURATION_DAYS}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coupon-max">{t("admin.coupons.field.maxRedemptions")}</Label>
            <Input
              id="coupon-max"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder={t("admin.coupons.field.unlimited")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coupon-expires">{t("admin.coupons.field.expiresOn")}</Label>
            <Input id="coupon-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="coupon-note">{t("admin.coupons.field.note")}</Label>
            <Input
              id="coupon-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={t("admin.coupons.field.notePlaceholder")}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!valid || create.isPending} className="w-full sm:w-auto">
              {create.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {t("admin.coupons.create")}
            </Button>
          </div>
        </form>
        {create.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {apiServerErrorCode(create.error) === "CODE_TAKEN"
              ? t("admin.coupons.codeTaken")
              : t("admin.coupons.createFailed")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
