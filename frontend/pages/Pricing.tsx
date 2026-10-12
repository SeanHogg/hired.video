// /pricing — plans + FAQ for the job-seeker product. While the hiring
// personas are enabled (HIRING_PERSONAS_ENABLED) it also shows the persona
// toggle, the long Free-vs-Pro comparison table, the shared competitor
// comparison and the B2B support cards. Sections live in components/pricing/*.
import { Users, Building2, Shield, Briefcase, Clock, Sparkles } from "lucide-react";
import {
  PRO_MONTHLY_PRICE as PRO_MONTHLY_PRICE_DEFAULT,
  formatUsdPrice,
  PRO_YEARLY_PRICE as PRO_YEARLY_PRICE_DEFAULT,
  PRO_AI_MONTHLY_TOKENS,
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";
import {
  UPGRADE_REGISTRY,
  parseUpgradeSlug,
  type UpgradeSlug,
} from "@shared/upgrade-slugs";
import { pricingConfigService } from "@/lib/services/pricing-config-service";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs, generatePricingSchema } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import CompetitorComparison from "@/components/CompetitorComparison";
import { EyebrowChip } from "@/components/marketing/MarketingHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import MonoChip from "@/components/templates/MonoChip";
import PricingPlanCards from "@/components/pricing/PricingPlanCards";
import { RedeemCouponCard } from "@/components/billing/RedeemCouponCard";
import { PERSONA_COPY, JOB_SEEKER_PLAN_COPY } from "@/components/pricing/persona-copy";
import PricingComparisonTable from "@/components/pricing/PricingComparisonTable";
import PricingSupportCards from "@/components/pricing/PricingSupportCards";
import { usePricingFaqItems } from "@/components/pricing/use-pricing-faq";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppShell } from "@/components/AppShell";
import type { UserRole } from "@/lib/auth";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  // Live prices from the runtime config (admin-editable). Fall back to the
  // shared/pricing.ts compile-time defaults until the fetch resolves.
  const [basePrice, setBasePrice] = useState<number>(PRO_MONTHLY_PRICE_DEFAULT);
  const [PRO_YEARLY_PRICE, setProYearlyPrice] = useState<number>(PRO_YEARLY_PRICE_DEFAULT);
  useEffect(() => {
    let cancelled = false;
    pricingConfigService
      .get()
      .then((cfg) => {
        if (cancelled) return;
        setBasePrice(cfg.proMonthlyCents / 100);
        setProYearlyPrice(cfg.proYearlyCents / 100);
      })
      .catch(() => {
        // Stick with defaults — pricing is still correct, just compile-time.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // SEO for pricing page — includes Product/Offer structured data for rich snippets
  useSEO(location.pathname, {
    structuredData: generatePricingSchema([
      {
        name: "Free",
        description: t(JOB_SEEKER_PLAN_COPY.freeDescriptionKey),
        monthlyPrice: 0,
      },
      {
        name: "Pro",
        description: t(JOB_SEEKER_PLAN_COPY.proDescriptionKey),
        monthlyPrice: basePrice,
        annualPrice: PRO_YEARLY_PRICE,
      },
    ]),
  });
  useBreadcrumbs([{ name: t("pricing.eyebrow"), url: "/pricing" }]);
  const { isAuthenticated, user } = useAuth();
  const { addItem, openCart } = useCart();

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false);
  // Persona state — defaults to the authenticated user's role so each visitor
  // lands on plans tailored to their persona; fall back to Job Seeker for
  // anonymous traffic. Only the three customer-facing roles have pricing
  // tiers, so admin / superadmin / hiring-team roles also fall back.
  // Job-seeker-only product (HIRING_PERSONAS_ENABLED off): always job seeker.
  const [persona, setPersona] = useState<UserRole>(() => {
    if (!HIRING_PERSONAS_ENABLED) return USER_ROLES.JOB_SEEKER;
    const role = user?.role as UserRole | undefined;
    if (role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER) return role;
    return USER_ROLES.JOB_SEEKER;
  });
  // If the user logs in / impersonates a role after the page mounts, follow.
  useEffect(() => {
    if (!HIRING_PERSONAS_ENABLED) return;
    const role = user?.role as UserRole | undefined;
    if (role === USER_ROLES.JOB_SEEKER || role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER) {
      setPersona(role);
    }
  }, [user?.role]);

  // One copy line per persona today — keep the inbox quota + add-on price
  // in one string so changing either reaches every plan card simultaneously.
  // "per user" suffix only renders on personas where Pro is billed per-seat.
  // One copy line per persona today. The "scope" variant carries the
  // per-seat / per-user qualifier so changing the quota or add-on price
  // reaches every plan card simultaneously.
  const inboxSyncFeature = (
    scope: "none" | "perSeat" | "perUser" = "none",
  ): string =>
    t(`messages.pricing.inboxSyncFeature.${scope}`, {
      count: INBOX_SYNC_INCLUDED_ACCOUNTS,
      price: INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
    });

  const personaCopy = PERSONA_COPY;

  // Resolve the active persona's copy once per render. Feature arrays come
  // from the catalogue via returnObjects; the inbox-sync line is appended
  // for personas that bundle it into Pro.
  const activeCopy = personaCopy[persona]!;
  const resolveFeatures = (key: string): string[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as string[]) : [];
  };
  // Job-seeker-only product: short value lists (<= 6 bullets) per plan.
  const planCopy = HIRING_PERSONAS_ENABLED
    ? activeCopy
    : {
        ...activeCopy,
        freeDescriptionKey: JOB_SEEKER_PLAN_COPY.freeDescriptionKey,
        proDescriptionKey: JOB_SEEKER_PLAN_COPY.proDescriptionKey,
      };
  const proTokensLabel = new Intl.NumberFormat(i18n.language, { notation: "compact" }).format(PRO_AI_MONTHLY_TOKENS);
  const freeFeatures = HIRING_PERSONAS_ENABLED
    ? resolveFeatures(activeCopy.freeFeaturesKey)
    : JOB_SEEKER_PLAN_COPY.freeFeatureKeys.map((k) => t(k));
  const proFeatures = HIRING_PERSONAS_ENABLED
    ? [
        ...resolveFeatures(activeCopy.proFeaturesKey),
        ...(activeCopy.inboxScope !== "none" ? [inboxSyncFeature(activeCopy.inboxScope)] : []),
      ]
    : [
        ...JOB_SEEKER_PLAN_COPY.proFeatureKeys.map((k) => t(k)),
        t(JOB_SEEKER_PLAN_COPY.proTokensKey, { tokens: proTokensLabel }),
      ];
  const faqItems = usePricingFaqItems(basePrice, PRO_YEARLY_PRICE);

  const [selectedUsers, setSelectedUsers] = useState(1);
  // Default persona from logged-in user if available
  useEffect(() => {
    if (!HIRING_PERSONAS_ENABLED) return;
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (
          u?.role === USER_ROLES.JOB_SEEKER ||
          u?.role === USER_ROLES.RECRUITER ||
          u?.role === USER_ROLES.EMPLOYER
        ) {
          setPersona(u.role as UserRole);
        }
      } catch (_) {}
    }
  }, []);

  const calculatePrice = (users: number, annual: boolean) => {
    const monthlyTotal = basePrice * users;
    if (annual) {
      return monthlyTotal * 12 * 0.8; // 20% discount for annual
    }
    return monthlyTotal;
  };

  const handleAddToCart = () => {
    addItem({
      id: `pro-${selectedUsers}-${isAnnual ? "annual" : "monthly"}`,
      name: t("marketing.pricing.proPlanName"),
      price: calculatePrice(selectedUsers, isAnnual),
      type: "plan",
      billingCycle: isAnnual ? "annual" : "monthly",
      users: selectedUsers,
    });
    openCart();
  };

  // `/pricing?upgrade=<slug>` deep-links from gated features land here with
  // a slug identifying which feature the user hit. Server-side gates that
  // can't render a 402 envelope (top-level browser navigations like the
  // email-integration OAuth `/connect`) redirect through this. The registry
  // now lives in `shared/upgrade-slugs.ts` so every gate, the API redirects,
  // and the Pricing page agree on the slug set and copy (gap #810).
  const upgradeSlug: UpgradeSlug | null = parseUpgradeSlug(
    new URLSearchParams(location.search).get("upgrade"),
  );
  const upgradeBanner = upgradeSlug ? UPGRADE_REGISTRY[upgradeSlug] : null;

  // Smooth-scroll the matching comparison-table row into view + highlight
  // it for ~3s so the user sees the exact line item that gates the feature
  // they were trying to use. Idempotent on slug change (multiple ?upgrade=
  // navigations within the same SPA mount re-fire). Pure DOM — no state.
  useEffect(() => {
    if (!upgradeBanner?.comparisonRowId) return;
    const id = upgradeBanner.comparisonRowId;
    // Defer one frame so the comparison table has mounted.
    const t = window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-upgrade-id="${id}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.setAttribute("data-upgrade-active", "true");
      // Strip the highlight after the animation completes so a later
      // navigation can re-trigger it.
      window.setTimeout(() => row.removeAttribute("data-upgrade-active"), 3000);
    }, 120);
    return () => window.clearTimeout(t);
  }, [upgradeBanner?.comparisonRowId]);

  const personaOptions = [
    { value: USER_ROLES.JOB_SEEKER, icon: Users, labelKey: "labels.jobSeeker" },
    { value: USER_ROLES.RECRUITER, icon: Briefcase, labelKey: "labels.recruiter" },
    { value: USER_ROLES.EMPLOYER, icon: Building2, labelKey: "labels.employer" },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-16 pt-12 sm:pb-20 sm:pt-16">
          <div className="flex flex-col gap-[22px]">
            <EyebrowChip>{t("pricing.eyebrow")}</EyebrowChip>
            <h1 className="font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
              {t(HIRING_PERSONAS_ENABLED ? "marketing.pricing.heroTitle" : "pricing.js.heroTitle")}
            </h1>
            <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
              {t(HIRING_PERSONAS_ENABLED ? "messages.pricing.heroSubtitleCompact" : "pricing.js.heroSubtitle", {
                price: formatUsdPrice(basePrice, i18n.language),
              })}
            </p>
            {HIRING_PERSONAS_ENABLED && persona === USER_ROLES.JOB_SEEKER && (
              <p className="max-w-[40em] text-base font-semibold text-foreground">
                {t("landing.steps.promote.pro", { price: formatUsdPrice(basePrice, i18n.language) })}
              </p>
            )}
          </div>

          {upgradeBanner && (
            <div className="flex items-start gap-3 rounded-[20px] border border-primary/30 bg-accent p-5">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-display text-lg font-bold text-foreground">{upgradeBanner.title}</p>
                <p className="text-sm text-muted-foreground">{upgradeBanner.description}</p>
              </div>
            </div>
          )}

          {/* Persona (hiring personas only) + billing controls */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {HIRING_PERSONAS_ENABLED && (
              <ToggleGroup
                type="single"
                value={persona}
                onValueChange={(v) => v && setPersona(v as UserRole)}
                className="gap-1 rounded-xl bg-muted p-1"
                aria-label={t("pricing.personaLabel")}
              >
                {personaOptions.map(({ value, icon: Icon, labelKey }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="min-h-[40px] rounded-[10px] px-3.5 text-sm font-semibold text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    <Icon className="mr-2 h-4 w-4" aria-hidden="true" /> {t(labelKey)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}

            <div className="flex items-center gap-3">
              <Label htmlFor="billing-toggle" className={!isAnnual ? "font-semibold" : "text-muted-foreground"}>
                {t("marketing.pricing.billing.monthly")}
              </Label>
              <Switch id="billing-toggle" checked={isAnnual} onCheckedChange={setIsAnnual} />
              <Label
                htmlFor="billing-toggle"
                className={`flex items-center gap-2 ${isAnnual ? "font-semibold" : "text-muted-foreground"}`}
              >
                {t("marketing.pricing.billing.annual")}
                <MonoChip tone="free">{t("marketing.pricing.billing.save20")}</MonoChip>
              </Label>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4" aria-hidden="true" />
                {t("marketing.pricing.noHiddenFees")}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {t("marketing.pricing.cancelAnytime")}
              </span>
            </div>
          </div>

          <PricingPlanCards
            persona={persona}
            copy={planCopy}
            freeFeatures={freeFeatures}
            proFeatures={proFeatures}
            isAnnual={isAnnual}
            isAuthenticated={isAuthenticated}
            selectedUsers={selectedUsers}
            onSelectedUsersChange={setSelectedUsers}
            calculatePrice={calculatePrice}
            onAddToCart={handleAddToCart}
          />

          {/* Signed-in free users with a code; self-hides for everyone else. */}
          <RedeemCouponCard className="max-w-xl" />
        </section>

        {HIRING_PERSONAS_ENABLED && (
          <>
            <PricingComparisonTable persona={persona} personaLabelKey={activeCopy.labelKey} />
            {/* How Hired.Video compares to LOXO / LinkedIn / Greenhouse /
                Bullhorn / HireVue / VidCruiter. Same component the dedicated
                /vs-competitors page renders — single source of truth. */}
            <CompetitorComparison eyebrow={t("messages.pricing.vsMarketEyebrow")} showSectionHeader />
            <PricingSupportCards />
          </>
        )}

        {/* FAQ — MarketingFAQ ships the FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          schemaId="pricing"
          heading={t("marketing.pricing.faqHeading")}
          subheading={t("marketing.pricing.faqSubheading")}
          items={faqItems}
        />

        <SeoFinalCta id="pricing-final-cta" title={t("pricing.js.finalCta.title")} body={t("pricing.js.finalCta.body")} />
      </main>
    </AppShell>
  );
}
