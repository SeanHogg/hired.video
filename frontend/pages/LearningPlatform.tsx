import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import ContentHero from "@/components/content/ContentHero";
import { CONTENT_CARD, ICON_TILE, TEXT_LINK } from "@/components/content/content-ui";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { HERO_CTA_PRIMARY, MarketingFinalCta } from "@/components/marketing/MarketingHero";
import MonoChip from "@/components/templates/MonoChip";
import { cn } from "@/lib/utils";
import { Upload, Download, ShieldCheck, Globe, Check, X, ArrowRightLeft, Boxes } from "lucide-react";

const FORMATS = ["SCORM 1.2", "SCORM 2004", "xAPI (Tin Can) 1.0.3", "AICC", "cmi5"];
const FAQ_IDS = ["q1", "q2", "q3", "q4", "q5", "q6"] as const;

/**
 * /learning-platform — marketing surface for the SCORM + xAPI hosting platform
 * (the SCORM-Cloud alternative). AppShell + useSEO + useBreadcrumbs +
 * MarketingFAQ, fully localized (.lms.* keys), theme tokens only, responsive
 * (the comparison table scrolls on narrow viewports).
 */
export default function LearningPlatform() {
  useSEO("/learning-platform");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("headings.lms.breadcrumb"), url: "/learning-platform" }]);

  const pillars = [
    { icon: Upload, title: t("headings.lms.importTitle"), body: t("messages.lms.importBody") },
    { icon: Download, title: t("headings.lms.exportTitle"), body: t("messages.lms.exportBody") },
    { icon: ShieldCheck, title: t("headings.lms.standardsTitle"), body: t("messages.lms.standardsBody") },
    { icon: Globe, title: t("headings.lms.thirdPartyTitle"), body: t("messages.lms.thirdPartyBody") },
  ];

  // Comparison rows: [feature label, we-include, they-include]. `true` renders a
  // check, `false` an x, a string renders as-is.
  const compareRows: Array<[string, boolean | string, boolean | string]> = [
    [t("messages.lms.cmpImport"), true, true],
    [t("messages.lms.cmpExport"), true, t("labels.lms.addon")],
    [t("messages.lms.cmpLrs"), true, true],
    [t("messages.lms.cmpForwarding"), true, true],
    [t("messages.lms.cmpThirdParty"), true, false],
    [t("messages.lms.cmpNoLockin"), true, false],
  ];

  const renderCell = (v: boolean | string) => {
    if (v === true) return <Check className="inline h-5 w-5 text-brand-green-text" aria-label={t("labels.lms.yes")} />;
    if (v === false) return <X className="inline h-5 w-5 text-muted-foreground" aria-label={t("labels.lms.no")} />;
    return <span className="font-mono text-xs uppercase text-muted-foreground">{v}</span>;
  };

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <ContentHero
          size="marketing"
          className="pb-16"
          eyebrow={
            <>
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("labels.lms.badge")}
            </>
          }
          title={t("headings.lms.heroTitle")}
          lede={t("messages.lms.heroSubtitle")}
        >
          <Link to="/pricing" className={HERO_CTA_PRIMARY}>
            {t("actions.lms.getStarted")}
          </Link>
          <a href="mailto:seanhogg@gmail.com?subject=Learning%20platform%20migration" className={TEXT_LINK}>
            {t("actions.lms.talkToUs")}
          </a>
        </ContentHero>

        {/* Value pillars + supported formats */}
        <MarketingBand tone="card" className="flex flex-col gap-8">
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
            {pillars.map((p) => (
              <li key={p.title} className={cn(CONTENT_CARD, "flex flex-col gap-3 bg-background p-6")}>
                <span className={ICON_TILE}>
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold text-foreground">{p.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
          <div className={cn(CONTENT_CARD, "flex flex-col gap-3 bg-background p-6")}>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Boxes className="h-5 w-5 text-primary" aria-hidden="true" /> {t("headings.lms.formatsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("messages.lms.formatsBody")}</p>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <MonoChip key={f}>{f}</MonoChip>
              ))}
            </div>
          </div>
        </MarketingBand>

        {/* Comparison vs SCORM Cloud */}
        <MarketingBand tone="page" className="flex flex-col gap-8">
          <MarketingSectionIntro title={t("headings.lms.compareTitle")} subtitle={t("messages.lms.compareSubtitle")} />
          <div className={cn(CONTENT_CARD, "overflow-x-auto")}>
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3.5 font-mono text-xs font-medium uppercase text-muted-foreground">{t("labels.lms.feature")}</th>
                  <th className="px-5 py-3.5 text-center font-mono text-xs font-medium uppercase text-foreground">{t("labels.lms.us")}</th>
                  <th className="px-5 py-3.5 text-center font-mono text-xs font-medium uppercase text-muted-foreground">{t("labels.lms.them")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {compareRows.map(([label, us, them]) => (
                  <tr key={label}>
                    <td className="px-5 py-3.5 text-sm text-foreground">{label}</td>
                    <td className="px-5 py-3.5 text-center">{renderCell(us)}</td>
                    <td className="px-5 py-3.5 text-center">{renderCell(them)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MarketingBand>

        <MarketingFAQ
          variant="plain"
          schemaId="learning-platform"
          subheading={t("faq.lms.subheading")}
          items={FAQ_IDS.map((id) => ({ question: t(`faq.lms.${id}.q`), answer: t(`faq.lms.${id}.a`) }))}
        />

        {/* Final CTA */}
        <MarketingFinalCta
          id="learning-platform"
          title={t("headings.lms.ctaTitle")}
          subtitle={t("messages.lms.ctaBody")}
          actions={
            <Link to="/pricing" className={HERO_CTA_PRIMARY}>
              {t("actions.lms.getStarted")}
            </Link>
          }
        />
      </main>
    </AppShell>
  );
}
