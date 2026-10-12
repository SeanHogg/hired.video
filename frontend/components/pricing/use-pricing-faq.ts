// /pricing FAQ items. Job-seeker questions always; recruiter / team /
// People Ops questions only while the hiring personas are enabled.
// Prices are passed in (live config) and formatted — never literal numbers.

import { useTranslation } from "react-i18next";
import {
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  TOKEN_PACKS,
  formatUsdPrice,
} from "@shared/pricing";
import { formatTokens } from "@/hooks/use-token-budget";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

interface FaqItem {
  question: string;
  answer: string;
}

export function usePricingFaqItems(monthly: number, yearly: number): FaqItem[] {
  const { t, i18n } = useTranslation();
  // Token copy is interpolated from shared/pricing.ts so it can't drift.
  const cheapestPack = TOKEN_PACKS[0];
  const tokenFacts = {
    free: formatTokens(FREE_AI_MONTHLY_TOKENS),
    pro: formatTokens(PRO_AI_MONTHLY_TOKENS),
    packPrice: formatUsdPrice(cheapestPack.price, i18n.language),
    packTokens: formatTokens(cheapestPack.tokens),
  };

  if (HIRING_PERSONAS_ENABLED) {
    return [
      { question: t("faq.pricing.cost.q"), answer: t("faq.pricing.cost.a", { monthly, yearly }) },
      { question: t("faq.pricing.freePlan.q"), answer: t("faq.pricing.freePlan.a") },
      { question: t("faq.pricing.tryPro.q"), answer: t("faq.pricing.tryPro.a") },
      { question: t("faq.pricing.tokens.q"), answer: t("faq.pricing.tokens.a", tokenFacts) },
      { question: t("faq.pricing.teamPricing.q"), answer: t("faq.pricing.teamPricing.a") },
      { question: t("faq.pricing.peopleOps.q"), answer: t("faq.pricing.peopleOps.a") },
      { question: t("faq.pricing.cancel.q"), answer: t("faq.pricing.cancel.a") },
      {
        question: t("faq.pricing.annualDiscount.q"),
        answer: t("faq.pricing.annualDiscount.a", {
          monthly,
          yearly,
          monthlyEquivalent: (yearly / 12).toFixed(2),
        }),
      },
    ];
  }

  const fmt = (n: number) => formatUsdPrice(n, i18n.language);
  const prices = { monthly: fmt(monthly), yearly: fmt(yearly), monthlyEquivalent: fmt(yearly / 12) };
  return [
    { question: t("faq.pricing.cost.q"), answer: t("pricing.js.faq.cost.a", prices) },
    { question: t("faq.pricing.freePlan.q"), answer: t("pricing.js.faq.free.a") },
    { question: t("pricing.js.faq.watermark.q"), answer: t("pricing.js.faq.watermark.a") },
    { question: t("pricing.js.faq.channels.q"), answer: t("pricing.js.faq.channels.a") },
    { question: t("pricing.js.faq.agent.q"), answer: t("pricing.js.faq.agent.a") },
    { question: t("pricing.js.faq.tokens.q"), answer: t("pricing.js.faq.tokens.a", tokenFacts) },
    { question: t("faq.pricing.cancel.q"), answer: t("faq.pricing.cancel.a") },
    { question: t("faq.pricing.annualDiscount.q"), answer: t("pricing.js.faq.annual.a", prices) },
  ];
}
