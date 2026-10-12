import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingAddressForm } from "@/components/billing/BillingAddressForm";
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary";
import {
  CheckoutPaymentMethod,
  type CheckoutPaymentMethodType,
} from "@/components/checkout/CheckoutPaymentMethod";
import { AppShell } from "@/components/AppShell";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { profileService } from "@/lib/services/profile-service";
import { billingService } from "@/lib/services/billing-service";
import { unlockTemplate, recordPurchaseOnServer } from "@/lib/template-unlocks";
import { TIER_COPY, TIER_NAME } from "@shared/tier-copy";
import {
  BillingAddressSchema,
  EMPTY_BILLING_ADDRESS,
  type BillingAddress,
} from "@shared/billing-address";
import { toast } from "sonner";

/** The license a cart line records. Cart lines are `template:<kind>:<id>`
 *  (useApplyTemplate's cartIdFor). Every paid template is a creator studio
 *  template — résumé ones included — so older lines (`template:<slug>`, or a
 *  bare id) are studio grants too; the API resolves a slug to its id. */
function parseTemplateCartId(id: string): { kind: "studio" | "job"; templateId: string } {
  const rest = id.startsWith("template:") ? id.slice("template:".length) : id;
  const sepIdx = rest.indexOf(":");
  const head = sepIdx === -1 ? "" : rest.slice(0, sepIdx);
  if (head === "job") return { kind: "job", templateId: rest.slice(sepIdx + 1) };
  if (head === "studio" || head === "resume") return { kind: "studio", templateId: rest.slice(sepIdx + 1) };
  return { kind: "studio", templateId: rest };
}

