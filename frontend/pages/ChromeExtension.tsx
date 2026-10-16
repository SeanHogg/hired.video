import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import {
  MarketingHero,
  MarketingFinalCta,
  HERO_CTA_PRIMARY,
  HERO_CTA_LINK,
} from "@/components/marketing/MarketingHero";
import ExtensionDetailBand from "@/components/chrome-extension/ExtensionDetailBand";
import ExtensionLensCards from "@/components/chrome-extension/ExtensionLensCards";
import ExtensionPairVerb from "@/components/chrome-extension/ExtensionPairVerb";
import { useChromeExtensionCopy } from "@/components/chrome-extension/use-chrome-extension-copy";
import { CHROME_EXTENSION_STORE_URL } from "@/lib/chrome-extension";
import { ArrowRight, Check, Chrome, Download } from "lucide-react";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

const SUPPORTED_SITES = [
  "LinkedIn",
  "Indeed",
  "Glassdoor",
  "GitHub",
  "ZipRecruiter",
  "Monster",
  "CareerBuilder",
  "Dice",
  "SimplyHired",
  "Lever",
  "Greenhouse",
  "Workday",
  "Wellfound",
  "Built In",
];

/** ONE Chrome extension, three lenses (job seeker / recruiter / sales & social). */
export default function ChromeExtension() {
  const { t } = useTranslation();
  useSEO("/chrome-extension");
  useBreadcrumbs([{ name: t("labels.chromeExtension.breadcrumb"), url: "/chrome-extension" }]);
  const { lenses, everyLens, verbs, faq } = useChromeExtensionCopy();

  const install = (label: string, Icon: typeof Download, trailing = false) => (
    <a href={CHROME_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" className={HERO_CTA_PRIMARY}>
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
      {trailing && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
    </a>
  );

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("chromeExtension.one.eyebrow")}
          title={t("chromeExtension.one.heroTitle")}
          subtitle={t("chromeExtension.one.heroBody")}
          actions={
            <>
              {install(t("chromeExtension.one.install"), Download)}
              <a href="#lenses" className={HERO_CTA_LINK}>
                {t("chromeExtension.one.seeLenses")}
              </a>
            </>
          }
        />

        <ExtensionLensCards lenses={lenses} />

        <ExtensionPairVerb verbs={verbs} />

        {lenses.map((lens, i) => (
          <ExtensionDetailBand
            key={lens.id}
            tone={i % 2 === 0 ? "card" : "page"}
            anchorId={lens.id}
            id={`chrome-${lens.id}-heading`}
            chip={lens.chip}
            title={lens.band.title}
            subtitle={lens.band.subtitle}
            items={lens.band.items}
          />
        ))}

        <ExtensionDetailBand
          tone="page"
          id="chrome-every-heading"
          chip={t("chromeExtension.one.band.every.chip")}
          title={t("chromeExtension.one.band.every.title")}
          subtitle={t("chromeExtension.one.band.every.subtitle")}
          items={everyLens}
        />

        <MarketingBand tone="card" labelledBy="chrome-sites-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="chrome-sites-heading"
            title={t("chromeExtension.one.sitesTitle")}
            subtitle={t("chromeExtension.one.sitesBody")}
          />
          <ul className="flex flex-wrap gap-2.5">
            {SUPPORTED_SITES.map((site) => (
              <li
                key={site}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-background px-4 text-[15px] font-medium text-foreground"
              >
                <Check className="h-4 w-4 text-brand-green-text" aria-hidden="true" />
                {site}
              </li>
            ))}
          </ul>
        </MarketingBand>

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          schemaId="chrome-extension"
          subheading={t("chromeExtension.one.faqSubheading")}
          items={faq}
        />

        <MarketingFinalCta
          kicker={<MantraKicker />}
          footer={<BuildCtaFooter />}
          title={t("chromeExtension.one.finalTitle")}
          subtitle={t("chromeExtension.one.finalBody")}
          actions={install(t("chromeExtension.one.install"), Chrome, true)}
        />
      </main>
    </AppShell>
  );
}
