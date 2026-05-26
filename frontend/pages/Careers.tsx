import React, { useEffect, useState, Suspense } from "react";
import { useLocation } from "react-router-dom";
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
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
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
    <div className="space-y-4 mb-12" aria-busy="true" aria-live="polite">
      <div className="h-8 bg-muted/60 rounded" />
      <div className="h-24 bg-muted/50 rounded" />
      <div className="h-24 bg-muted/50 rounded" />
      <div className="h-24 bg-muted/50 rounded" />
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
        className="mb-12"
      />
    </Suspense>
  );
}

export default function Careers() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.careers"), url: "/careers" }]);

  return (
    <AppShell bgClassName="bg-background">
<div>
          <main className="px-6 py-8">
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="/"
                    className="hover:text-foreground transition-colors"
                  >
                    {t("labels.home")}
                  </a>
                </li>
                <li>
                  <ChevronRight className="h-4 w-4" />
                </li>
                <li className="text-foreground font-medium" aria-current="page">
                  {t("labels.careers")}
                </li>
              </ol>
            </nav>

            {/* Hero Section */}
            <section
              className="text-center mb-12"
              aria-labelledby="hero-heading"
            >
              <div className="inline-flex items-center gap-2 bg-brand-purple/10 text-brand-purple px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Building2 className="h-4 w-4" />
                {t("marketing.careers.hiringBadge")}
              </div>

              <h1
                id="hero-heading"
                className="text-4xl md:text-5xl font-bold mb-6"
              >
                {t("marketing.careers.heroTitle1")}{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("marketing.careers.heroTitle2")}
                </span>
              </h1>

              <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                {t("marketing.careers.heroSubtitle")}
              </p>

              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild>
                  <a href="#open-positions">{t("actions.viewOpenPositions")}</a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#company-culture">{t("actions.learnAboutCulture")}</a>
                </Button>
              </div>
            </section>

            {/* Company Stats */}
            <section
              className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"
              aria-labelledby="company-stats"
            >
              <Card className="text-center">
                <CardContent className="pt-6">
                  <div
                    className="text-3xl font-bold text-brand-purple mb-2"
                    aria-label={t("marketing.careers.stats.teamAria")}
                  >
                    50+
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("marketing.careers.stats.teamMembers")}
                  </div>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-brand-blue mb-2">
                    100K+
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("marketing.careers.stats.usersHelped")}
                  </div>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-brand-purple mb-2">
                    15+
                  </div>
                  <div className="text-sm text-muted-foreground">{t("marketing.careers.stats.countries")}</div>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-brand-blue mb-2">
                    95%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("marketing.careers.stats.satisfaction")}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Why Work With Us */}
            <section id="company-culture" className="mb-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">{t("marketing.careers.whyTitle")}</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  {t("marketing.careers.whySubtitle")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-purple/10 rounded-lg">
                        <Zap className="h-6 w-6 text-brand-purple" />
                      </div>
                      <CardTitle className="text-lg">
                        {t("marketing.careers.benefits.innovation.title")}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.innovation.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-blue/10 rounded-lg">
                        <Globe className="h-6 w-6 text-brand-blue" />
                      </div>
                      <CardTitle className="text-lg">{t("marketing.careers.benefits.remote.title")}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.remote.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <GraduationCap className="h-6 w-6 text-green-600" />
                      </div>
                      <CardTitle className="text-lg">
                        {t("marketing.careers.benefits.growth.title")}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.growth.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Heart className="h-6 w-6 text-purple-600" />
                      </div>
                      <CardTitle className="text-lg">
                        {t("marketing.careers.benefits.health.title")}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.health.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Plane className="h-6 w-6 text-orange-600" />
                      </div>
                      <CardTitle className="text-lg">{t("marketing.careers.benefits.timeOff.title")}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.timeOff.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Award className="h-6 w-6 text-blue-600" />
                      </div>
                      <CardTitle className="text-lg">{t("marketing.careers.benefits.equity.title")}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t("marketing.careers.benefits.equity.desc")}
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Perks & Benefits */}
            <section className="mb-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">{t("marketing.careers.perksTitle")}</h2>
                <p className="text-lg text-muted-foreground">
                  {t("marketing.careers.perksSubtitle")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Coffee className="h-5 w-5 text-brand-purple" />
                  <span className="text-sm font-medium">
                    {t("marketing.careers.perks.coffee")}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Gamepad2 className="h-5 w-5 text-brand-blue" />
                  <span className="text-sm font-medium">
                    {t("marketing.careers.perks.games")}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Users className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium">
                    {t("marketing.careers.perks.team")}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Building2 className="h-5 w-5 text-purple-600" />
                  <span className="text-sm font-medium">
                    {t("marketing.careers.perks.offices")}
                  </span>
                </div>
              </div>
            </section>

            {/* Open Positions */}
            <section id="open-positions">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">{t("marketing.careers.openPositions")}</h2>
                <p className="text-lg text-muted-foreground">
                  {t("marketing.careers.openPositionsDesc")}
                </p>
              </div>

              {/* Defer heavy jobs section to after first paint */}
              <DeferredJobs />
            </section>

            {/* Application Process */}
            <section className="mb-12">
              <Card>
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">Our Hiring Process</CardTitle>
                  <CardDescription>
                    We believe in a transparent and efficient hiring process
                    that respects your time.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-brand-purple/10 text-brand-purple rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                        1
                      </div>
                      <h3 className="font-semibold mb-2">Application</h3>
                      <p className="text-sm text-muted-foreground">
                        Submit your application with your resume and cover
                        letter.
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                        2
                      </div>
                      <h3 className="font-semibold mb-2">Phone Screen</h3>
                      <p className="text-sm text-muted-foreground">
                        Brief call with our recruiting team to discuss your
                        background.
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                        3
                      </div>
                      <h3 className="font-semibold mb-2">
                        Technical Interview
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Technical discussion and problem-solving with the team.
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                        4
                      </div>
                      <h3 className="font-semibold mb-2">Final Interview</h3>
                      <p className="text-sm text-muted-foreground">
                        Meet with leadership and discuss culture fit and vision.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <MarketingFAQ
              schemaId="careers"
              subheading="Get answers to common questions about working at hired.video."
              className="mb-12"
              items={[
                {
                  question: "Is hired.video fully remote?",
                  answer:
                    "Yes! We're a remote-first company with team members across 15+ countries. We also have optional office spaces in major cities for those who prefer hybrid work.",
                },
                {
                  question: "What benefits do you offer?",
                  answer:
                    "We offer comprehensive health insurance, equity packages, unlimited PTO, learning budgets, wellness stipends, and flexible working hours.",
                },
                {
                  question: "How long is the hiring process?",
                  answer:
                    "Our hiring process typically takes 2-3 weeks from application to offer. We believe in being efficient while ensuring a great fit for both sides.",
                },
                {
                  question: "Do you sponsor work visas?",
                  answer:
                    "Yes, we sponsor work visas for exceptional candidates. We're committed to building a diverse, global team and will work with you on visa requirements.",
                },
              ]}
            />

            {/* Call to Action */}
            <section className="text-center">
              <Card className="bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 border-brand-purple/20">
                <CardContent className="pt-8 pb-8">
                  <h2 className="text-2xl font-bold mb-4">
                    Don't See the Perfect Role?
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                    We're always looking for talented individuals who share our
                    passion for innovation. Send us your resume and let us know
                    how you'd like to contribute to our mission.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button size="lg" asChild>
                      <a href="mailto:careers@hired.video">
                        Send Us Your Resume
                      </a>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <a href="/contact">Get in Touch</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          </main>
</div>
</AppShell>
  );
}
