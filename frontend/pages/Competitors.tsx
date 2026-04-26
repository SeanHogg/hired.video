import { useLocation, Link } from "react-router-dom";
import {
  Check,
  X,
  Minus,
  Sparkles,
  ArrowRight,
  Video,
  Mic,
  LayoutGrid,
  Briefcase,
  Users,
  Chrome,
  Bot,
  FileText,
  Calendar,
  Globe,
  ShieldCheck,
  Trophy,
  ClipboardCheck,
  Receipt,
  FlaskConical,
  MessageSquare,
  Plug,
  Network,
  Building2,
  BarChart3,
} from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
import { PRO_MONTHLY_PRICE } from "@shared/pricing";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Cell = "yes" | "no" | "partial" | string;

interface Vendor {
  key: string;
  name: string;
  tagline: string;
  startingPrice: string;
  freeTier: Cell;
}

const VENDORS: Vendor[] = [
  {
    key: "hired",
    name: "Hired.Video",
    tagline: "All-in-one video-first hiring platform",
    startingPrice: `$${PRO_MONTHLY_PRICE.toFixed(2)}/seat/mo`,
    freeTier: "yes",
  },
  {
    key: "loxo",
    name: "LOXO",
    tagline: "AI sourcing + ATS/CRM",
    startingPrice: "$169/user/mo (Basic)",
    freeTier: "yes",
  },
  {
    key: "linkedin",
    name: "LinkedIn Recruiter",
    tagline: "Sourcing on the LinkedIn graph",
    startingPrice: "$170/mo (Lite) · $835–$1,080/seat/mo (Corporate)",
    freeTier: "no",
  },
  {
    key: "greenhouse",
    name: "Greenhouse",
    tagline: "Structured-hiring ATS",
    startingPrice: "From ~$6,500/yr (custom)",
    freeTier: "no",
  },
  {
    key: "bullhorn",
    name: "Bullhorn",
    tagline: "Staffing-agency ATS + CRM",
    startingPrice: "$99–$315/user/mo (custom)",
    freeTier: "no",
  },
];

