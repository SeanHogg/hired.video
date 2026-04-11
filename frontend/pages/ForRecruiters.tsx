import { Link, useLocation } from "react-router-dom";
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

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";

const STATS = [
  { stat: "3×", label: "Faster candidate screening with video resumes" },
  { stat: "85%", label: "Of recruiters rate video resumes as more informative" },
  { stat: "16+", label: "Job boards supported by the Chrome extension" },
  { stat: "60s", label: "From LinkedIn profile to tagged talent pool entry" },
];

const FEATURES = [
  {
    icon: Chrome,
    title: "Chrome Extension Sourcing",
    description:
      "Extract candidates and companies from LinkedIn, Indeed, and Glassdoor into a searchable talent pool — without leaving the page.",
    bullets: [
      "One-click profile extraction",
      "Auto-detected candidate pages",
      "Tags, notes, and custom fields",
    ],
  },
  {
    icon: Target,
    title: "AI Match Scoring",
    description:
      "Score every candidate against your open jobs, or score every open job against your talent pool. AI does the ranking — you decide who to contact.",
    bullets: [
      "Bi-directional job ↔ candidate scoring",
      "Skills, experience, and location weighting",
      "Explainable match breakdowns",
    ],
  },
  {
    icon: LayoutGrid,
    title: "Visual Hiring Pipeline",
    description:
      "Drag candidates across stages — Sourced → Contacted → Screening → Interview → Offer → Placed. Counts, filters, and notes at every stage.",
    bullets: [
      "Six-stage Kanban pipeline",
      "Per-job or global views",
      "Interaction history on every candidate",
    ],
  },
  {
    icon: Video,
    title: "Video Resume Screening",
    description:
      "Evaluate soft skills, communication, and culture fit before the first call. Video resumes tell you things a PDF never can.",
    bullets: [
      "Auto-transcribed video resumes",
      "Keyword search inside video transcripts",
      "Share candidate videos with hiring managers",
    ],
  },
  {
    icon: Search,
    title: "Searchable Talent Pool",
    description:
      "Everything you source becomes a structured candidate record — searchable by skill, title, company, location, tags, or custom fields.",
    bullets: [
      "Boolean search + filters",
      "Save searches as talent lists",
      "Export to CSV or ATS",
    ],
  },
  {
    icon: BarChart3,
    title: "Recruiter Dashboard",
    description:
      "Track your pipeline health, candidate response rates, and placement velocity in one place. Clear numbers, not vanity metrics.",
    bullets: [
      "Pipeline conversion funnel",
      "Activity leaderboards for teams",
      "Weekly digest emails",
    ],
  },
];

const WORKFLOW = [
  {
    icon: Chrome,
    step: "1. Install the Extension",
    desc: "Add the hired.video recruiter extension to Chrome in one click. Works on LinkedIn, Indeed, Glassdoor, and 13 more sites.",
  },
  {
    icon: Users,
    step: "2. Source Candidates",
    desc: "Browse as you normally would. When the extension detects a profile, extract it into your talent pool with tags and notes.",
  },
  {
    icon: Target,
    step: "3. Match to Jobs",
    desc: "Let AI score every candidate against every open role. Surface the best fits and skip the ones that won't work out.",
  },
  {
    icon: TrendingUp,
    step: "4. Place Faster",
    desc: "Move candidates through your visual pipeline and close roles days or weeks sooner than before.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "The Chrome extension is a cheat code. I source 3× the candidates in the same time — and the AI match scoring means I'm only messaging people who actually fit the role.",
    name: "Priya Desai",
    title: "Senior Technical Recruiter",
  },
  {
    quote:
      "Video resumes changed how we screen. I can evaluate communication and presence in 60 seconds instead of burning a 30-minute phone call on someone who won't make it through.",
    name: "James O'Connor",
    title: "Head of Talent, B2B SaaS",
  },
  {
    quote:
      "We replaced two separate sourcing and ATS tools with hired.video and cut our time-to-hire by 40%. The visual pipeline is exactly how my team thinks about work.",
    name: "Lauren Kim",
    title: "Recruiting Lead, Agency",
  },
];