export default function Checkout() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { items, getTotalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startPayment } = usePaymentFlow();

  useSEO("/checkout");
  useBreadcrumbs([
    { name: t("labels.pricing"), url: "/pricing" },
    { name: t("headings.checkout.title"), url: "/checkout" },
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [address, setAddress] = useState<BillingAddress>({
    ...EMPTY_BILLING_ADDRESS,
    fullName: user?.name ?? "",
  });
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof BillingAddress, string>>>({});
  const [addressLoading, setAddressLoading] = useState(true);
  const [paymentMethodType, setPaymentMethodType] = useState<CheckoutPaymentMethodType>("card");

  // Load saved address — pre-fills the form so returning customers don't
  // re-type their details every checkout.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setAddressLoading(true);
    profileService
      .getBillingAddress()
      .then((saved) => {
        if (cancelled) return;
        if (saved) setAddress(saved);
      })
      .catch(() => {
        // Silent — empty form is the right fallback.
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Redirect if not authenticated.
  useEffect(() => {
    if (!isAuthenticated) navigate("/login?redirect=/checkout");
  }, [isAuthenticated, navigate]);

  // Redirect if cart is empty.
  useEffect(() => {
    if (isAuthenticated && items.length === 0) navigate("/pricing");
  }, [items.length, isAuthenticated, navigate]);

  // Handle cancellation from payment provider redirect.
  useEffect(() => {
    const cancelled = searchParams.get("cancelled");
    if (cancelled === "true") {
      toast.error(t("messages.checkout.paymentCancelled"));
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("cancelled");
      const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams, t]);

  const fulfillTemplates = () => {
    for (const item of items) {
      if (item.type !== "template") continue;
      const { kind, templateId } = parseTemplateCartId(item.id);
      unlockTemplate(templateId, kind);
      void recordPurchaseOnServer({
        kind,
        templateId,
        pricePaidCents: Math.round(item.price * 100),
        paymentRef: null,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // $0 cart — skip payment entirely. Address still optional in this branch.
      if (getTotalPrice() === 0) {
        fulfillTemplates();
        clearCart();
        toast.success(t("messages.checkout.templatesUnlocked"));
        navigate("/resumes");
        return;
      }

      // Validate the address up front so the user fixes typos before the
      // payment modal opens. Field-level errors render inline next to each
      // input via the form component.
      const parsed = BillingAddressSchema.safeParse(address);
      if (!parsed.success) {
        const fieldErrors: Partial<Record<keyof BillingAddress, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof BillingAddress | undefined;
          if (key) fieldErrors[key] = issue.message;
        }
        setAddressErrors(fieldErrors);
        setIsProcessing(false);
        toast.error(t("messages.checkout.completeBillingAddress"));
        return;
      }
      setAddressErrors({});

      // Persist the address before opening the payment modal so the user
      // doesn't lose it if the modal is cancelled. Settings → Billing reads
      // from the same column, so the changes show up there immediately.
      try {
        await profileService.saveBillingAddress(parsed.data);
      } catch {
        // Save errors are non-blocking — the user can still pay.
      }

      await startPayment({
        amount: finalTotal,
        currency: "USD",
        paymentMethodType,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/checkout?cancelled=true`,
        onSuccess: async (data) => {
          // Persist the card-on-file so the user sees it in Settings →
          // Payment Methods next time. Helcim has no /cards/{token}
          // lookup, so we forward the masked metadata HelcimPay reported.
          // Best-effort — payment already succeeded, so don't block fulfilment
          // on this call.
          if (data.paymentMethodToken) {
            try {
              await billingService.savePaymentMethod({
                paymentMethodId: data.paymentMethodToken,
                setDefault: true,
                type: paymentMethodType,
                brand: data.cardBrand,
                last4: data.last4,
              });
            } catch {
              // Silent — the user can re-add it later from Settings.
            }
          }
          fulfillTemplates();
          clearCart();
          toast.success(t("messages.checkout.paymentSuccess", { welcome: TIER_COPY.welcomeAfterCheckout() }));
          navigate("/dashboard");
        },
        onError: (msg) => {
          toast.error(msg || t("messages.checkout.paymentFailed"));
          setIsProcessing(false);
        },
      });
    } catch (error) {
      console.error("Payment processing error:", error);
      toast.error(t("messages.checkout.paymentFailed"));
      setIsProcessing(false);
    }
  };

  const totalPrice = getTotalPrice();
  const tax = totalPrice * 0.08; // 8% tax
  const finalTotal = totalPrice + tax;

  if (!isAuthenticated) return null;
  if (items.length === 0) return null;

  return (
    <AppShell bgClassName="bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 md:py-12">
        <header className="mb-8 flex flex-col gap-3">
          <Link
            to="/pricing"
            className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("actions.checkout.backToPricing")}
          </Link>
          <h1 className="font-display text-[clamp(32px,4vw,48px)] font-bold leading-[1.02] tracking-[-0.03em]">
            {t("headings.checkout.title")}
          </h1>
          <p className="max-w-[40em] text-base leading-relaxed text-muted-foreground">
            {t("messages.checkout.completeUpgrade", { tier: TIER_NAME.pro })}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          {/* Order summary */}
          <div className="lg:order-2">
            <CheckoutOrderSummary items={items} subtotal={totalPrice} tax={tax} total={finalTotal} />
          </div>

          {/* Payment form */}
          <div className="lg:order-1">
            <form onSubmit={handleSubmit} className="space-y-6">
              {finalTotal === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <CheckCircle2 className="h-5 w-5 text-brand-green-text" aria-hidden="true" />
                      {t("headings.checkout.noPaymentRequired")}
                    </CardTitle>
                    <CardDescription>{t("messages.checkout.zeroTotalDesc")}</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {finalTotal > 0 && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl">{t("headings.checkout.billingAddress")}</CardTitle>
                      <CardDescription>{t("messages.checkout.billingAddressDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BillingAddressForm
                        value={address}
                        onChange={setAddress}
                        errors={addressErrors}
                        disabled={isProcessing || addressLoading}
                      />
                    </CardContent>
                  </Card>

                  <CheckoutPaymentMethod value={paymentMethodType} onChange={setPaymentMethodType} />
                </>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={isProcessing || addressLoading}>
                {isProcessing ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
                      aria-hidden="true"
                    />
                    {t("status.checkout.processingPayment")}
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    {finalTotal === 0
                      ? t("actions.checkout.completeFreeOrder")
                      : t("actions.checkout.completePurchaseAmount", { amount: finalTotal.toFixed(2) })}
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                {t("messages.checkout.agreePrefix")}{" "}
                <Link to="/terms" className="font-semibold text-primary hover:underline">
                  {t("labels.tos")}
                </Link>{" "}
                {t("messages.checkout.agreeAnd")}{" "}
                <Link to="/privacy" className="font-semibold text-primary hover:underline">
                  {t("labels.privacyPolicy")}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
