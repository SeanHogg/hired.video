import { Link } from "react-router-dom";
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
  ClipboardCheck,
  Receipt,
  FlaskConical,
  MessageSquare,
  Plug,
  Network,
  Building2,
  BarChart3,
  Trophy,
  GraduationCap,
  MapPin,
  Eye,
} from "lucide-react";
import { PRO_MONTHLY_PRICE } from "@shared/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Shared content for "Hired.Video vs. competitor recruiting platforms".
// Lives in one file so the /vs-competitors and /pricing pages can't drift
// — every vendor, row, and per-competitor card renders from the same data.

export type Cell = "yes" | "no" | "partial" | string;

export interface Vendor {
  key: string;
  name: string;
  tagline: string;
  startingPrice: string;
  freeTier: Cell;
}

export const VENDORS: Vendor[] = [
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

export interface FeatureRow {
  feature: string;
  icon: React.ComponentType<{ className?: string }>;
  values: Record<string, Cell>;
  note?: string;
}

export const FEATURE_ROWS: FeatureRow[] = [
  {
    feature: "AI video resumes (built-in)",
    icon: Video,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "AI Studio (Canva-style multi-format editor — video, comics, games, podcasts)",
    icon: LayoutGrid,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "Voice cloning + TTS voice marketplace",
    icon: Mic,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "Async video interviews",
    icon: Video,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "partial", bullhorn: "partial" },
    note: "Greenhouse and Bullhorn integrate with HireVue/VidCruiter rather than ship native async interviewing.",
  },
  {
    feature: "Applicant Tracking System (ATS)",
    icon: Briefcase,
    values: { hired: "yes", loxo: "yes", linkedin: "partial", greenhouse: "yes", bullhorn: "yes" },
    note: "LinkedIn Recruiter is sourcing-first; ATS workflows happen in integrated systems.",
  },
  {
    feature: "Recruiting CRM",
    icon: Users,
    values: { hired: "yes", loxo: "yes", linkedin: "partial", greenhouse: "partial", bullhorn: "yes" },
  },
  {
    feature: "Public, consumer-facing job board",
    icon: Globe,
    values: { hired: "yes", loxo: "no", linkedin: "yes", greenhouse: "no", bullhorn: "no" },
    note: "Hired.Video and LinkedIn give jobs first-class consumer visibility. Greenhouse/Bullhorn rely on syndication and the customer's own career site.",
  },
  {
    feature: "Google for Jobs structured-data indexing",
    icon: Globe,
    values: { hired: "yes", loxo: "partial", linkedin: "yes", greenhouse: "yes", bullhorn: "yes" },
  },
  {
    feature: "Chrome extension for sourcing/job capture",
    icon: Chrome,
    values: { hired: "yes", loxo: "yes", linkedin: "yes", greenhouse: "partial", bullhorn: "partial" },
  },
  {
    feature: "AI candidate ↔ job match scoring",
    icon: Bot,
    values: { hired: "yes", loxo: "yes", linkedin: "yes", greenhouse: "partial", bullhorn: "partial" },
  },
  {
    feature: "Resume tailoring (per-job variations)",
    icon: FileText,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "AI interview practice for candidates",
    icon: Bot,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "Outreach campaigns + AI personalization",
    icon: Calendar,
    values: { hired: "yes", loxo: "yes", linkedin: "yes", greenhouse: "partial", bullhorn: "yes" },
  },
  {
    feature: "Free tier",
    icon: Sparkles,
    values: { hired: "yes", loxo: "yes", linkedin: "no", greenhouse: "no", bullhorn: "no" },
  },
  {
    feature: "Structured-hiring scorecards & interview kits",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "partial", linkedin: "no", greenhouse: "yes", bullhorn: "partial" },
    note: "Reusable scorecard templates with weighted rating attributes, multi-stage interview kits, per-evaluator submissions, aggregate debriefs, and final hiring-decision capture. Embedded into the candidate detail page.",
  },
  {
    feature: "Staffing-agency back-office (timesheets, placement billing, VMS)",
    icon: Receipt,
    values: { hired: "no", loxo: "partial", linkedin: "no", greenhouse: "no", bullhorn: "yes" },
    note: "Bullhorn's domain — contractor timesheets, placement invoicing, and VMS connectors. Hired.Video supports agency-recruiter sourcing in My Services, but not staffing back-office accounting.",
  },
  {
    feature: "Validated AI hiring assessments (predictive science)",
    icon: FlaskConical,
    values: { hired: "partial", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Hired.Video ships the full validated-inspired battery (Big Five via IPIP, cognitive sample, SJT, EQ, DISC, resume → predictive-index match) at /tools/predictive-assessments with per-run history AND calibrated percentile bands once the platform-wide norms cache has enough sample. HireVue's 20+ years of normed populations is still deeper, but the curve-recompute worker closes the gap as the user base grows.",
  },
  {
    feature: "Real-time chat (presence, typing, instant delivery)",
    icon: MessageSquare,
    values: { hired: "yes", loxo: "yes", linkedin: "yes", greenhouse: "partial", bullhorn: "partial" },
    note: "WebSocket transport at /api/chat/socket/:conversationId backed by a Cloudflare Durable Object — broadcasts message / typing / presence to every connected client. `useChatRoom` wraps client reconnect-with-backoff.",
  },
  {
    feature: "Large integration marketplace (hundreds of partners)",
    icon: Plug,
    values: { hired: "partial", loxo: "partial", linkedin: "yes", greenhouse: "yes", bullhorn: "yes" },
    note: "Greenhouse has ~600+ partners; Bullhorn has deep staffing back-office connectors. Hired.Video ships Greenhouse/Lever/Workday ATS connectors and OpenAPI 3.1, but isn't yet a marketplace at that scale.",
  },
  {
    feature: "Professional graph / consumer candidate network",
    icon: Network,
    values: { hired: "partial", loxo: "no", linkedin: "yes", greenhouse: "no", bullhorn: "no" },
    note: "LinkedIn's 1B-profile graph is structurally uncloneable in the short term. Hired.Video ships the graph QUERY surface — `/api/graph/mutuals/:userId`, `/api/graph/path/:userId` (1st / 2nd degree), and `/api/graph/top-introducers` for warm-intro ranking — on top of the existing `user_connections` table. The recruiter workflow on the graph is parity; the underlying 1B-profile reach is the remaining structural gap.",
  },
  {
    feature: "Enterprise sales motion (multi-tier seats, intent data, large-account contracts)",
    icon: Building2,
    values: { hired: "no", loxo: "partial", linkedin: "yes", greenhouse: "yes", bullhorn: "yes" },
    note: "Sales-Navigator-style intent tier, multi-tier Lite/Pro/Corporate seat matrix, and dedicated large-account contracts. Hired.Video is currently flat $9.95/seat with no enterprise tier.",
  },
  {
    feature: "Deep enterprise reporting (DEI, time-to-hire benchmarks, audit logs)",
    icon: BarChart3,
    values: { hired: "partial", loxo: "partial", linkedin: "partial", greenhouse: "yes", bullhorn: "yes" },
    note: "Hired.Video ships per-job + org-level time-to-hire (median / average / fastest / slowest, on JobDetail + the Globe Details drawer) and a unified Account Audit Log on Settings → Security (logins, password / email changes, locks, impersonation events, admin actions). DEI is partial: an aggregate anonymous funnel + source-mix panel ships on EmployerDashboard, but Greenhouse-grade EEO-1 dashboards require opt-in candidate demographic capture.",
  },
  {
    feature: "Gamification — points, streaks, badges + gift-card cashout",
    icon: Trophy,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "All 3 roles earn points + badges across daily streaks, applications, interviews, posts, and referrals. Sidebar PointsPill, fraud sweep nightly, and Tremendous-powered gift-card cashout + AI-credit / premium-month redemption. No competitor ships this end-to-end.",
  },
  {
    feature: "Learning pathways — SCORM 1.2, xAPI LRS, verified certificates",
    icon: GraduationCap,
    values: { hired: "yes", loxo: "no", linkedin: "partial", greenhouse: "no", bullhorn: "no" },
    note: "Native SCORM 1.2 runtime, xAPI LRS, DAG learning paths, HMAC-signed verifiable certificates, gamification hooks, and employer-side authoring. LinkedIn Learning is content-only — no SCORM ingestion, no DAG paths, no employer-author surface.",
  },
  {
    feature: "Map / geo-tagged discovery for jobs, events, people",
    icon: MapPin,
    values: { hired: "yes", loxo: "no", linkedin: "partial", greenhouse: "no", bullhorn: "no" },
    note: "Polymorphic `content_locations` table tags every searchable entity (jobs, articles, events, profiles) with a persistent geocoder cache. /map page renders pins via react-leaflet + OpenStreetMap (zero API cost) with bounds-driven refetch.",
  },
  {
    feature: "Per-section profile visibility controls (10 gateable sections)",
    icon: Eye,
    values: { hired: "yes", loxo: "no", linkedin: "partial", greenhouse: "no", bullhorn: "no" },
    note: "Candidates gate each section of /people/[id] independently (resume, video pitch, work history, certs, etc.) with role-keyed defaults via a shared resolver. LinkedIn offers profile-wide privacy, not per-section.",
  },
];

