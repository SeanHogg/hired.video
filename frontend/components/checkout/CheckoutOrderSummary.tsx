/**
 * Order summary card for /checkout — cart lines, subtotal / tax / total and
 * the refund note. Presentational: the page owns the cart + totals.
 */
import { Calendar, CheckCircle2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MonoChip from "@/components/templates/MonoChip";
import type { CartItem } from "@/lib/cart-context";

interface CheckoutOrderSummaryProps {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function OrderLine({ item }: { item: CartItem }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start justify-between gap-4 py-4 first:pt-0">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{item.name}</p>
        {item.type === "template" ? (
          <p className="text-sm text-muted-foreground">{t("messages.checkout.oneTimeResumeTemplate")}</p>
        ) : item.type === "service" || item.type === "voice_clone" ? (
          <p className="text-sm text-muted-foreground">{t("messages.checkout.oneTimePurchase")}</p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("messages.checkout.userCount", { count: item.users })}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.billingCycle === "annual"
                ? t("labels.checkout.annualBilling")
                : t("labels.checkout.monthlyBilling")}
              {item.billingCycle === "annual" && (
                <MonoChip tone="free">{t("marketing.pricing.billing.save20")}</MonoChip>
              )}
            </p>
          </>
        )}
      </div>
      <div className="text-right">
        <p className="font-mono font-semibold">
          {item.price > 0 ? money(item.price) : t("labels.free")}
          {item.type === "plan" &&
            (item.billingCycle === "annual" ? t("labels.checkout.perYear") : t("labels.checkout.perMonth"))}
        </p>
        {item.quantity > 1 && item.type === "plan" && (
          <p className="text-sm text-muted-foreground">{t("labels.checkout.qty", { count: item.quantity })}</p>
        )}
      </div>
    </li>
  );
}

export function CheckoutOrderSummary({ items, subtotal, tax, total }: CheckoutOrderSummaryProps) {
  const { t } = useTranslation();
  return (
    <Card className="lg:sticky lg:top-24">
      <CardHeader>
        <CardTitle className="text-xl">{t("headings.checkout.orderSummary")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <OrderLine key={item.id} item={item} />
          ))}
        </ul>

        <dl className="space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("labels.checkout.subtotal")}</dt>
            <dd className="font-mono">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("labels.checkout.taxLabel")}</dt>
            <dd className="font-mono">{money(tax)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <dt className="font-display text-lg font-bold">{t("labels.checkout.totalLabel")}</dt>
            <dd className="font-mono text-lg font-semibold">{money(total)}</dd>
          </div>
        </dl>

        <div className="rounded-2xl bg-brand-green/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-green-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("labels.checkout.moneyBackGuarantee")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("messages.checkout.refundWithin30")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("messages.checkout.consumptionNonRefundable")}{" "}
            <Link to="/terms-of-service" className="font-semibold text-primary hover:underline">
              {t("labels.tos")}
            </Link>{" "}
            {t("messages.checkout.forDetails")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