interface FeatureRow {
  feature: string;
  icon: React.ComponentType<{ className?: string }>;
  values: Record<string, Cell>;
  note?: string;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    feature: "AI video resumes (built-in)",
    icon: Video,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "AI Studio (Canva-style video editor)",
    icon: LayoutGrid,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "Voice cloning + TTS voice marketplace",
    icon: Mic,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "Async video interviews",
    icon: Video,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "partial",
      bullhorn: "partial",
    },
    note: "Greenhouse and Bullhorn integrate with HireVue/VidCruiter rather than ship native async interviewing.",
  },
  {
    feature: "Applicant Tracking System (ATS)",
    icon: Briefcase,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "partial",
      greenhouse: "yes",
      bullhorn: "yes",
    },
    note: "LinkedIn Recruiter is sourcing-first; ATS workflows happen in integrated systems.",
  },
  {
    feature: "Recruiting CRM",
    icon: Users,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "partial",
      greenhouse: "partial",
      bullhorn: "yes",
    },
  },
  {
    feature: "Public, consumer-facing job board",
    icon: Globe,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "yes",
      greenhouse: "no",
      bullhorn: "no",
    },
    note: "Hired.Video and LinkedIn give jobs first-class consumer visibility. Greenhouse/Bullhorn rely on syndication and the customer's own career site.",
  },
  {
    feature: "Google for Jobs structured-data indexing",
    icon: Globe,
    values: {
      hired: "yes",
      loxo: "partial",
      linkedin: "yes",
      greenhouse: "yes",
      bullhorn: "yes",
    },
  },
  {
    feature: "Chrome extension for sourcing/job capture",
    icon: Chrome,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "yes",
      greenhouse: "partial",
      bullhorn: "partial",
    },
  },
  {
    feature: "AI candidate ↔ job match scoring",
    icon: Bot,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "yes",
      greenhouse: "partial",
      bullhorn: "partial",
    },
  },
  {
    feature: "Resume tailoring (per-job variations)",
    icon: FileText,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "AI interview practice for candidates",
    icon: Bot,
    values: {
      hired: "yes",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "Outreach campaigns + AI personalization",
    icon: Calendar,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "yes",
      greenhouse: "partial",
      bullhorn: "yes",
    },
  },
  {
    feature: "Free tier",
    icon: Sparkles,
    values: {
      hired: "yes",
      loxo: "yes",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
  },
  {
    feature: "Structured-hiring scorecards & interview kits",
    icon: ClipboardCheck,
    values: {
      hired: "partial",
      loxo: "partial",
      linkedin: "no",
      greenhouse: "yes",
      bullhorn: "partial",
    },
    note: "Greenhouse's signature workflow — scorecards, interview kits, and structured debriefs. Hired.Video has video screening, scheduling, and AI feedback today, but not a full Greenhouse-style scorecard system.",
  },
  {
    feature: "Staffing-agency back-office (timesheets, placement billing, VMS)",
    icon: Receipt,
    values: {
      hired: "no",
      loxo: "partial",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "yes",
    },
    note: "Bullhorn's domain — contractor timesheets, placement invoicing, and VMS connectors. Hired.Video supports agency-recruiter sourcing in My Services, but not staffing back-office accounting.",
  },
  {
    feature: "Validated AI hiring assessments (predictive science)",
    icon: FlaskConical,
    values: {
      hired: "no",
      loxo: "no",
      linkedin: "no",
      greenhouse: "no",
      bullhorn: "no",
    },
    note: "HireVue's moat — 20+ years of validated predictive assessments. Hired.Video has AI candidate↔job match scoring, not a validated psychometric assessment battery. Different product.",
  },
  {
    feature: "Real-time chat (presence, typing, instant delivery)",
    icon: MessageSquare,
    values: {
      hired: "partial",
      loxo: "yes",
      linkedin: "yes",
      greenhouse: "partial",
      bullhorn: "partial",
    },
    note: "LinkedIn InMail and modern ATSes ship WebSocket-backed presence and typing indicators. Hired.Video chat is REST-based today; WebSocket transport is on the roadmap.",
  },
  {
    feature: "Large integration marketplace (hundreds of partners)",
    icon: Plug,
    values: {
      hired: "partial",
      loxo: "partial",
      linkedin: "yes",
      greenhouse: "yes",
      bullhorn: "yes",
    },
    note: "Greenhouse has ~600+ partners; Bullhorn has deep staffing back-office connectors. Hired.Video ships Greenhouse/Lever/Workday ATS connectors and OpenAPI 3.1, but isn't yet a marketplace at that scale.",
  },
  {
    feature: "Professional graph / consumer candidate network",
    icon: Network,
    values: {
      hired: "no",
      loxo: "no",
      linkedin: "yes",
      greenhouse: "no",
      bullhorn: "no",
    },
    note: "LinkedIn's 1B-profile professional graph and InMail reach are a real moat. Hired.Video has a public job board with Google-for-Jobs indexing, but not a consumer-scale candidate network.",
  },
  {
    feature: "Enterprise sales motion (multi-tier seats, intent data, large-account contracts)",
    icon: Building2,
    values: {
      hired: "no",
      loxo: "partial",
      linkedin: "yes",
      greenhouse: "yes",
      bullhorn: "yes",
    },
    note: "Sales-Navigator-style intent tier, multi-tier Lite/Pro/Corporate seat matrix, and dedicated large-account contracts. Hired.Video is currently flat $9.95/seat with no enterprise tier.",
  },
  {
    feature: "Deep enterprise reporting (DEI, time-to-hire benchmarks, audit logs)",
    icon: BarChart3,
    values: {
      hired: "partial",
      loxo: "partial",
      linkedin: "partial",
      greenhouse: "yes",
      bullhorn: "yes",
    },
    note: "Greenhouse top-tier ships DEI dashboards, time-to-hire benchmarking, and deep audit-trail features. Hired.Video has analytics but not at this depth or audit-trail rigor.",
  },
];

interface CompetitorDetail {
  name: string;
  positioning: string;
  pricing: string;
  whereTheyShine: string[];
  whereHiredWins: string[];
}

