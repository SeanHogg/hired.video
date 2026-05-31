import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Users,
  Target,
  Zap,
  CheckCircle2,
  BarChart3,
  Search,
  Video,
  Chrome,
  LayoutGrid,
  Briefcase,
  Sparkles,
  Star,
  TrendingUp,
  Shield,
  Globe,
} from "lucide-react";

import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

export default function ForRecruiters() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("marketing.recruiters.breadcrumb"), url: "/for-recruiters" }]);

  const STATS = [
    { stat: "3×", label: t("marketing.recruiters.stats.faster") },
    { stat: "85%", label: t("marketing.recruiters.stats.recruitersRate") },
    { stat: "16+", label: t("marketing.recruiters.stats.boards") },
    { stat: "60s", label: t("marketing.recruiters.stats.fromProfile") },
  ];

  const FEATURES = [
    {
      icon: Chrome,
      title: t("marketing.recruiters.features.sourcing.title"),
      description: t("marketing.recruiters.features.sourcing.desc"),
      bullets: [
        t("marketing.recruiters.features.sourcing.bullet1"),
        t("marketing.recruiters.features.sourcing.bullet2"),
        t("marketing.recruiters.features.sourcing.bullet3"),
      ],
    },
    {
      icon: Target,
      title: t("marketing.recruiters.features.matching.title"),
      description: t("marketing.recruiters.features.matching.desc"),
      bullets: [
        t("marketing.recruiters.features.matching.bullet1"),
        t("marketing.recruiters.features.matching.bullet2"),
        t("marketing.recruiters.features.matching.bullet3"),
      ],
    },
    {
      icon: LayoutGrid,
      title: t("marketing.recruiters.features.pipeline.title"),
      description: t("marketing.recruiters.features.pipeline.desc"),
      bullets: [
        t("marketing.recruiters.features.pipeline.bullet1"),
        t("marketing.recruiters.features.pipeline.bullet2"),
        t("marketing.recruiters.features.pipeline.bullet3"),
      ],
    },
    {
      icon: Video,
      title: t("marketing.recruiters.features.videoScreen.title"),
      description: t("marketing.recruiters.features.videoScreen.desc"),
      bullets: [
        t("marketing.recruiters.features.videoScreen.bullet1"),
        t("marketing.recruiters.features.videoScreen.bullet2"),
        t("marketing.recruiters.features.videoScreen.bullet3"),
      ],
    },
    {
      icon: Search,
      title: t("marketing.recruiters.features.talentPool.title"),
      description: t("marketing.recruiters.features.talentPool.desc"),
      bullets: [
        t("marketing.recruiters.features.talentPool.bullet1"),
        t("marketing.recruiters.features.talentPool.bullet2"),
        t("marketing.recruiters.features.talentPool.bullet3"),
      ],
    },
    {
      icon: BarChart3,
      title: t("marketing.recruiters.features.dashboard.title"),
      description: t("marketing.recruiters.features.dashboard.desc"),
      bullets: [
        t("marketing.recruiters.features.dashboard.bullet1"),
        t("marketing.recruiters.features.dashboard.bullet2"),
        t("marketing.recruiters.features.dashboard.bullet3"),
      ],
    },
  ];

  const WORKFLOW = [
    { icon: Chrome, step: t("marketing.recruiters.workflow.install.title"), desc: t("marketing.recruiters.workflow.install.desc") },
    { icon: Users, step: t("marketing.recruiters.workflow.source.title"), desc: t("marketing.recruiters.workflow.source.desc") },
    { icon: Target, step: t("marketing.recruiters.workflow.match.title"), desc: t("marketing.recruiters.workflow.match.desc") },
    { icon: TrendingUp, step: t("marketing.recruiters.workflow.place.title"), desc: t("marketing.recruiters.workflow.place.desc") },
  ];

  const TESTIMONIALS = [
    { quote: t("marketing.recruiters.testimonial1.quote"), name: t("marketing.recruiters.testimonial1.name"), title: t("marketing.recruiters.testimonial1.title") },
    { quote: t("marketing.recruiters.testimonial2.quote"), name: t("marketing.recruiters.testimonial2.name"), title: t("marketing.recruiters.testimonial2.title") },
    { quote: t("marketing.recruiters.testimonial3.quote"), name: t("marketing.recruiters.testimonial3.name"), title: t("marketing.recruiters.testimonial3.title") },
  ];

  const FAQ_ITEMS = [
    { question: t("faq.recruiters.linkedinQ"), answer: t("faq.recruiters.linkedinA") },
    { question: t("faq.recruiters.boardsQ"), answer: t("faq.recruiters.boardsA") },
    { question: t("faq.recruiters.importQ"), answer: t("faq.recruiters.importA") },
    { question: t("faq.recruiters.matchingQ"), answer: t("faq.recruiters.matchingA") },
    { question: t("faq.recruiters.candidateAccountQ"), answer: t("faq.recruiters.candidateAccountA") },
    { question: t("faq.recruiters.costQ"), answer: t("faq.recruiters.costA") },
    { question: t("faq.recruiters.gdprQ"), answer: t("faq.recruiters.gdprA") },
  ];
  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
