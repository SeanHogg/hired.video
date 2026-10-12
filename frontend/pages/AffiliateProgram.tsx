import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { MarketingHero, MarketingFinalCta, HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import IconCard from "@/components/marketing/IconCard";
import ProgramSignupForm, { type ProgramSignupFields } from "@/components/auth/ProgramSignupForm";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { CheckCircle2, DollarSign, Link as LinkIcon, Shield, Users, Zap, Video, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AffiliateProgram() {
  useSEO("/affiliate-program");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("labels.affiliateProgram"), url: "/affiliate-program" }]);
  const navigate = useNavigate();
  const { signup, isLoading, isAuthenticated } = useAuth();

  // Sign the visitor up AS an affiliate (role=affiliate, promoted to a
  // first-class role 2026-06-13) and auto-create their affiliate profile via
  // enableAffiliate=true. Inbound `?ref=` attribution is picked up by
  // `signup()` from the shared first-touch store — no querystring parsing here.
  const registerAffiliate = (fields: ProgramSignupFields, token: string) =>
    signup(fields.email, fields.password, fields.firstName, fields.lastName, USER_ROLES.AFFILIATE, undefined, true, token);

  const goToSuccess = (fields: ProgramSignupFields) =>
    setTimeout(() => navigate(`/signup-success?email=${encodeURIComponent(fields.email)}&firstName=${encodeURIComponent(fields.firstName)}`), 1000);

  const goToDashboardOrSignup = () => {
    if (isAuthenticated) {
      navigate("/services?tab=dashboard");
    } else {
      document.getElementById("affiliate-signup")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const heroFeatures = [
    { key: "ResumeBuilder", icon: CheckCircle2 },
    { key: "VideoResumes", icon: Video },
    { key: "Collaboration", icon: Users },
    { key: "Analytics", icon: BarChart3 },
  ];

  const valueProps = [
    { key: "greatForCreators", icon: Video },
    { key: "builtForRecruiters", icon: Users },
    { key: "transparentTracking", icon: BarChart3 },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          className="items-start"
          eyebrow={t("labels.affiliateProgram")}
          title={t("headings.affiliate.heroTitle")}
          subtitle={t("messages.affiliate.heroSubtitle")}
          actions={
            <>
              <button type="button" onClick={goToDashboardOrSignup} className={HERO_CTA_PRIMARY}>
                {isAuthenticated ? t("actions.affiliate.goToDashboard") : t("actions.affiliate.joinProgram")}
              </button>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" aria-hidden="true" />
                {t("labels.affiliate.fairPayouts")}
              </span>
            </>
          }
          footer={
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4 pt-2">
              {heroFeatures.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{t(`headings.affiliate.feature${key}`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`messages.affiliate.feature${key}`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          }
          aside={
            isAuthenticated ? (
              <Card id="affiliate-signup" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle>{t("headings.affiliate.alreadyAffiliate")}</CardTitle>
                  <CardDescription>{t("messages.affiliate.alreadyEnrolled")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-text" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">{t("messages.affiliate.dashboardLocation")}</p>
                  </div>
                  <Button size="lg" className="w-full" onClick={() => navigate("/services?tab=dashboard")}>
                    {t("actions.affiliate.goToAffiliateDashboard")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ProgramSignupForm
                id="affiliate-signup"
                title={t("headings.affiliate.becomeAffiliate")}
                description={t("messages.affiliate.registerCta")}
                submitLabel={t("actions.affiliate.createAccount")}
                successMessage={t("messages.affiliate.registrationSuccess")}
                register={registerAffiliate}
                onSuccess={goToSuccess}
                isLoading={isLoading}
                oauthRole={USER_ROLES.AFFILIATE}
                oauthEnableAffiliate
                oauthRedirect="/services?tab=dashboard"
              />
            )
          }
        />

        {/* Earnings & payouts */}
        <MarketingBand tone="card" labelledBy="affiliate-earnings-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro id="affiliate-earnings-heading" title={t("headings.affiliate.earningsTitle")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
            <IconCard icon={DollarSign} title={t("labels.commission")}>
              <div className="space-y-2 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  <strong className="font-mono text-brand-green-text">{t("messages.affiliate.commissionRate")}</strong>{" "}
                  {t("messages.affiliate.commissionBody")}
                </p>
                <p>{t("messages.affiliate.commissionExample")}</p>
              </div>
            </IconCard>
            <IconCard icon={Zap} title={t("headings.affiliate.payoutThreshold")}>
              <div className="space-y-2 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">{t("messages.affiliate.payoutMinimum")}</strong>{" "}
                  {t("messages.affiliate.payoutMinimumBody")}
                </p>
                <p>{t("messages.affiliate.payoutProcessing")}</p>
              </div>
            </IconCard>
            <IconCard icon={LinkIcon} title={t("headings.affiliate.payments")}>
              <div className="space-y-2 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">{t("labels.affiliate.timeline")}</strong>{" "}
                  {t("messages.affiliate.timelineBody")}
                </p>
                <p>
                  <strong className="text-foreground">{t("labels.affiliate.methods")}</strong>{" "}
                  {t("messages.affiliate.methodsBody")}
                </p>
              </div>
            </IconCard>
          </div>
        </MarketingBand>

        {/* Value propositions */}
        <MarketingBand labelledBy="affiliate-why-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro id="affiliate-why-heading" title={t("headings.affiliate.whyTitle")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
            {valueProps.map(({ key, icon }) => (
              <IconCard
                key={key}
                icon={icon}
                title={t(`headings.affiliate.${key}`)}
                body={t(`messages.affiliate.${key}`)}
              />
            ))}
          </div>
        </MarketingBand>

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          className="mx-auto max-w-[820px] px-6 py-20"
          schemaId="affiliate-program"
          subheading={t("faq.affiliate.subheading")}
          items={[
            { question: t("faq.affiliate.q1.q"), answer: t("faq.affiliate.q1.a") },
            { question: t("faq.affiliate.q2.q"), answer: t("faq.affiliate.q2.a") },
            { question: t("faq.affiliate.q3.q"), answer: t("faq.affiliate.q3.a") },
            { question: t("faq.affiliate.q4.q"), answer: t("faq.affiliate.q4.a") },
            { question: t("faq.affiliate.q5.q"), answer: t("faq.affiliate.q5.a") },
            { question: t("faq.affiliate.q6.q"), answer: t("faq.affiliate.q6.a") },
            { question: t("faq.affiliate.q7.q"), answer: t("faq.affiliate.q7.a") },
            { question: t("faq.affiliate.q8.q"), answer: t("faq.affiliate.q8.a") },
          ]}
        />

        <MarketingFinalCta
          title={isAuthenticated ? t("headings.affiliate.ctaShareTitle") : t("headings.affiliate.ctaEarnTitle")}
          subtitle={isAuthenticated ? t("messages.affiliate.ctaShareBody") : t("messages.affiliate.ctaEarnBody")}
          actions={
            <button type="button" onClick={goToDashboardOrSignup} className={HERO_CTA_PRIMARY}>
              {isAuthenticated ? t("actions.affiliate.goToDashboard") : t("actions.affiliate.joinNow")}
            </button>
          }
        />
      </main>
    </AppShell>
  );
}
