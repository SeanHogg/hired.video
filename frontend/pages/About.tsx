import { Video, ArrowRight, Heart, Brain, Globe, Shield, CheckCircle2, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { useContactPanel } from "@/components/ContactPanel";
import PeopleCard from "@/components/PeopleCard";
import { AppShell } from "@/components/AppShell";
import { userService } from "@/lib/services/user-service";
import type { UserMetadata } from "@/types/people";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

export default function About() {
  const location = useLocation();
  const { t } = useTranslation();
  // SEO for about page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.aboutUs"), url: "/about" }]);
  const { openContactPanel } = useContactPanel();

  const values = [
    {
      icon: Heart,
      title: t("marketing.about.values.passion.title"),
      description: t("marketing.about.values.passion.desc"),
    },
    {
      icon: Brain,
      title: t("marketing.about.values.innovation.title"),
      description: t("about.js.values.innovationDesc"),
    },
    {
      icon: Shield,
      title: t("marketing.about.values.trust.title"),
      description: t("marketing.about.values.trust.desc"),
    },
    {
      icon: Globe,
      title: t("marketing.about.values.global.title"),
      description: t("marketing.about.values.global.desc"),
    },
  ];

  const [teamMembers, setTeamMembers] = useState<UserMetadata[]>([]);

  useEffect(() => {
    userService.getUserBySlug("seanhogg").then((profile) => {
      const member: UserMetadata = {
        id: profile.id || "",
        slug: profile.slug || "seanhogg",
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        avatar: profile.profilePicture || undefined,
        headline: profile.currentRole || profile.bio || "",
        location: profile.location || "",
        role: profile.role || "",
        visibility: "public",
        status: "active",
        createdAt: profile.createdAt || new Date().toISOString(),
        updatedAt: profile.updatedAt || new Date().toISOString(),
        lastActiveAt: profile.updatedAt || new Date().toISOString(),
        profileViews: profile.profileViews || 0,
        connectionCount: 0,
        followerCount: 0,
        emailConfirmed: profile.isVerified || false,
        isPro: profile.isPro || false,
        openToWork: profile.openToWork || false,
        currentPosition: profile.currentRole || undefined,
        currentCompany: profile.currentCompany || undefined,
      };
      setTeamMembers([member]);
    }).catch(() => {
      // Failed to load team member — render nothing
    });
  }, []);


  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("labels.aboutUs")}
          title={
            <>
              {t("marketing.about.heroTitle1")}{" "}
              <span className="text-primary">{t("marketing.about.heroTitle2")}</span>
            </>
          }
          subtitle={t("about.js.heroSubtitle")}
          actions={
            <>
              <Link to="/signup" className={HERO_CTA_PRIMARY}>
                {t("actions.joinMission")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => openContactPanel()} className={HERO_CTA_LINK}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {t("labels.contactUs")}
              </button>
            </>
          }
        />


        {/* Mission */}
        <MarketingBand labelledBy="about-mission-heading">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-center gap-12">
            <div className="flex flex-col gap-5">
              <MarketingSectionIntro id="about-mission-heading" title={t("marketing.about.missionTitle")} />
              <p className="text-lg leading-relaxed text-muted-foreground">{t("marketing.about.missionPara1")}</p>
              <p className="text-lg leading-relaxed text-muted-foreground">{t("about.js.missionPara2")}</p>
            </div>
            <ul className="flex flex-col gap-4 rounded-3xl bg-ink p-7 text-ink-foreground">
              {["about.js.missionPoint1", "about.js.missionPoint2", "marketing.about.missionPoint3"].map((k) => (
                <li key={k} className="flex items-start gap-3 text-lg font-medium">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-ink-positive" aria-hidden="true" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </MarketingBand>

        {/* Values */}
        <MarketingBand tone="card" labelledBy="about-values-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="about-values-heading"
            title={t("marketing.about.valuesTitle")}
            subtitle={t("marketing.about.valuesSubtitle")}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
            {values.map((value) => (
              <IconCard key={value.title} icon={value.icon} title={value.title} body={value.description} />
            ))}
          </div>
        </MarketingBand>

        {/* Team */}
        <MarketingBand labelledBy="about-team-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="about-team-heading"
            title={t("marketing.about.teamTitle")}
            subtitle={t("marketing.about.teamSubtitle")}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-5">
            {teamMembers.map((member) => (
              <PeopleCard key={member.id} person={member} />
            ))}
          </div>
        </MarketingBand>

        {/* Technology */}
        <MarketingBand tone="card" labelledBy="about-tech-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="about-tech-heading"
            title={t("marketing.about.techTitle")}
            subtitle={t("marketing.about.techSubtitle")}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
            <IconCard icon={Brain} title={t("marketing.about.tech.matching.title")} body={t("marketing.about.tech.matching.desc")} />
            <IconCard icon={Video} title={t("marketing.about.tech.video.title")} body={t("marketing.about.tech.video.desc")} />
            <IconCard icon={Shield} title={t("marketing.about.tech.security.title")} body={t("marketing.about.tech.security.desc")} />
          </div>
        </MarketingBand>

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          className="mx-auto max-w-[820px] px-6 py-20"
          schemaId="about"
          heading={t("marketing.about.faqHeading")}
          subheading={t("about.js.faqSubheading")}
          items={[
            { question: t("faq.about.whatQ"), answer: t("about.js.faq.whatA") },
            { question: t("faq.about.foundedQ"), answer: t("faq.about.foundedA") },
            { question: t("faq.about.availableQ"), answer: t("faq.about.availableA") },
            { question: t("faq.about.moneyQ"), answer: t("about.js.faq.moneyA") },
            { question: t("faq.about.privacyQ"), answer: t("faq.about.privacyA") },
            { question: t("faq.about.hiringQ"), answer: t("faq.about.hiringA") },
            { question: t("faq.about.contactQ"), answer: t("faq.about.contactA") },
          ]}
        />

        <MarketingFinalCta
          kicker={<MantraKicker />}
          footer={<BuildCtaFooter />}
          title={t("marketing.about.ctaTitle")}
          subtitle={t("about.js.ctaSubtitle")}
          actions={
            <>
              <Link to="/signup" className={HERO_CTA_PRIMARY}>
                {t("actions.getStartedToday")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/pricing" className={INK_CTA_LINK}>
                {t("actions.viewPricing")}
              </Link>
            </>
          }
        />
      </main>
    </AppShell>
  );
}