const COMPETITOR_DETAILS: CompetitorDetail[] = [
  {
    name: "LOXO",
    positioning:
      "Recruiting platform that combines an ATS, CRM, and a 1.2B-profile sourcing database, with a free single-user tier and paid plans built around AI sourcing and outreach.",
    pricing:
      "Free (1 user). Basic at $169/user/mo. Professional and Enterprise are custom-quoted; AI sourcing and automated outreach sit on Professional and above.",
    whereTheyShine: [
      "Massive sourcing database with personal-contact enrichment",
      "Mature integrated ATS + CRM workflow",
      "Loxo Boost Chrome extension for profile capture",
    ],
    whereHiredWins: [
      "$9.95/seat/mo Pro vs. $169/user/mo Basic — and AI is on the Free tier",
      "Native AI video resumes, AI Studio editor, and voice cloning — LOXO has none of these",
      "Built-in consumer job board with Google-for-Jobs indexing, plus a candidate-facing app (interview practice, resume tailor, public profiles)",
    ],
  },
  {
    name: "LinkedIn Recruiter",
    positioning:
      "Sourcing on top of the LinkedIn graph. Recruiter Lite is for individuals with 5-seat cap and limited filters; Recruiter Corporate unlocks the full network, ATS integrations, and AI features.",
    pricing:
      "Recruiter Lite from $170/mo (~$1,680/yr) per seat. Recruiter Corporate is custom-quoted at roughly $835–$1,080 per seat per month based on third-party reporting. No free tier.",
    whereTheyShine: [
      "Unmatched access to the LinkedIn professional graph",
      "InMail and warm-network signal at scale",
      "Brand-of-record for sourcing in many enterprises",
    ],
    whereHiredWins: [
      "About 1/100th the cost of Recruiter Corporate per seat",
      "Native ATS, CRM, and async video interviews — Recruiter requires an external ATS",
      "Candidates get first-class tools too: AI video resumes, interview practice, and resume tailoring",
    ],
  },
  {
    name: "Greenhouse",
    positioning:
      "Structured-hiring ATS aimed at mid-market and enterprise teams. Strong scorecards, reporting, and integration ecosystem.",
    pricing:
      "No public pricing. Reported entry around ~$6,500/yr at small headcounts; enterprise contracts commonly $40K+/yr. Sourcing, CRM, and analytics are paid add-ons. Implementation fees of $1K–$15K are typical.",
    whereTheyShine: [
      "Best-in-class structured interview workflows and scorecards",
      "Deep partner ecosystem of integrations",
      "Strong compliance and audit-trail features at the top tier",
    ],
    whereHiredWins: [
      "Transparent, flat $9.95/seat/mo with a real free tier — no implementation fees",
      "Sourcing CRM, video interviews, and AI tooling are included, not paid add-ons",
      "Video-first candidate experience that Greenhouse delegates to integrated vendors",
    ],
  },
  {
    name: "Bullhorn",
    positioning:
      "ATS + CRM dominant in staffing and recruiting agencies, with strong placement workflow, contracting, and back-office capabilities.",
    pricing:
      "Custom-quoted, generally $99–$315/user/mo depending on tier, with annual contracts often starting at $20K+ for small teams. Implementation $1K–$50K+. Add-ons (automation, analytics) priced separately; renewal increases of ~20% are commonly reported.",
    whereTheyShine: [
      "Deep agency-recruiting workflow (placements, timesheets, contracting)",
      "Robust candidate database and longitudinal CRM",
      "Mature integration marketplace for staffing back-office tools",
    ],
    whereHiredWins: [
      "Predictable per-seat pricing with no implementation fee",
      "Native video resume, interview, and outreach tooling — no per-module upcharge",
      "Full agency-recruiter mode in My Services, including pitch decks and shareable candidate links",
    ],
  },
  {
    name: "HireVue",
    positioning:
      "Enterprise video-interviewing and AI candidate-assessment platform, focused on high-volume hiring (retail, ops, customer service).",
    pricing:
      "Reported to start around $35,000/yr; enterprise contracts only. No free tier.",
    whereTheyShine: [
      "Mature high-volume async video interview workflow",
      "Long-running assessment science and validation work",
    ],
    whereHiredWins: [
      "A complete platform — ATS, CRM, job board, candidate tools — not just interviews",
      "Self-serve pricing starting at $0 versus a five-figure enterprise contract",
      "Candidate-side product: video resumes, AI Studio, interview practice",
    ],
  },
  {
    name: "VidCruiter",
    positioning:
      "Mid-market video interviewing with structured scoring. Uses AI for transcription/notes, leaves evaluation to humans.",
    pricing:
      "Reported to start around $5,000/yr; quoted per-deployment. No free tier.",
    whereTheyShine: [
      "Structured video interview scoring and re-record flow",
      "Compliance-conscious AI usage (transcription, not auto-scoring)",
    ],
    whereHiredWins: [
      "$9.95/seat/mo with a free tier vs. four-figure annual contracts",
      "ATS, CRM, sourcing, and a consumer job board are included",
      "Candidates get an AI studio, voice cloning, and resume tools — not just an interview portal",
    ],
  },
];

