import React, { useEffect, Suspense } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Users,
  Heart,
  Zap,
  Globe,
  Award,
  Coffee,
  Gamepad2,
  GraduationCap,
  Plane,
} from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import {
  MarketingHero,
  MarketingFinalCta,
  HERO_CTA_PRIMARY,
  HERO_CTA_LINK,
  INK_CTA_LINK,
} from "@/components/marketing/MarketingHero";
import IconCard from "@/components/marketing/IconCard";
import { AppShell } from "@/components/AppShell";
// Lazy-load the heavy jobs control to avoid blocking LCP
const CompanyCareersControl = React.lazy(() =>
  import("@/components/careers/CompanyCareersControl").then((m) => ({
    default: m.CompanyCareersControl,
  }))
);
// Lightweight skeleton for jobs section
function JobsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 rounded-xl bg-muted" />
      <div className="h-24 rounded-[20px] bg-muted" />
      <div className="h-24 rounded-[20px] bg-muted" />
      <div className="h-24 rounded-[20px] bg-muted" />
    </div>
  );
}

function DeferredJobs() {
  const [show, setShow] = React.useState(false);
  useEffect(() => {
    const run = () => setShow(true);
    // Defer until idle or next tick to avoid blocking LCP
    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(run);
    } else {
      setTimeout(run, 1);
    }
  }, []);

  if (!show) return <JobsSkeleton />;
  return (
    <Suspense fallback={<JobsSkeleton />}>
      <CompanyCareersControl
        companyId="hired-video-company"
        showCompanyHeader={false}
        showFilters={true}
        showSearch={true}
        viewMode="table"
      />
    </Suspense>
  );
}

export default function Careers() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.careers"), url: "/careers" }]);


  const benefits = [
    { key: "innovation", icon: Zap },
    { key: "remote", icon: Globe },
    { key: "growth", icon: GraduationCap },
    { key: "health", icon: Heart },
    { key: "timeOff", icon: Plane },
    { key: "equity", icon: Award },
  ];

  const perks = [
    { key: "coffee", icon: Coffee },
    { key: "games", icon: Gamepad2 },
    { key: "team", icon: Users },
    { key: "offices", icon: Building2 },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("careers.js.eyebrow")}
          title={
            <>
              {t("marketing.careers.heroTitle1")}{" "}
              <span className="text-primary">{t("careers.js.heroTitle2")}</span>
            </>
          }
          subtitle={t("careers.js.heroSubtitle")}
          actions={
            <>
              <a href="#open-positions" className={HERO_CTA_PRIMARY}>
                {t("actions.viewOpenPositions")}
              </a>
              <a href="#company-culture" className={HERO_CTA_LINK}>
                {t("actions.learnAboutCulture")}
              </a>
            </>
          }
        />


        {/* Why work with us */}
        <MarketingBand id="company-culture" labelledBy="careers-why-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="careers-why-heading"
            title={t("careers.js.whyTitle")}
            subtitle={t("careers.js.whySubtitle")}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
            {benefits.map((b) => (
              <IconCard
                key={b.key}
                icon={b.icon}
                title={t(`marketing.careers.benefits.${b.key}.title`)}
                body={t(`marketing.careers.benefits.${b.key}.desc`)}
              />
            ))}
          </div>
        </MarketingBand>

        {/* Perks */}
        <MarketingBand tone="card" labelledBy="careers-perks-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="careers-perks-heading"
            title={t("careers.js.perksTitle")}
            subtitle={t("marketing.careers.perksSubtitle")}
          />
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
            {perks.map((p) => (
              <li key={p.key} className="flex items-center gap-3 rounded-[20px] border border-border p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-[15px] font-medium text-foreground">{t(`marketing.careers.perks.${p.key}`)}</span>
              </li>
            ))}
          </ul>
        </MarketingBand>

        {/* Open positions */}
        <MarketingBand id="open-positions" labelledBy="careers-open-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="careers-open-heading"
            title={t("marketing.careers.openPositions")}
            subtitle={t("careers.js.openPositionsDesc")}
          />
          {/* Defer heavy jobs section to after first paint */}
          <DeferredJobs />
        </MarketingBand>

        {/* Application process */}
        <MarketingBand tone="card" labelledBy="careers-process-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="careers-process-heading"
            title={t("marketing.careers.process.title")}
            subtitle={t("marketing.careers.process.subtitle")}
          />
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="flex flex-col gap-2 rounded-[20px] border border-border p-6">
                <span className="font-mono text-sm font-bold text-primary">{String(n).padStart(2, "0")}</span>
                <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">
                  {t(`marketing.careers.process.step${n}.title`)}
                </h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`marketing.careers.process.step${n}.desc`)}
                </p>
              </li>
            ))}
          </ol>
        </MarketingBand>

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          className="mx-auto max-w-[820px] px-6 py-20"
          schemaId="careers"
          subheading={t("marketing.careers.faq.subheading")}
          items={[
            { question: t("marketing.careers.faq.remote.q"), answer: t("careers.js.faq.remoteA") },
            { question: t("marketing.careers.faq.benefits.q"), answer: t("marketing.careers.faq.benefits.a") },
            { question: t("marketing.careers.faq.duration.q"), answer: t("marketing.careers.faq.duration.a") },
            { question: t("marketing.careers.faq.visa.q"), answer: t("marketing.careers.faq.visa.a") },
          ]}
        />

        <MarketingFinalCta
          title={t("marketing.careers.cta.title")}
          subtitle={t("marketing.careers.cta.desc")}
          actions={
            <>
              <a href="mailto:careers@hired.video" className={HERO_CTA_PRIMARY}>
                {t("marketing.careers.cta.sendResume")}
              </a>
              <Link to="/contact" className={INK_CTA_LINK}>
                {t("headings.help.getInTouch")}
              </Link>
            </>
          }
        />
      </main>
    </AppShell>
  );
}
