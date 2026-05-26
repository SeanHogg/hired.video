import { useLocation, Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { PRO_MONTHLY_PRICE } from "@shared/pricing";
import MarketingFAQ from "@/components/MarketingFAQ";
import CompetitorComparison, {
  buildComparisonStructuredData,
} from "@/components/CompetitorComparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";

const FAQS = [
  {
    question:
      "How can Hired.Video charge $9.95/seat/mo when LOXO Basic is $169 and Greenhouse contracts run tens of thousands?",
    answer:
      "We're a video-first all-in-one platform priced for the modern web — the same Pro plan covers candidates, recruiters, and employers. AI usage is metered (1M tokens included on Pro) so power users pay for what they consume in a token pack rather than every team paying enterprise pricing for capabilities they don't use.",
  },
  {
    question: "Is Hired.Video a real ATS, or just a video-resume tool?",
    answer:
      "Both. Hired.Video ships an Applicant Tracking System with a Kanban hiring pipeline, a sourcing CRM, async video interviews, an AI candidate-to-job match score, and a Chrome extension for capturing candidates and jobs from LinkedIn, Indeed, Workday and more — alongside the AI Studio and video resume features competitors don't have.",
  },
  {
    question: "Do you support enterprise needs like SSO, SOC 2, and data residency?",
    answer:
      "Enterprise compliance (SOC 2, SSO, regional data residency) is on our 2026 roadmap. If those are blockers for your purchase today, contact us — we'll confirm timing and discuss options for design-partner pilots.",
  },
  {
    question: "Can candidates use Hired.Video for free?",
    answer:
      "Yes. The Free tier includes one published AI video resume, the Chrome extension, the resume builder, AI interview practice (limited), 50,000 AI tokens per month, and access to the public job board with structured-data indexing. No credit card required.",
  },
  {
    question:
      "What ships beyond the ATS — gamification, learning pathways, and a map surface really included?",
    answer:
      "Yes. Points, streaks, badges and Tremendous-powered gift-card cashout (or AI-credit / premium-month redemption) are live for all three roles. SCORM 1.2 + xAPI LRS + DAG learning paths with HMAC-signed verifiable certificates are shipped, including employer-side authoring. A /map page renders jobs, events, and opted-in coffee pins via OpenStreetMap. All three are part of the same $9.95/seat/mo Pro plan — no module upcharge.",
  },
  {
    question: "How accurate is this comparison?",
    answer:
      "Pricing and feature claims are sourced from vendor-published pricing pages and recent third-party reporting (Pin, Capterra, G2, Vendr, Juicebox, augtal) as of April 2026. Vendors change pricing frequently and most enterprise plans are custom-quoted — verify the latest numbers directly with each vendor before purchase.",
  },
];

export default function Competitors() {
  const location = useLocation();
  useSEO(location.pathname, {
    title:
      "vs Competition (2026): LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue & VidCruiter — hired.video",
    description:
      "Side-by-side comparison of hired.video against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue, and VidCruiter. Pricing, ATS, recruiting CRM, AI video resumes, voice cloning, async interviews, gamification, and learning pathways — what's included and what costs extra in 2026.",
    keywords:
      "hired.video vs LOXO, hired.video vs LinkedIn Recruiter, LOXO alternative, LinkedIn Recruiter alternative, Greenhouse alternative, Bullhorn alternative, HireVue alternative, VidCruiter alternative, ATS comparison 2026, AI video resume platform comparison, recruiting CRM comparison, all-in-one recruiting software",
    structuredData: buildComparisonStructuredData(),
  });
  useBreadcrumbs([
    { name: "Hired.Video vs Competition", url: "/vs-competitors" },
  ]);

  return (
    <AppShell bgClassName="bg-background">
      <main>
        {/* Hero */}
        <section className="bg-gradient-to-br from-brand-purple/5 via-background to-brand-blue/5 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto text-center">
            <Badge className="mb-4" variant="outline">
              <Trophy className="h-4 w-4 mr-1" /> Comparison
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              Hired.Video vs Competition
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              How Hired.Video stacks up against LOXO, LinkedIn Recruiter,
              Greenhouse, Bullhorn, HireVue, and VidCruiter — pricing, ATS/CRM,
              AI video resumes, voice cloning, async interviews, gamification,
              and learning pathways, side by side.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <Badge variant="secondary">
                ${PRO_MONTHLY_PRICE.toFixed(2)}/seat/mo Pro
              </Badge>
              <Badge variant="secondary">Free tier — no credit card</Badge>
              <Badge variant="secondary">All-in-one platform</Badge>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue text-white"
                >
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline">
                  See pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* All comparison content — tables, per-competitor cards, value props.
            Single source of truth shared with /pricing so the two pages can't
            drift on vendor pricing, feature parity, or differentiator copy. */}
        <CompetitorComparison />

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <MarketingFAQ
              schemaId="competitors"
              heading="Frequently asked questions"
              subheading="Pricing, scope, and how the comparison was sourced."
              items={FAQS}
            />
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple to-brand-blue text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to see Hired.Video for yourself?
            </h2>
            <p className="text-lg mb-8 opacity-90">
              Start free in 60 seconds. Bring your team when you're ready — Pro
              is ${PRO_MONTHLY_PRICE.toFixed(2)} per seat per month, with a 20%
              discount on annual.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link to="/signup">
                <Button size="lg" variant="secondary">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-transparent text-white border-white hover:bg-white/10"
                >
                  See full pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