const FAQS = [
  {
    question: "How can Hired.Video charge $9.95/seat/mo when LOXO Basic is $169 and Greenhouse contracts run tens of thousands?",
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
    question: "How accurate is this comparison?",
    answer:
      "Pricing and feature claims are sourced from vendor-published pricing pages and recent third-party reporting (Pin, Capterra, G2, Vendr, Juicebox, augtal) as of April 2026. Vendors change pricing frequently and most enterprise plans are custom-quoted — verify the latest numbers directly with each vendor before purchase.",
  },
];

function CellIcon({ value }: { value: Cell }) {
  if (value === "yes") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100">
        <Check className="h-4 w-4 text-green-700" aria-label="Yes" />
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50">
        <X className="h-4 w-4 text-red-600" aria-label="No" />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50" title="Partial / via integration">
        <Minus className="h-4 w-4 text-amber-600" aria-label="Partial / via integration" />
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">{value}</span>;
}

// FAQPage schema is emitted by <MarketingFAQ /> below — keep this builder
// focused on the comparison ItemList so we don't duplicate the FAQ JSON-LD.
function buildStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Hired.Video vs. competitor recruiting platforms",
    description:
      "Side-by-side comparison of Hired.Video against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue, and VidCruiter for AI video resumes, ATS, recruiting CRM, and pricing.",
    itemListElement: VENDORS.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: v.name,
        description: v.tagline,
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          description: v.startingPrice,
        },
      },
    })),
  };
}

