import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Clapperboard,
  GraduationCap,
  Users,
  ClipboardCheck,
  CalendarDays,
  Compass,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

// One pillar = one marketing section. Each card carries a tight blurb, a
// few proof bullets, and a deep link into the real surface so the page
// reads as "here's what shipped, go use it" rather than a brochure.
interface FeatureCard {
  titleKey: string;
  descKey: string;
  bulletKeys: string[];
  to: string;
  ctaKey: string;
}

interface FeaturePillar {
  icon: LucideIcon;
  iconColor: string;
  border: string;
  eyebrowKey: string;
  headingKey: string;
  subKey: string;
  cards: FeatureCard[];
}

const PILLARS: FeaturePillar[] = [
  // ─── Creator Studio (multi-kind) ────────────────────────────────────────
  {
    icon: Clapperboard,
    iconColor: "text-brand-purple",
    border: "border-brand-purple/20 hover:border-brand-purple/40",
    eyebrowKey: "features.studio.eyebrow",
    headingKey: "features.studio.heading",
    subKey: "features.studio.sub",
    cards: [
      {
        titleKey: "features.studio.video.title",
        descKey: "features.studio.video.desc",
        bulletKeys: [
          "features.studio.video.bullet1",
          "features.studio.video.bullet2",
          "features.studio.video.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.video.cta",
      },
      {
        titleKey: "features.studio.audio.title",
        descKey: "features.studio.audio.desc",
        bulletKeys: [
          "features.studio.audio.bullet1",
          "features.studio.audio.bullet2",
          "features.studio.audio.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.audio.cta",
      },
      {
        titleKey: "features.studio.interactive.title",
        descKey: "features.studio.interactive.desc",
        bulletKeys: [
          "features.studio.interactive.bullet1",
          "features.studio.interactive.bullet2",
          "features.studio.interactive.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.interactive.cta",
      },
      {
        titleKey: "features.studio.monetize.title",
        descKey: "features.studio.monetize.desc",
        bulletKeys: [
          "features.studio.monetize.bullet1",
          "features.studio.monetize.bullet2",
          "features.studio.monetize.bullet3",
        ],
        to: "/services/gigs",
        ctaKey: "features.studio.monetize.cta",
      },
    ],
  },
  // ─── Learning ───────────────────────────────────────────────────────────
  {
    icon: GraduationCap,
    iconColor: "text-brand-blue",
    border: "border-brand-blue/20 hover:border-brand-blue/40",
    eyebrowKey: "features.learning.eyebrow",
    headingKey: "features.learning.heading",
    subKey: "features.learning.sub",
    cards: [
      {
        titleKey: "features.learning.library.title",
        descKey: "features.learning.library.desc",
        bulletKeys: [
          "features.learning.library.bullet1",
          "features.learning.library.bullet2",
          "features.learning.library.bullet3",
        ],
        to: "/tools?tab=learning",
        ctaKey: "features.learning.library.cta",
      },
      {
        titleKey: "features.learning.paths.title",
        descKey: "features.learning.paths.desc",
        bulletKeys: [
          "features.learning.paths.bullet1",
          "features.learning.paths.bullet2",
          "features.learning.paths.bullet3",
        ],
        to: "/tools?tab=learning",
        ctaKey: "features.learning.paths.cta",
      },
      {
        titleKey: "features.learning.classrooms.title",
        descKey: "features.learning.classrooms.desc",
        bulletKeys: [
          "features.learning.classrooms.bullet1",
          "features.learning.classrooms.bullet2",
          "features.learning.classrooms.bullet3",
        ],
        to: "/tools?tab=classrooms",
        ctaKey: "features.learning.classrooms.cta",
      },
    ],
  },
  // ─── People Operations (CHRO) ───────────────────────────────────────────
  {
    icon: Users,
    iconColor: "text-emerald-600",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    eyebrowKey: "features.peopleOps.eyebrow",
    headingKey: "features.peopleOps.heading",
    subKey: "features.peopleOps.sub",
    cards: [
      {
        titleKey: "features.peopleOps.roster.title",
        descKey: "features.peopleOps.roster.desc",
        bulletKeys: [
          "features.peopleOps.roster.bullet1",
          "features.peopleOps.roster.bullet2",
          "features.peopleOps.roster.bullet3",
        ],
        to: "/people/roster",
        ctaKey: "features.peopleOps.roster.cta",
      },
      {
        titleKey: "features.peopleOps.oneOnOnes.title",
        descKey: "features.peopleOps.oneOnOnes.desc",
        bulletKeys: [
          "features.peopleOps.oneOnOnes.bullet1",
          "features.peopleOps.oneOnOnes.bullet2",
          "features.peopleOps.oneOnOnes.bullet3",
        ],
        to: "/people/one-on-ones",
        ctaKey: "features.peopleOps.oneOnOnes.cta",
      },
      {
        titleKey: "features.peopleOps.health.title",
        descKey: "features.peopleOps.health.desc",
        bulletKeys: [
          "features.peopleOps.health.bullet1",
          "features.peopleOps.health.bullet2",
          "features.peopleOps.health.bullet3",
        ],
        to: "/people/team-health",
        ctaKey: "features.peopleOps.health.cta",
      },
    ],
  },
  // ─── Recruiting Operations ──────────────────────────────────────────────
  {
    icon: ClipboardCheck,
    iconColor: "text-amber-600",
    border: "border-amber-500/20 hover:border-amber-500/40",
    eyebrowKey: "features.recruiting.eyebrow",
    headingKey: "features.recruiting.heading",
    subKey: "features.recruiting.sub",
    cards: [
      {
        titleKey: "features.recruiting.evaluation.title",
        descKey: "features.recruiting.evaluation.desc",
        bulletKeys: [
          "features.recruiting.evaluation.bullet1",
          "features.recruiting.evaluation.bullet2",
          "features.recruiting.evaluation.bullet3",
        ],
        to: "/people/scorecards",
        ctaKey: "features.recruiting.evaluation.cta",
      },
      {
        titleKey: "features.recruiting.screening.title",
        descKey: "features.recruiting.screening.desc",
        bulletKeys: [
          "features.recruiting.screening.bullet1",
          "features.recruiting.screening.bullet2",
          "features.recruiting.screening.bullet3",
        ],
        to: "/recruit/live-screens",
        ctaKey: "features.recruiting.screening.cta",
      },
      {
        titleKey: "features.recruiting.sourcing.title",
        descKey: "features.recruiting.sourcing.desc",
        bulletKeys: [
          "features.recruiting.sourcing.bullet1",
          "features.recruiting.sourcing.bullet2",
          "features.recruiting.sourcing.bullet3",
        ],
        to: "/sourcing/browse",
        ctaKey: "features.recruiting.sourcing.cta",
      },
    ],
  },
  // ─── Connections & decisions ────────────────────────────────────────────
  {
    icon: CalendarDays,
    iconColor: "text-pink-600",
    border: "border-pink-500/20 hover:border-pink-500/40",
    eyebrowKey: "features.connect.eyebrow",
    headingKey: "features.connect.heading",
    subKey: "features.connect.sub",
    cards: [
      {
        titleKey: "features.connect.events.title",
        descKey: "features.connect.events.desc",
        bulletKeys: [
          "features.connect.events.bullet1",
          "features.connect.events.bullet2",
          "features.connect.events.bullet3",
        ],
        to: "/bookings",
        ctaKey: "features.connect.events.cta",
      },
      {
        titleKey: "features.connect.research.title",
        descKey: "features.connect.research.desc",
        bulletKeys: [
          "features.connect.research.bullet1",
          "features.connect.research.bullet2",
          "features.connect.research.bullet3",
        ],
        to: "/tools/comp-analyzer",
        ctaKey: "features.connect.research.cta",
      },
      {
        titleKey: "features.connect.references.title",
        descKey: "features.connect.references.desc",
        bulletKeys: [
          "features.connect.references.bullet1",
          "features.connect.references.bullet2",
          "features.connect.references.bullet3",
        ],
        to: "/references",
        ctaKey: "features.connect.references.cta",
      },
    ],
  },
];

export default function Features() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname, {
    title: t("features.seo.title"),
    description: t("features.seo.description"),
  });
  useBreadcrumbs([{ name: t("features.breadcrumb"), url: "/features" }]);

  const FAQ = [
    { question: t("faq.features.q1.q"), answer: t("faq.features.q1.a") },
    { question: t("faq.features.q2.q"), answer: t("faq.features.q2.a") },
    { question: t("faq.features.q3.q"), answer: t("faq.features.q3.a") },
    { question: t("faq.features.q4.q"), answer: t("faq.features.q4.a") },
    { question: t("faq.features.q5.q"), answer: t("faq.features.q5.a") },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <div className="px-4 py-16">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 mb-6">
              <div className="relative">
                <Compass className="h-12 w-12 text-primary" />
              </div>
              <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                {t("features.brandTagline")}
              </span>
            </div>
            <h1 className="text-5xl font-bold mb-6">{t("features.heroTitle")}</h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              {t("features.heroSubtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                >
                  {t("actions.getStartedFree")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline" className="text-lg px-8">
                  {t("actions.viewPricing")}
                </Button>
              </Link>
            </div>
          </div>

          {/* Pillars */}
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <section key={pillar.headingKey} className="mb-20">
                <div className="text-center mb-10">
                  <div className="inline-flex items-center justify-center gap-2 mb-3">
                    <Icon className={`h-8 w-8 ${pillar.iconColor}`} />
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(pillar.eyebrowKey)}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold mb-3">{t(pillar.headingKey)}</h2>
                  <p className="text-muted-foreground max-w-3xl mx-auto">
                    {t(pillar.subKey)}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {pillar.cards.map((card) => (
                    <Card
                      key={card.titleKey}
                      className={`${pillar.border} flex flex-col transition-colors`}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">{t(card.titleKey)}</CardTitle>
                        <CardDescription>{t(card.descKey)}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col">
                        <div className="space-y-2 text-sm flex-1">
                          {card.bulletKeys.map((bk) => (
                            <div key={bk} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                              <span>{t(bk)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5">
                          <Button asChild variant="ghost" size="sm" className="px-0">
                            <Link to={card.to}>
                              {t(card.ctaKey)}
                              <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* FAQ */}
        <MarketingFAQ
          schemaId="features"
          subheading={t("features.faqSubheading")}
          items={FAQ}
        />

        {/* Final CTA */}
        <div className="px-4 py-16">
          <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
            <h3 className="text-3xl font-bold mb-4">{t("features.ctaTitle")}</h3>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t("features.ctaSubtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  {t("actions.getStartedFree")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/tools">
                <Button size="lg" variant="outline">
                  {t("features.ctaSecondary")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
