import { CheckCircle2, ArrowRight, CreditCard } from "lucide-react";
import { formatTokens } from "@/hooks/use-token-budget";
import { PRO_AI_MONTHLY_TOKENS } from "@shared/pricing";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { AuthStatusIcon } from "@/components/auth/AuthCard";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { toast } from "sonner";
import { trackSubscription } from "@/lib/gtm";
import { TIER_COPY, TIER_ID } from "@shared/tier-copy";

const PERK_KEYS = ["aiTokens", "templates", "support", "analytics"] as const;

export default function CheckoutSuccess() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { clearCart } = useCart();
  const navigate = useNavigate();

  useSEO("/checkout/success");
  useBreadcrumbs([
    { name: t("headings.checkout.title"), url: "/checkout" },
    { name: t("checkoutSuccess.title"), url: "/checkout/success" },
  ]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/checkout");
    }
  }, [isAuthenticated, navigate]);

  // Handle successful payment setup
  useEffect(() => {
    if (isAuthenticated) {
      // Clear the cart since payment setup was successful
      clearCart();
      trackSubscription(TIER_ID.pro, "monthly", 49);
      toast.success(t("messages.checkout.paymentSuccess", { welcome: TIER_COPY.welcomeAfterCheckout() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, clearCart]);

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-8 px-4 py-12 text-center sm:px-6 md:py-20">
        <AuthStatusIcon icon={CheckCircle2} tone="success" className="h-16 w-16 rounded-2xl" />

        <div className="flex flex-col items-center gap-4">
          <h1 className="font-display text-[clamp(36px,5vw,60px)] font-bold leading-[0.98] tracking-[-0.035em]">
            {t("checkoutSuccess.title")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">{TIER_COPY.paymentConfirmed()}</p>
        </div>

        <section className="w-full rounded-[20px] border border-border bg-card p-6 text-left sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em]">{TIER_COPY.proAccessGranted()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{TIER_COPY.proExploreInvitation()}</p>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PERK_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                <span>{t(`checkoutSuccess.perk.${key}`, { tokens: formatTokens(PRO_AI_MONTHLY_TOKENS) })}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg">
            <Link to="/dashboard">
              {t("checkoutSuccess.goToDashboard")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/settings?tab=billing">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {t("checkoutSuccess.manageBilling")}
            </Link>
          </Button>
        </div>

        <p className="max-w-xl text-sm text-muted-foreground">{t("checkoutSuccess.footnote")}</p>
      </div>
    </AppShell>
  );
}
