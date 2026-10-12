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
  INK_CTA_LINK,
} from "@/components/marketing/MarketingHero";
import MonoChip from "@/components/templates/MonoChip";
import ExtensionDetailBand from "@/components/chrome-extension/ExtensionDetailBand";
import {
  RECRUITER_STORE_URL,
  useRecruiterExtensionCopy,
} from "@/components/chrome-extension/use-recruiter-extension-copy";
import {
  Chrome,
  Zap,
  Target,
  FileText,
  Check,
  ArrowRight,
  Download,
  Briefcase,
  Users,
  ListChecks,
  TrendingUp,
  Shield,
} from "lucide-react";
import { TIER_COPY } from "@shared/tier-copy";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

const JOBSEEKER_STORE_URL =
  "https://chromewebstore.google.com/detail/hired.video-job-seeker/ohjmknhokdkgfmgbblflmliefoegciol";

const JOB_SITES = [
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

// Copy that differs by persona switch. Job-seeker-only product (flag off):
// one extension, job-seeker copy. Hiring personas on: both extensions.
const COPY = HIRING_PERSONAS_ENABLED
  ? {
      eyebrow: "labels.chromeExtensions",
      hero: "messages.chromeExtension.hero",
      supportedSites: "messages.chromeExtension.supportedSites",
      faqSubheading: "messages.chromeExtension.faqSubheading",
      faqFreeA: "messages.chromeExtension.faqFreeA",
      faqAccountA: "messages.chromeExtension.faqAccountA",
      faqScoreA: "messages.chromeExtension.faqScoreA",
      finalTitle: "headings.chromeExtension.finalCta",
      finalBody: "messages.chromeExtension.finalCta",
    }
  : {
      eyebrow: "labels.chromeExtension.breadcrumb",
      hero: "chromeExtension.js.hero",
      supportedSites: "chromeExtension.js.supportedSites",
      faqSubheading: "chromeExtension.js.faqSubheading",
      faqFreeA: "chromeExtension.js.faqFreeA",
      faqAccountA: "chromeExtension.js.faqAccountA",
      faqScoreA: "chromeExtension.js.faqScoreA",
      finalTitle: "chromeExtension.js.finalTitle",
      finalBody: "chromeExtension.js.finalBody",
    };

export default function ChromeExtension() {
  const { t } = useTranslation();
  useSEO("/chrome-extension");
  useBreadcrumbs([{ name: t("labels.chromeExtension.breadcrumb"), url: "/chrome-extension" }]);
  const recruiter = useRecruiterExtensionCopy();

  const jobSeekerFeatures = [
    t("messages.chromeExtension.jsFeatTrack"),
    t("messages.chromeExtension.jsFeatScore"),
    t("messages.chromeExtension.jsFeatTailor"),
    t("messages.chromeExtension.jsFeatApplication"),
    t("messages.chromeExtension.jsFeatSidePanel"),
  ];

  const jobSeekerDetails = [
    { id: "track", icon: Target, key: "jsTrack" },
    { id: "score", icon: TrendingUp, key: "jsScore" },
    { id: "tailor", icon: FileText, key: "jsTailor" },
    { id: "application", icon: ListChecks, key: "jsApplication" },
    { id: "autodetect", icon: Zap, key: "jsAutoDetect" },
    { id: "privacy", icon: Shield, key: "jsPrivacy" },
  ].map((d) => ({
    id: d.id,
    icon: d.icon,
    title: t(`headings.chromeExtension.${d.key}`),
    desc: t(`messages.chromeExtension.${d.key}`),
  }));

  const plugins = [
    {
      id: "job-seeker",
      icon: Briefcase,
      chip: t("labels.chromeExtension.jobSeeker"),
      title: t("headings.chromeExtension.jobSeekerCard"),
      desc: t("messages.chromeExtension.jobSeekerCard"),
      features: jobSeekerFeatures,
      href: JOBSEEKER_STORE_URL,
      install: t("actions.chromeExtension.installJobSeekerExtension"),
    },
    // Recruiter / company extension — hiring personas only.
    ...(HIRING_PERSONAS_ENABLED
      ? [
          {
            id: "recruiter",
            icon: Users,
            chip: t("labels.chromeExtension.recruiterEmployer"),
            title: t("headings.chromeExtension.recruiterCard"),
            desc: t("messages.chromeExtension.recruiterCard"),
            features: recruiter.features,
            href: RECRUITER_STORE_URL,
            install: t("actions.chromeExtension.installRecruiterExtension"),
          },
        ]
      : []),
  ];

  const faqItems = [
    {
      question: t("headings.chromeExtension.faqFreeQ"),
      answer: HIRING_PERSONAS_ENABLED
        ? `${t(COPY.faqFreeA)} ${TIER_COPY.proFeaturesGatedNote()}`
        : t(COPY.faqFreeA),
    },
    ...(HIRING_PERSONAS_ENABLED
      ? [
          { question: t("headings.chromeExtension.faqLoxoQ"), answer: t("messages.chromeExtension.faqLoxoA") },
          { question: t("headings.chromeExtension.faqCallQ"), answer: t("messages.chromeExtension.faqCallA") },
        ]
      : []),
    { question: t("headings.chromeExtension.faqSitesQ"), answer: t("messages.chromeExtension.faqSitesA") },
    { question: t("headings.chromeExtension.faqAccountQ"), answer: t(COPY.faqAccountA) },
    { question: t("headings.chromeExtension.faqScoreQ"), answer: t(COPY.faqScoreA) },
    { question: t("headings.chromeExtension.faqPrivacyQ"), answer: t("messages.chromeExtension.faqPrivacyA") },
    { question: t("headings.chromeExtension.faqBrowserQ"), answer: t("messages.chromeExtension.faqBrowserA") },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t(COPY.eyebrow)}
          title={t("headings.chromeExtension.hero")}
          subtitle={t(COPY.hero)}
          actions={
            HIRING_PERSONAS_ENABLED ? (
              <>
                <a href="#job-seeker" className={HERO_CTA_PRIMARY}>
                  <Briefcase className="h-5 w-5" aria-hidden="true" />
                  {t("actions.chromeExtension.forJobSeekers")}
                </a>
                <a href="#recruiter" className={HERO_CTA_LINK}>
                  {t("actions.chromeExtension.forRecruiters")}
                </a>
              </>
            ) : (
              <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer" className={HERO_CTA_PRIMARY}>
                <Download className="h-5 w-5" aria-hidden="true" />
                {t("actions.chromeExtension.installJobSeekerExtension")}
              </a>
            )
          }
        />

        {/* Plugin cards (two while the hiring personas are on) */}
        <MarketingBand tone="card">
          <div
            className={`grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5 ${
              plugins.length === 1 ? "max-w-[720px]" : ""
            }`}
          >
            {plugins.map((p) => (
              <article
                key={p.id}
                id={p.id}
                className="flex scroll-mt-20 flex-col gap-4 rounded-[20px] border border-border bg-background p-6"
              >
                <MonoChip className="self-start">{p.chip}</MonoChip>
                <h2 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                  {p.title}
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground">{p.desc}</p>
                <ul className="flex flex-1 flex-col gap-2">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <a href={p.href} target="_blank" rel="noopener noreferrer" className={`${HERO_CTA_PRIMARY} w-full`}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {p.install}
                </a>
              </article>
            ))}
          </div>
        </MarketingBand>

        {/* Job seeker feature detail */}
        <ExtensionDetailBand
          tone="page"
          id="chrome-js-heading"
          chip={t("labels.chromeExtension.jobSeekerExtension")}
          title={t("headings.chromeExtension.jobSeekerDetail")}
          subtitle={t("messages.chromeExtension.jobSeekerDetail")}
          items={jobSeekerDetails}
        />

        {/* Recruiter feature detail — hiring personas only */}
        {HIRING_PERSONAS_ENABLED && (
          <ExtensionDetailBand
            tone="card"
            id="chrome-rec-heading"
            chip={t("labels.chromeExtension.recruiterExtension")}
            title={t("headings.chromeExtension.recruiterDetail")}
            subtitle={t("messages.chromeExtension.recruiterDetail")}
            items={recruiter.details}
          />
        )}

        {/* Supported sites */}
        <MarketingBand
          tone={HIRING_PERSONAS_ENABLED ? "page" : "card"}
          labelledBy="chrome-sites-heading"
          className="flex flex-col gap-8"
        >
          <MarketingSectionIntro
            id="chrome-sites-heading"
            title={t("headings.chromeExtension.supportedSites")}
            subtitle={t(COPY.supportedSites)}
          />
          <ul className="flex flex-wrap gap-2.5">
            {JOB_SITES.map((site) => (
              <li
                key={site}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-card px-4 text-[15px] font-medium text-foreground"
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
          subheading={t(COPY.faqSubheading)}
          items={faqItems}
        />

        <MarketingFinalCta
          kicker={<MantraKicker />}
          footer={<BuildCtaFooter />}
          title={t(COPY.finalTitle)}
          subtitle={t(COPY.finalBody)}
          actions={
            <>
              <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer" className={HERO_CTA_PRIMARY}>
                <Chrome className="h-5 w-5" aria-hidden="true" />
                {t("actions.chromeExtension.installJobSeeker")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
              {HIRING_PERSONAS_ENABLED && (
                <a href={RECRUITER_STORE_URL} target="_blank" rel="noopener noreferrer" className={INK_CTA_LINK}>
                  {t("actions.chromeExtension.installRecruiter")}
                </a>
              )}
            </>
          }
        />
      </main>
    </AppShell>
  );
}