export interface CompetitorDetail {
  name: string;
  positioning: string;
  pricing: string;
  whereTheyShine: string[];
  whereHiredWins: string[];
}

export const COMPETITOR_DETAILS: CompetitorDetail[] = [
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
      "Gamification with gift-card cashout, learning pathways with SCORM, and a map discovery surface — all absent from LOXO",
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
      "LinkedIn Learning content library (separately licensed)",
    ],
    whereHiredWins: [
      "About 1/100th the cost of Recruiter Corporate per seat",
      "Native ATS, CRM, and async video interviews — Recruiter requires an external ATS",
      "Candidates get first-class tools too: AI video resumes, interview practice, and resume tailoring",
      "SCORM 1.2 + xAPI + employer-authored learning paths (LinkedIn Learning is content-only)",
      "Per-section profile visibility, gift-card-cashout gamification, and a /map surface — none ship on LinkedIn",
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
      "Gamification, learning pathways, and map-based discovery shipped end-to-end — not partner-vendor add-ons",
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
      "Candidate-facing surface — gamification, learning paths, public profile, map discovery — that Bullhorn doesn't ship at all",
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
      "Candidate-side product: video resumes, AI Studio, interview practice, gamification, learning pathways",
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
      "Candidates get an AI studio, voice cloning, resume tools, gamification, and learning pathways — not just an interview portal",
    ],
  },
];

