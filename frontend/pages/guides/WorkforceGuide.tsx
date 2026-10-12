/**
 * Workforce & Timesheet how-to (#1349 #1476). Step-by-step walkthrough
 * of the agency back-office — invite → punch → submit → approve →
 * invoice → margin → docs. Rendered through the shared GuideLayout.
 */
import {
  ArrowRight,
  UserPlus,
  Clock,
  Send,
  ClipboardCheck,
  DollarSign,
  FileText,
  Plug,
  Printer,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import GuideLayout, { type GuideStep } from "@/components/guides/GuideLayout";
import { ReadingCtaCard } from "@/components/content/ReadingLayout";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { SEAT_PRICE_CENTS } from "@shared/pricing";

const STEPS = [
  { id: "s1", icon: UserPlus, cta: { key: "s1.cta", to: "/settings?tab=account-billing" } },
  { id: "s2", icon: Clock, cta: { key: "s2.cta", to: "/tasks?surface=timesheet" } },
  { id: "s3", icon: Send },
  { id: "s4", icon: ClipboardCheck, cta: { key: "s4.cta", to: "/settings?tab=workforce" } },
  { id: "s5", icon: DollarSign },
  { id: "s6", icon: TrendingUp },
  { id: "s7", icon: FileText },
  { id: "s8", icon: Plug },
  { id: "s9", icon: Printer },
] as const;

export default function WorkforceGuide() {
  const { t, i18n } = useTranslation();
  useSEO("/guides/workforce");
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.workforce.breadcrumbGuides"), url: "/guides/getting-started" },
    { name: t("guides.workforce.breadcrumb"), url: "/guides/workforce" },
  ]);

  const seatPrice = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(
    SEAT_PRICE_CENTS / 100,
  );
  const steps: GuideStep[] = STEPS.map((step) => ({
    icon: step.icon,
    title: t(`guides.workforce.${step.id}.title`),
    body: t(`guides.workforce.${step.id}.body`, { price: seatPrice }),
    cta: "cta" in step ? { label: t(`guides.workforce.${step.cta.key}`), to: step.cta.to } : undefined,
  }));

  return (
    <GuideLayout
      title={t("guides.workforce.title")}
      lede={t("guides.workforce.lede")}
      steps={steps}
      footer={
        <ReadingCtaCard
          title={t("guides.workforce.tourTitle")}
          body={t("guides.workforce.tourBody")}
          action={
            <Link to="/for-agencies" className={HERO_CTA_PRIMARY}>
              {t("guides.workforce.tourCta")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      }
    />
  );
}