<main>
          <div className="px-4 py-16">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Users className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("marketing.recruiters.heroLabel")}
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                {t("marketing.recruiters.heroTitle")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("marketing.recruiters.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.startFree")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/chrome-extension#recruiter">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Chrome className="mr-2 h-5 w-5" />
                    {t("actions.getChromeExtension")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
              {STATS.map((s) => (
                <div key={s.stat} className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {s.stat}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.recruiters.featuresTitle")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {FEATURES.map(({ icon: Icon, title, description, bullets }) => (
                  <Card
                    key={title}
                    className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors"
                  >
                    <CardHeader>
                      <Icon className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>{title}</CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {bullets.map((b) => (
                          <div key={b} className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            {b}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Workflow */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.recruiters.workflowTitle")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {WORKFLOW.map(({ icon: Icon, step, desc }) => (
                  <div key={step} className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{step}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Use cases */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.recruiters.useCasesTitle")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Briefcase,
                    title: t("marketing.recruiters.useCases.inHouse.title"),
                    desc: t("marketing.recruiters.useCases.inHouse.desc"),
                  },
                  {
                    icon: Globe,
                    title: t("marketing.recruiters.useCases.agency.title"),
                    desc: t("marketing.recruiters.useCases.agency.desc"),
                  },
                  {
                    icon: Zap,
                    title: t("marketing.recruiters.useCases.solo.title"),
                    desc: t("marketing.recruiters.useCases.solo.desc"),
                  },
                ].map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="p-6 rounded-xl border border-border hover:border-primary/30 transition-colors"
                  >
                    <Icon className="h-8 w-8 text-primary mb-3" />
                    <h3 className="font-semibold mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.recruiters.testimonialsTitle")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {TESTIMONIALS.map((t) => (
                  <Card key={t.name}>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">&ldquo;{t.quote}&rdquo;</p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.title}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trust bar */}
            <div className="mb-16 text-center">
              <div className="inline-flex items-center gap-6 text-muted-foreground text-sm flex-wrap justify-center">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> {t("marketing.recruiters.trust.gdpr")}
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> {t("marketing.recruiters.trust.soc2")}
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> {t("marketing.recruiters.trust.encrypted")}
                </span>
              </div>
            </div>
          </div>

          {/* Cross-link to /for-agencies for staffing-back-office buyers (#1349). */}
          <div className="px-4 py-8">
            <div className="border rounded-lg p-6 bg-muted/30 text-center">
              <h3 className="text-xl font-semibold mb-2">Running a staffing agency?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Placements, timesheets, invoice + contractor pay derivation,
                desk-margin reporting, compliance doc vault — Bullhorn-class
                back-office at $9.95 per active employee.
              </p>
              <Link to="/for-agencies" className="inline-flex items-center text-primary font-medium hover:underline">
                See the agency back-office <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </div>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="for-recruiters"
            subheading={t("marketing.recruiters.faqSubheading")}
            items={FAQ_ITEMS}
          />

          {/* Final CTA */}
          <div className="px-4 py-16">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
              <h3 className="text-3xl font-bold mb-4">
                {t("marketing.recruiters.ctaTitle")}
              </h3>
              <p className="text-muted-foreground mb-8">
                {t("marketing.recruiters.ctaSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    {t("actions.createRecruiterAccount")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">
                    {t("actions.viewRecruiterPricing")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
</AppShell>
  );
}
