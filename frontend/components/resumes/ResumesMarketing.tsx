// Signed-out view of /resumes: video-resume pitch composed from the shared
// marketing primitives — hero (build CTA + featured video), feature cards,
// how-it-works steps, FAQ and the closing ink band.

import { useTranslation } from "react-i18next";
import { BarChart3, Eye, Share2, Sparkles, TrendingUp, Upload, Users, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import WatchFeaturedVideoButton from "@/components/WatchFeaturedVideoButton";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

const FAQ_COUNT = 8;

export default function ResumesMarketing() {
  const { t } = useTranslation();
  // Recruiter-facing claims (recruiter insights / access / search) follow the
  // hiring persona switch; job-seeker framing (views, share links) otherwise.
  const hiring = HIRING_PERSONAS_ENABLED;

  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => {
    const base = !hiring && i + 1 === 6 ? "resumesMarketing.seeker.faq6" : `faq.resumes.q${i + 1}`;
    return { question: t(`${base}.q`), answer: t(`${base}.a`) };
  });

  const networkCard = hiring
    ? {
        key: "network",
        icon: Users,
        title: t("labels.professionalNetwork"),
        description: t("messages.networkProDesc"),
        bullets: [t("labels.directRecruiterAccess"), t("labels.smartJobMatching"), t("labels.interviewScheduling")],
      }
    : {
        key: "share",
        icon: Share2,
        title: t("resumesMarketing.seeker.shareTitle"),
        description: t("resumesMarketing.seeker.shareDesc"),
        bullets: [t("resumesMarketing.seeker.shareSocial"), t("resumesMarketing.seeker.shareLinks"), t("labels.smartJobMatching")],
      };

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t("labels.videoResumes")}
          title={t("messages.transformResumeIntoVideo")}
          lede={t("messages.standOutAiVideo")}
          primary={{ to: NEW_KIT_PATH, label: t("actions.createVideoResume") }}
        >
          <WatchFeaturedVideoButton variant="outline" className="self-start" />
        </SeoHero>

        <MarketingBand tone="card" labelledBy="resumes-features-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="resumes-features-title" title={t("headings.everythingYouNeed")} />
          <FeatureCardGrid
            items={[
              {
                key: "ai",
                icon: Zap,
                title: t("headings.aiPoweredCreation"),
                description: t("messages.aiPoweredCreationDesc"),
                bullets: [t("labels.smartScriptGeneration"), t("labels.industryTemplates"), t("labels.personalBrandingTips")],
              },
              {
                key: "analytics",
                icon: BarChart3,
                title: t("headings.performanceAnalytics"),
                description: t(hiring ? "messages.performanceAnalyticsDesc" : "resumesMarketing.seeker.analyticsDesc"),
                bullets: [
                  t("labels.viewTrackingHeatmaps"),
                  t("labels.engagementMetricsLabel"),
                  t(hiring ? "labels.recruiterInsightsLabel" : "resumesMarketing.seeker.linkViews"),
                ],
              },
              networkCard,
            ]}
          />
        </MarketingBand>

        <MarketingBand labelledBy="resumes-steps-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="resumes-steps-title" title={t("headings.howItWorksStudio")} />
          <FeatureCardGrid
            minCardWidth={220}
            items={[
              { key: "upload", icon: Upload, title: t("headings.uploadResumeStep"), description: t("messages.uploadResumeStepDesc") },
              { key: "ai", icon: Sparkles, title: t("headings.aiMagicStep"), description: t("messages.aiMagicStepDesc") },
              { key: "review", icon: Eye, title: t("headings.reviewVideoStep"), description: t("messages.reviewVideoStepDesc") },
              { key: "hired", icon: TrendingUp, title: t("headings.getHiredStep"), description: t(hiring ? "messages.getHiredStepDesc" : "resumesMarketing.seeker.shareStepDesc") },
            ]}
          />
        </MarketingBand>

        <MarketingFAQ variant="plain" schemaId="resumes" subheading={t("faq.resumes.subheading")} items={faqItems} />

        <SeoFinalCta
          id="resumes"
          title={t("headings.readyVideo")}
          body={t("resumesMarketing.finalBody")}
          primary={{ to: NEW_KIT_PATH, label: t("actions.getStartedToday") }}
        />
      </main>
    </AppShell>
  );
}
