/**
 * Payment-method picker card for /checkout (card vs. ACH bank account) plus
 * the matching security note. Presentational: the page owns the selection.
 */
import { Building2, CreditCard, Lock, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type CheckoutPaymentMethodType = "card" | "us_bank_account";

const OPTIONS: ReadonlyArray<{ value: CheckoutPaymentMethodType; icon: typeof CreditCard; labelKey: string }> = [
  { value: "card", icon: CreditCard, labelKey: "labels.checkout.creditDebitCard" },
  { value: "us_bank_account", icon: Building2, labelKey: "labels.checkout.bankAccountAch" },
];

export function CheckoutPaymentMethod({
  value,
  onChange,
}: {
  value: CheckoutPaymentMethodType;
  onChange: (next: CheckoutPaymentMethodType) => void;
}) {
  const { t } = useTranslation();
  const isCard = value === "card";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("headings.checkout.paymentMethod")}</CardTitle>
        <CardDescription>{t("messages.checkout.paymentMethodDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as CheckoutPaymentMethodType)}
          className="grid gap-3 sm:grid-cols-2"
        >
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const id = `pm-${o.value === "card" ? "card" : "bank"}`;
            return (
              <Label
                key={o.value}
                htmlFor={id}
                className={cn(
                  "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
                  value === o.value ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted",
                )}
              >
                <RadioGroupItem value={o.value} id={id} />
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(o.labelKey)}
              </Label>
            );
          })}
        </RadioGroup>

        <div className="rounded-2xl bg-muted p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {isCard ? (
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            )}
            {isCard ? t("headings.checkout.secureCardPayment") : t("labels.checkout.bankAccountAch")}
          </p>
          <p className="mb-3 text-sm text-muted-foreground">
            {isCard ? t("messages.checkout.cardWindowNote") : t("messages.checkout.achNote")}
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{isCard ? t("messages.checkout.pciCompliant") : t("messages.checkout.achLowerFees")}</p>
            <p>{isCard ? t("messages.checkout.sslEncryption") : t("messages.checkout.achBankSecurity")}</p>
          </div>
        </div>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("messages.checkout.paymentSecure")}</span>
        </p>
      </CardContent>
    </Card>
  );
}