export default function Competitors() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  useSEO(location.pathname, {
    title:
      "vs Competition (2026): LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue & VidCruiter — hired.video",
    description:
      "Side-by-side comparison of hired.video against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue, and VidCruiter. Pricing, ATS, recruiting CRM, AI video resumes, voice cloning, and async interviews — what's included and what costs extra in 2026.",
    keywords:
      "hired.video vs LOXO, hired.video vs LinkedIn Recruiter, LOXO alternative, LinkedIn Recruiter alternative, Greenhouse alternative, Bullhorn alternative, HireVue alternative, VidCruiter alternative, ATS comparison 2026, AI video resume platform comparison, recruiting CRM comparison, all-in-one recruiting software",
    structuredData: buildStructuredData(),
  });
  useBreadcrumbs([{ name: "Hired.Video vs Competition", url: "/vs-competitors" }]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main className="pt-16">
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
                Greenhouse, Bullhorn, HireVue, and VidCruiter — pricing,
                ATS/CRM, AI video resumes, voice cloning, and async interviews,
                side by side.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                <Badge variant="secondary">${PRO_MONTHLY_PRICE.toFixed(2)}/seat/mo Pro</Badge>
                <Badge variant="secondary">Free tier — no credit card</Badge>
                <Badge variant="secondary">All-in-one platform</Badge>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue text-white">
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

          {/* Pricing-at-a-glance */}
          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-3">Pricing at a glance</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Starting prices for the lowest-tier paid plan most teams
                  actually buy. Free tiers and per-seat costs noted where
                  published; enterprise plans are typically custom-quoted.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-4 font-semibold">Vendor</th>
                      <th className="text-left p-4 font-semibold">Positioning</th>
                      <th className="text-left p-4 font-semibold">Starting price</th>
                      <th className="text-left p-4 font-semibold">Free tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VENDORS.map((v) => (
                      <tr
                        key={v.key}
                        className={`border-t ${v.key === "hired" ? "bg-brand-purple/5" : ""}`}
                      >
                        <td className="p-4 font-semibold whitespace-nowrap">
                          {v.name}
                          {v.key === "hired" && (
                            <Badge className="ml-2" variant="outline">
                              You're here
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">{v.tagline}</td>
                        <td className="p-4">{v.startingPrice}</td>
                        <td className="p-4">
                          <CellIcon value={v.freeTier} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="p-4 font-semibold">HireVue</td>
                      <td className="p-4 text-muted-foreground">Enterprise async video interviewing</td>
                      <td className="p-4">From ~$35,000/yr (custom)</td>
                      <td className="p-4"><CellIcon value="no" /></td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-4 font-semibold">VidCruiter</td>
                      <td className="p-4 text-muted-foreground">Mid-market structured video interviews</td>
                      <td className="p-4">From ~$5,000/yr (custom)</td>
                      <td className="p-4"><CellIcon value="no" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Pricing as of April 2026, sourced from vendor pricing pages and
                recent third-party reporting (Pin, Capterra, G2, Vendr,
                Juicebox, augtal). Verify with each vendor before purchase.
              </p>
            </div>
          </section>

          {/* Feature comparison table */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-3">Feature comparison</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Capabilities that ship out of the box, without paid add-ons or
                  third-party integrations.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-4 font-semibold sticky left-0 bg-muted/40 z-10 min-w-[260px]">
                        Capability
                      </th>
                      {VENDORS.map((v) => (
                        <th
                          key={v.key}
                          className={`text-center p-4 font-semibold whitespace-nowrap ${v.key === "hired" ? "bg-brand-purple/5" : ""}`}
                        >
                          {v.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_ROWS.map((row) => {
                      const Icon = row.icon;
                      return (
                        <tr key={row.feature} className="border-t">
                          <td className="p-4 sticky left-0 bg-background z-10">
                            <div className="flex items-start gap-2">
                              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                              <div>
                                <div className="font-medium">{row.feature}</div>
                                {row.note && (
                                  <div className="text-xs text-muted-foreground mt-1">{row.note}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          {VENDORS.map((v) => (
                            <td
                              key={v.key}
                              className={`p-4 text-center ${v.key === "hired" ? "bg-brand-purple/5" : ""}`}
                            >
                              <CellIcon value={row.values[v.key]} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><CellIcon value="yes" /> Included</span>
                <span className="flex items-center gap-1.5"><CellIcon value="partial" /> Partial / via integration</span>
                <span className="flex items-center gap-1.5"><CellIcon value="no" /> Not available</span>
              </div>
            </div>
          </section>

          {/* Per-competitor detail */}
          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-3">Hired.Video vs. each competitor</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Where each platform is genuinely strong, and where Hired.Video
                  beats them.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {COMPETITOR_DETAILS.map((c) => (
                  <Card key={c.name} className="flex flex-col">
                    <CardHeader>
                      <CardTitle className="text-2xl">Hired.Video vs {c.name}</CardTitle>
                      <CardDescription>{c.positioning}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Pricing</h4>
                        <p className="text-sm text-muted-foreground">{c.pricing}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Where {c.name} shines</h4>
                        <ul className="space-y-1.5">
                          {c.whereTheyShine.map((t) => (
                            <li key={t} className="text-sm flex items-start gap-2">
                              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Where Hired.Video wins</h4>
                        <ul className="space-y-1.5">
                          {c.whereHiredWins.map((t) => (
                            <li key={t} className="text-sm flex items-start gap-2">
                              <Sparkles className="h-4 w-4 text-brand-purple mt-0.5 flex-shrink-0" />
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Why Hired.Video */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-brand-purple/5 via-background to-brand-blue/5">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-3">Why teams switch to Hired.Video</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  One platform that hires faster, costs less, and treats
                  candidates like the people doing the work.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <Video className="h-8 w-8 text-brand-purple mb-2" />
                    <CardTitle>Video-first by default</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      AI video resumes, an AI Studio editor, voice cloning, and
                      async video interviews are core product — not a separate
                      vendor invoice.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <LayoutGrid className="h-8 w-8 text-brand-blue mb-2" />
                    <CardTitle>One platform, not five</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      ATS, recruiting CRM, sourcing Chrome extension, public job
                      board, candidate community, and AI tooling — all under one
                      seat.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <ShieldCheck className="h-8 w-8 text-green-600 mb-2" />
                    <CardTitle>Honest pricing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      $9.95/seat/mo flat, with a real free tier and metered AI
                      tokens — no implementation fee, no module-by-module
                      upcharges, no annual renewal hike.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

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
                Start free in 60 seconds. Bring your team when you're ready —
                Pro is ${PRO_MONTHLY_PRICE.toFixed(2)} per seat per month, with a
                20% discount on annual.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link to="/signup">
                  <Button size="lg" variant="secondary">
                    Start free <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="bg-transparent text-white border-white hover:bg-white/10">
                    See full pricing
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
