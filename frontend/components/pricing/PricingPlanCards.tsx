// /pricing Free + Pro plan cards. Pure presentation: every number and copy
// key comes from the page (live price config, persona copy, cart action).
// For job seekers the Pro card leads with the one Pro offer — no watermark,
// unlimited social posting, an AI agent that posts for you.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { USER_ROLES, type UserRole } from "@/lib/auth";
import MonoChip from "@/components/templates/MonoChip";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { formatUsdPrice } from "@shared/pricing";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

const MAX_SEATS = 20;

const PRO_OFFER_KEYS = ["pricing.offer.noWatermark", "pricing.offer.unlimitedPosting", "pricing.offer.agent"] as const;

interface PlanCopy {
  freeDescriptionKey: string;
  proDescriptionKey: string;
  unitLabelKey: string;
  userCountLabelKey: string | null;
}

interface Props {
  persona: UserRole;
  copy: PlanCopy;
  freeFeatures: string[];
  proFeatures: string[];
  isAnnual: boolean;
  isAuthenticated: boolean;
  selectedUsers: number;
  onSelectedUsersChange: (n: number) => void;
  /** Total for `users` seats; annual = discounted yearly total. */
  calculatePrice: (users: number, annual: boolean) => number;
  onAddToCart: () => void;
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((feat) => (
        <li key={feat} className="flex items-start gap-2.5 text-[15px] text-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
          <span>{feat}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPlanCards({
  persona,
  copy,
  freeFeatures,
  proFeatures,
  isAnnual,
  isAuthenticated,
  selectedUsers,
  onSelectedUsersChange,
  calculatePrice,
  onAddToCart,
}: Props) {
  const { t, i18n } = useTranslation();
  const perPeriodAmount = isAnnual
    ? calculatePrice(selectedUsers, true) / 12
    : calculatePrice(selectedUsers, false);
  const perPeriod = perPeriodAmount.toFixed(2);
  const perPeriodLabel = formatUsdPrice(perPeriodAmount, i18n.language);
  const yearlySaving = (calculatePrice(selectedUsers, false) * 12 - calculatePrice(selectedUsers, true)).toFixed(2);
  const isJobSeeker = persona === USER_ROLES.JOB_SEEKER;
  // Hiring personas on: job seekers get the ink offer box above the long
  // feature list. Job-seeker-only product: the short Pro list already
  // carries the offer, so the box would only repeat it.
  const showOfferBox = isJobSeeker && HIRING_PERSONAS_ENABLED;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-5">
      {/* Free */}
      <section className="flex flex-col gap-6 rounded-[20px] border border-border bg-card p-7" aria-labelledby="plan-free">
        <div className="flex flex-col gap-3">
          <h2 id="plan-free" className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
            {t("labels.free")}
          </h2>
          <p className="font-display text-[56px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
            {formatUsdPrice(0, i18n.language)}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">{t(copy.freeDescriptionKey)}</p>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <MonoChip className="self-start">{t("marketing.pricing.whatsIncluded")}</MonoChip>
          <FeatureList items={freeFeatures} />
        </div>
        {!isAuthenticated ? (
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to="/signup">{t("actions.getStarted")}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" className="w-full">
            {t("marketing.pricing.currentPlan")}
          </Button>
        )}
      </section>

      {/* Pro */}
      <section
        className="relative flex flex-col gap-6 rounded-[20px] border-2 border-primary bg-card p-7"
        aria-labelledby="plan-pro"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="plan-pro" className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
              {t("labels.proBadge")}
            </h2>
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-primary-foreground">
              {t("marketing.pricing.mostPopular")}
            </span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[56px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
              {perPeriodLabel}
            </span>
            <span className="text-base text-muted-foreground">
              / {t(copy.unitLabelKey)}
              {isAnnual ? ` ${t("marketing.pricing.billedAnnually")}` : ""}
            </span>
          </p>
          {isAnnual && (
            <p className="font-mono text-sm text-brand-green-text">
              {t("marketing.pricing.saveAmountPerYear", { amount: yearlySaving })}
            </p>
          )}

          {/* Seats selector only for recruiter/employer */}
          {!isJobSeeker && (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="user-select">
                {copy.userCountLabelKey ? t(copy.userCountLabelKey) : t("marketing.pricing.numberOfUsers")}:
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onSelectedUsersChange(Math.max(1, selectedUsers - 1))}
                  disabled={selectedUsers <= 1}
                  className="h-11 w-11"
                  aria-label={t("pricing.seats.decrease")}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Select value={selectedUsers.toString()} onValueChange={(v) => onSelectedUsersChange(parseInt(v))}>
                  <SelectTrigger id="user-select" className="h-11 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: MAX_SEATS }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onSelectedUsersChange(Math.min(MAX_SEATS, selectedUsers + 1))}
                  disabled={selectedUsers >= MAX_SEATS}
                  className="h-11 w-11"
                  aria-label={t("pricing.seats.increase")}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          <p className="text-base leading-relaxed text-muted-foreground">{t(copy.proDescriptionKey)}</p>
        </div>

        {/* The one job-seeker Pro offer, ahead of the long feature list. */}
        {showOfferBox && (
          <ul className="flex flex-col gap-2.5 rounded-2xl bg-ink p-5 text-ink-foreground">
            {PRO_OFFER_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-[15px] font-semibold">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-positive" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-1 flex-col gap-3">
          <MonoChip className="self-start">
            {t(HIRING_PERSONAS_ENABLED ? "marketing.pricing.allFreePlus" : "marketing.pricing.whatsIncluded")}
          </MonoChip>
          <FeatureList items={proFeatures} />
        </div>

        {!isAuthenticated ? (
          <Link to="/signup" className={`${HERO_CTA_PRIMARY} w-full`}>
            {t("actions.getStarted")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" onClick={onAddToCart} className={`${HERO_CTA_PRIMARY} w-full`}>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {t("marketing.pricing.addToCartPerMonth", { amount: perPeriod })}
          </button>
        )}
      </section>
    </div>
  );
}
