/**
 * /resume-guide/:jobSlug — programmatic resume guide for one role: intro,
 * salary range, key skills, tips, common mistakes, then the AI coaching
 * hand-off. Data: /api/discovery/seo/resume-guide/:jobSlug.
 */
import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { SeoCrumbs } from "@/components/landing/SeoCrumbs";
import { formatUsd, slugToTitle } from "@/components/landing/seo-format";
import { apiClient } from "@/lib/api-client";
import { aiCoachHref } from "@/lib/ai-context";

interface ResumeGuide {
  jobTitle: string;
  headline: string;
  introduction: string;
  keySkills: string[];
  resumeTips: string[];
  commonMistakes: string[];
  salaryRange: { min: number; max: number; currency: string; source: string };
  generatedAt: string;
}

const LIST_CARD = "flex flex-col gap-5 rounded-[20px] border border-border bg-card p-6";

export default function ResumeGuidePage() {
  const { t, i18n } = useTranslation();
  const { jobSlug } = useParams<{ jobSlug: string }>();
  const location = useLocation();
  const [guide, setGuide] = useState<ResumeGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const title = guide?.jobTitle ?? slugToTitle(jobSlug ?? "");
  const guideTitle = t("seoLanding.resumeGuide.title", { role: title });

  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("seoLanding.resumeGuide.crumbResumes"), url: "/resumes" },
    { name: guideTitle, url: `/resume-guide/${jobSlug ?? ""}` },
  ]);

  useEffect(() => {
    if (!jobSlug) return;
    setLoading(true);
    setError(false);
    apiClient
      .get(`/api/discovery/seo/resume-guide/${jobSlug}`, null as any)
      .then((res: any) => setGuide(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [jobSlug]);

  return (
    <AppShell bgClassName="bg-background">
      <SeoCrumbs
        items={[
          { label: t("labels.home"), to: "/" },
          { label: t("labels.jobs"), to: "/jobs" },
          { label: guideTitle },
        ]}
      />
      <SeoHero
        className="pt-8"
        eyebrow={t("seoLanding.resumeGuide.eyebrow")}
        title={guideTitle}
        lede={guide && !loading ? guide.introduction : t("seoLanding.resumeGuide.lede", { role: title })}
        secondary={{ to: "/tools/resume-roast", label: t("seoLanding.resumeGuide.roast") }}
      />

      {loading && (
        <div className="flex justify-center pb-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label={t("status.loading")} />
        </div>
      )}

      {error && (
        <MarketingBand tone="card" className="py-12 sm:py-14">
          <p className="text-muted-foreground">
            {t("seoLanding.resumeGuide.unavailable")}{" "}
            <Link to="/tools/resume-roast" className="font-semibold text-primary hover:underline">
              {t("seoLanding.resumeGuide.roastInstead")}
            </Link>
          </p>
        </MarketingBand>
      )}

      {guide && !loading && (
        <>
          <MarketingBand tone="card" className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-5">
            {/* Salary range */}
            <div className="flex flex-col gap-2 rounded-[20px] bg-ink p-6 text-ink-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                {t("seoLanding.resumeGuide.salaryRange")}
              </span>
              <p className="font-display text-[clamp(32px,4vw,48px)] font-bold leading-none tracking-[-0.03em] text-ink-positive">
                {formatUsd(guide.salaryRange.min, i18n.language)} – {formatUsd(guide.salaryRange.max, i18n.language)}
              </p>
              <p className="text-sm text-ink-muted">{guide.salaryRange.source}</p>
            </div>

            {/* Key skills */}
            <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-background p-6">
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("seoLanding.resumeGuide.keySkills")}</h2>
              <ul className="flex flex-wrap gap-2">
                {guide.keySkills.map((skill) => (
                  <li key={skill}>
                    <MonoChip className="px-2.5 py-1 text-xs">{skill}</MonoChip>
                  </li>
                ))}
              </ul>
            </div>
          </MarketingBand>

          <MarketingBand className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-5">
            <div className={LIST_CARD}>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
                {t("seoLanding.resumeGuide.tips", { role: title })}
              </h2>
              <ul className="flex flex-col gap-3">
                {guide.resumeTips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-brand-green-text" aria-hidden="true" />
                    <span className="text-[15px] leading-relaxed text-foreground">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={LIST_CARD}>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("seoLanding.resumeGuide.mistakes")}</h2>
              <ul className="flex flex-col gap-3">
                {guide.commonMistakes.map((mistake, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 flex-none text-destructive" aria-hidden="true" />
                    <span className="text-[15px] leading-relaxed text-foreground">{mistake}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="col-span-full font-mono text-xs text-muted-foreground">
              {t("seoLanding.resumeGuide.updated", { date: new Date(guide.generatedAt).toLocaleDateString(i18n.language) })}
            </p>
          </MarketingBand>
        </>
      )}

      <MarketingBand tone="card" labelledBy="guide-coach-title" className="flex flex-wrap items-end justify-between gap-6">
        <MarketingSectionIntro
          id="guide-coach-title"
          title={t("seoLanding.resumeGuide.coachTitle")}
          subtitle={t("seoLanding.resumeGuide.coachBody", { role: title })}
        />
        <Link
          to={aiCoachHref(`Help me tailor my resume for a ${title} role`)}
          className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline"
        >
          {t("seoLanding.common.askCoach")}
        </Link>
      </MarketingBand>

      <SeoFinalCta
        id="resume-guide"
        title={t("landing.final.title")}
        secondary={{ to: "/tools/resume-roast", label: t("seoLanding.resumeGuide.roast") }}
      />
    </AppShell>
  );
}