export function CellIcon({ value }: { value: Cell }) {
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
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50"
        title="Partial / via integration"
      >
        <Minus className="h-4 w-4 text-amber-600" aria-label="Partial / via integration" />
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">{value}</span>;
}

// JSON-LD ItemList for the comparison. The /vs-competitors page registers
// this in <head> via useSEO; the pricing page already has its own
// Product/Offer schema, so we don't duplicate JSON-LD there.
export function buildComparisonStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Hired.Video vs. competitor recruiting platforms",
    description:
      "Side-by-side comparison of Hired.Video against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue, and VidCruiter for AI video resumes, ATS, recruiting CRM, gamification, learning pathways, and pricing.",
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

export interface CompetitorComparisonProps {
  /** Override the top-level heading. Defaults to "Pricing at a glance" /
   *  "Feature comparison" / "Hired.Video vs. each competitor" / "Why teams
   *  switch to Hired.Video". Pass `eyebrow` instead to add a small label
   *  above the first section. */
  eyebrow?: string;
  /** When true, opens with a compact heading + sub-copy block that frames
   *  the whole comparison block (useful when embedding in pricing where
   *  there's no dedicated hero for it). */
  showSectionHeader?: boolean;
}

export default function CompetitorComparison({
  eyebrow,
  showSectionHeader = false,
}: CompetitorComparisonProps = {}) {
  return (
    <>
      {showSectionHeader && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          {eyebrow && (
            <Badge className="mb-3" variant="outline">
              <Trophy className="h-4 w-4 mr-1" /> {eyebrow}
            </Badge>
          )}
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            How Hired.Video compares
          </h2>
          <p className="text-muted-foreground">
            Side-by-side against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn,
            HireVue, and VidCruiter — pricing, ATS/CRM, AI video resumes, voice
            cloning, async interviews, gamification, and learning pathways.
          </p>
        </div>
      )}

      {/* Pricing-at-a-glance */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">Pricing at a glance</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Starting prices for the lowest-tier paid plan most teams actually
              buy. Free tiers and per-seat costs noted where published;
              enterprise plans are typically custom-quoted.
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
                  <td className="p-4 text-muted-foreground">
                    Enterprise async video interviewing
                  </td>
                  <td className="p-4">From ~$35,000/yr (custom)</td>
                  <td className="p-4">
                    <CellIcon value="no" />
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="p-4 font-semibold">VidCruiter</td>
                  <td className="p-4 text-muted-foreground">
                    Mid-market structured video interviews
                  </td>
                  <td className="p-4">From ~$5,000/yr (custom)</td>
                  <td className="p-4">
                    <CellIcon value="no" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            Pricing as of April 2026, sourced from vendor pricing pages and
            recent third-party reporting (Pin, Capterra, G2, Vendr, Juicebox,
            augtal). Verify with each vendor before purchase.
          </p>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-muted/20 rounded-xl">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
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
                              <div className="text-xs text-muted-foreground mt-1">
                                {row.note}
                              </div>
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
            <span className="flex items-center gap-1.5">
              <CellIcon value="yes" /> Included
            </span>
            <span className="flex items-center gap-1.5">
              <CellIcon value="partial" /> Partial / via integration
            </span>
            <span className="flex items-center gap-1.5">
              <CellIcon value="no" /> Not available
            </span>
          </div>
        </div>
      </section>

      {/* Per-competitor detail */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">
              Hired.Video vs. each competitor
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Where each platform is genuinely strong, and where Hired.Video
              beats them.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {COMPETITOR_DETAILS.map((c) => (
              <Card key={c.name} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-2xl">
                    Hired.Video vs {c.name}
                  </CardTitle>
                  <CardDescription>{c.positioning}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 flex-1">
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Pricing</h4>
                    <p className="text-sm text-muted-foreground">{c.pricing}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Where {c.name} shines
                    </h4>
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
                    <h4 className="text-sm font-semibold mb-2">
                      Where Hired.Video wins
                    </h4>
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

      {/* Why Hired.Video — three value-prop cards */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-brand-purple/5 via-background to-brand-blue/5 rounded-xl">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">
              Why teams switch to Hired.Video
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              One platform that hires faster, costs less, and treats candidates
              like the people doing the work.
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
                  board, candidate community, learning pathways, gamification,
                  and AI tooling — all under one seat.
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
                  ${PRO_MONTHLY_PRICE.toFixed(2)}/seat/mo flat, with a real free
                  tier and metered AI tokens — no implementation fee, no
                  module-by-module upcharges, no annual renewal hike.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-10">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue text-white"
              >
                Start free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