const FAQ_ITEMS = [
  {
    question: "How does hired.video compare to LinkedIn Recruiter?",
    answer:
      "LinkedIn Recruiter charges per seat for search access, while hired.video pairs a free Chrome extension with AI match scoring and a visual pipeline. Most recruiting teams use the two together — source on LinkedIn with our extension, then manage the pipeline and screen via video resumes inside hired.video.",
  },
  {
    question: "Which job boards does the sourcing extension support?",
    answer:
      "The recruiter Chrome extension auto-detects candidate and company pages on LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, CareerBuilder, Dice, SimplyHired, Lever, Greenhouse, Workday, Wellfound, Built In, and generic fallbacks for most other sites.",
  },
  {
    question: "Can I bring my existing candidate database into hired.video?",
    answer:
      "Yes. You can import candidates from CSV, bulk-extract from LinkedIn via the extension, or push records in through our API. All imported candidates become full entries in your searchable talent pool.",
  },
  {
    question: "How does AI candidate matching actually work?",
    answer:
      "We score candidates against job postings using a combination of skill overlap, seniority match, location or remote-friendliness, and role-title similarity. Every score comes with an explanation so you can see why the AI ranked a candidate highly — no black-box guessing.",
  },
  {
    question: "Do candidates have to create a hired.video account?",
    answer:
      "No. You can extract, store, and manage candidates entirely on your side. Candidates only sign up if they decide to create their own video resume or apply to one of your jobs — and then they get a full profile, not just a line item in your ATS.",
  },
  {
    question: "What does hired.video cost for recruiters?",
    answer:
      "Recruiters can start completely free on our Starter plan, which includes the Chrome extension, basic pipeline, and a limited talent pool. Paid plans unlock unlimited candidates, AI match scoring, team seats, and advanced analytics. See the pricing page for current tiers.",
  },
  {
    question: "Is hired.video GDPR compliant?",
    answer:
      "Yes. We support data subject access requests, right-to-delete, and regional data residency on enterprise plans. All candidate records are encrypted at rest and in transit, and you control retention windows on every talent pool.",
  },
];

export default function ForRecruiters() {
  const location = useLocation();
  useSEO(location.pathname);
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Users className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  For Recruiters
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Source, Screen &amp; Place Talent 3× Faster
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                hired.video gives recruiters a Chrome-powered sourcing engine,
                AI candidate matching, a visual hiring pipeline, and video resume
                screening — all in one workspace. Built for in-house talent teams,
                agencies, and solo recruiters.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Start Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/chrome-extension#recruiter">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Chrome className="mr-2 h-5 w-5" />
                    Get the Chrome Extension
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
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
                Everything a Modern Recruiter Needs
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
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
                How Recruiters Use hired.video
              </h2>
              <div className="grid md:grid-cols-4 gap-8">
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
                Built for Every Kind of Recruiter
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Briefcase,
                    title: "In-House Talent Teams",
                    desc: "Fill roles faster with AI sourcing and video screening. Collaborate with hiring managers inside the pipeline.",
                  },
                  {
                    icon: Globe,
                    title: "Staffing Agencies",
                    desc: "Manage multiple clients and talent pools in parallel. Share candidate shortlists with branded links.",
                  },
                  {
                    icon: Zap,
                    title: "Solo & Freelance Recruiters",
                    desc: "Get enterprise sourcing power without the enterprise price tag. Start free and scale as you grow.",
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
                What Recruiters Are Saying
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
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
                  <Shield className="h-4 w-4" /> GDPR compliant
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> SOC 2 in progress
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Encrypted at rest &amp; in transit
                </span>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="for-recruiters"
            subheading="Everything recruiters, sourcers, and talent teams ask before trying hired.video."
            items={FAQ_ITEMS}
          />

          {/* Final CTA */}
          <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
              <h3 className="text-3xl font-bold mb-4">
                Ready to Hire Faster?
              </h3>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Start sourcing candidates, scoring matches, and building a
                video-first pipeline today. Free to start, no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    Create a Recruiter Account
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">
                    View Recruiter Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
