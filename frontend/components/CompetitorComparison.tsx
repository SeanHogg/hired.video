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
  Flame,
  CalendarCheck,
  MessageCircle,
  Coins,
  Inbox,
  Coffee,
  UserPlus,
  PlaySquare,
  KeyRound,
  TrendingUp,
  Layers,
  Image as ImageIcon,
  Headphones,
  UserCircle,
  Languages,
  Accessibility,
  Smartphone,
  FileSpreadsheet,
  Stamp,
  Wallet,
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
    note: "Hired.Video's recruiter extension captures profiles from any site, surfaces personal email + phone + LinkedIn/GitHub/X/website with click-to-call, click-to-email, and click-to-SMS, drops candidates directly onto an open job's pipeline, edits tags inline, and auto-logs every action to the candidate activity timeline — feature parity with Loxo Boost.",
  },
  {
    feature: "Profile contact + social enrichment from capture (email, phone, LinkedIn, GitHub, X, website)",
    icon: Chrome,
    values: { hired: "yes", loxo: "yes", linkedin: "partial", greenhouse: "no", bullhorn: "partial" },
    note: "Both Hired.Video and LOXO pull personal email + phone + social URLs straight off the captured page. LinkedIn keeps email/phone behind InMail and Sales Navigator unlocks. Greenhouse has no capture extension at all.",
  },
  {
    feature: "Click-to-call / email / SMS from the extension",
    icon: Chrome,
    values: { hired: "yes", loxo: "yes", linkedin: "partial", greenhouse: "no", bullhorn: "partial" },
    note: "Hired.Video uses OS-native tel:/mailto:/sms: handoff (zero VoIP licence cost) and auto-logs each outreach as an interaction. LOXO ships its own VoIP layer at a higher per-seat price.",
  },
  {
    feature: "One-click submit to a job + auto-logged activity timeline from the extension",
    icon: Chrome,
    values: { hired: "yes", loxo: "yes", linkedin: "partial", greenhouse: "no", bullhorn: "partial" },
    note: "Capture → tag → submit → log all happens in the side panel without leaving the sourcing page.",
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
    feature: "One-master-resume sync to LinkedIn / Indeed / Glassdoor / ZipRecruiter / Monster / Wellfound / Dice / GitHub",
    icon: Chrome,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Hired.Video's Chrome extension extracts profile edits back into your master resume on 8 vendors and auto-fills Headline + Summary on 7 (password-manager UX — you open the edit modal, click Auto-fill, review, save). LinkedIn locks profile data in by design; the other platforms have no equivalent.",
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
    feature: "Calibration sessions (multi-evaluator bar-alignment)",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "yes", bullhorn: "no" },
    note: "3-6 interviewers re-score past candidates blind; the system reveals per-attribute deltas vs. the real hire decision. Used quarterly to onboard new interviewers and keep the bar aligned. Greenhouse + Lever + Ashby ship this at enterprise tiers; hired.video includes it in the standard Recruiter Pro seat.",
  },
  {
    feature: "Blind / anonymous interview review",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "yes", bullhorn: "no" },
    note: "Kit-level policy hides candidate name + photo from the evaluator's scorecard view, and hides peer scorecards until the current evaluator submits. Both axes reduce halo-effect + groupthink bias.",
  },
  {
    feature: "Inline bias linter on free-text scorecard feedback",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "LLM-powered linter runs while the evaluator types — flags coded language ('culture fit', 'abrasive', gendered descriptors, age-correlated terms) inline with severity + suggested rewrite. Greenhouse flags aggregate-rating disparity AFTER the loop; hired.video catches problematic language BEFORE submit.",
  },
  {
    feature: "Take-home assignments (candidate magic-link delivery)",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "partial", bullhorn: "no" },
    note: "Recruiter mints a per-candidate invite, candidate delivers via GitHub URL / shared doc / pasted code / link, reviewer scorecard is auto-bound to the take-home submission via the same rubric. Greenhouse's Assignment Stage requires a HackerRank / CodeSignal subscription; hired.video ships native.",
  },
  {
    feature: "Cross-template competency framework + leveled rubrics",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "yes", bullhorn: "no" },
    note: "Reusable competency primitives with L1–L7 anchors that scorecard attributes reference by ID. Two templates rating 'Technical Depth' now produce comparable cross-role analytics. Greenhouse charges enterprise pricing for this; hired.video includes it standard.",
  },
  {
    feature: "Interviewer reliability tracking (SLA + on-time %)",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Per-interviewer panel showing avg submission lag, on-time %, overdue draft count, and 30-day activity. Backed by hourly SLA-reminder worker that nudges (in-app + email) at 4h-before-due and escalates to the kit's hiring manager 24h-past-due.",
  },
  {
    feature: "AI question generator calibrated to competency + level",
    icon: ClipboardCheck,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "When the kit's coverage badge flags a competency with no questions, one click suggests 3 calibrated STAR-style questions tagged to that competency at the chosen level (L1–L7). Reuses the platform LLM stack — no third-party tool required.",
  },
  {
    feature: "Staffing-agency back-office (timesheets + placement billing + accounting connectors)",
    icon: Receipt,
    values: { hired: "yes", loxo: "partial", linkedin: "no", greenhouse: "no", bullhorn: "yes" },
    note: "Shipped end-to-end in the Workforce module (#1349). Punch in/out against tasks → weekly timesheet envelope with approval workflow → on approve, auto-derived invoice line items (against placement bill rate) + contractor payout-ledger accrual (against pay rate), idempotent on re-approve. Multi-tenant AR: invoice.recipientCompanyId isolates agency-to-client billing. Marketing surface at /for-agencies. The remaining structural gap vs Bullhorn is VMS / MSP portal connectors — logged as roadmap.",
  },
  {
    feature: "Compliance doc vault (I-9, W-9, W-8BEN, COI, BG check, MSA, SOW, NDA, offer letter) with native + DocuSign e-signature",
    icon: Stamp,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "partial", bullhorn: "yes" },
    note: "placement_documents table (#1349 Phase 4) with R2 upload, native e-sign flow, DocuSign connector, expiry tracking, nightly cleanup. Either bound to a single placement or to a (company × user) for re-use across placements.",
  },
  {
    feature: "Accounting + payroll + payments connectors (QuickBooks Online, Xero, Gusto, DocuSign, Helcim)",
    icon: Plug,
    values: { hired: "yes", loxo: "partial", linkedin: "no", greenhouse: "partial", bullhorn: "yes" },
    note: "company_integrations table (#1441) holds AES-GCM-encrypted OAuth tokens per (company × provider). Workforce derivation pushes invoices / payouts outbound automatically. Connectors at services/workforce/connectors/{quickbooks,xero,gusto,esign-docusign,helcim-billing}.ts.",
  },
  {
    feature: "Per-placement P&L / desk margin reporting (revenue · contractor pay · gross margin)",
    icon: FileSpreadsheet,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "yes" },
    note: "DeskMarginRow projection: YTD revenue, contractor pay, gross margin, approved-timesheet count per placement. Sorted by margin desc, with drill-through to the placement detail screen. Recruiter Pro tier.",
  },
  {
    feature: "Recruiter commission ledger + split fanout (multi-recruiter sourcer/manager splits)",
    icon: Wallet,
    values: { hired: "yes", loxo: "partial", linkedin: "no", greenhouse: "no", bullhorn: "yes" },
    note: "placements.commission{Percentage,Amount,Status,PaidDate} + placement_splits fan a single placement out to multiple recruiters; on timesheet approval, PayoutLedgerService.recordAccrual writes to the payout ledger, surfaced on the recruiter placement detail screen.",
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
    feature: "Direct messaging to any user (no paywall, no InMail credit cap)",
    icon: Inbox,
    values: { hired: "yes", loxo: "partial", linkedin: "partial", greenhouse: "partial", bullhorn: "partial" },
    note: "LinkedIn restricts free users to 1st-degree DMs and meters InMail to non-connections (≈100–150/mo on Recruiter Corporate at ~$1,080/seat/mo). Hired.Video's `/api/messages/conversations` lets any authenticated user start a conversation with any other user — no credit cap, no per-message price. AI-personalized message body is a Pro upgrade, not a wall on reachability.",
  },
  {
    feature: "Warm-intro request through a mutual connection",
    icon: UserPlus,
    values: { hired: "yes", loxo: "no", linkedin: "yes", greenhouse: "no", bullhorn: "no" },
    note: "On `/people/:id`, the WarmIntroRequestButton fetches `/api/graph/mutuals/:userId`, lets the viewer pick a mutual, and POSTs `/api/graph/intro` — which spins up a private DM between viewer and mutual carrying the ask. Mutual decides whether to forward. Closes the LinkedIn 'Get introduced' workflow without paid InMail.",
  },
  {
    feature: '"Grab a coffee" meetup invites — calendar event + shared task on accept',
    icon: Coffee,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Gated on the recipient's `openToCoffee` profile section. On accept, CoffeeRequestService writes one `scheduled_events` row (type='coffee'), two `event_attendees`, and a shared task in one transaction. Coffee pins also surface on the `/map` page for the opted-in audience. No competitor ships a native coffee-meetup primitive — LinkedIn punts the scheduling to Calendly.",
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
    feature: "Built-in learning content library (AI / RAG / must-have skills)",
    icon: GraduationCap,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Platform-seeded courses on AI fundamentals, Retrieval-Augmented Generation, and the AI-era must-have skills ship as part of every plan — including Free. LinkedIn Learning's content library is a separate ~$379/seat/yr SKU on top of Recruiter; Greenhouse, Bullhorn, and LOXO don't ship learning content at all. Surface lives at /tools?tab=learning (alias: /learning).",
  },
  {
    feature: "Classrooms — cohorts, assigned/required training + due dates, live progress monitoring",
    icon: GraduationCap,
    values: { hired: "yes", loxo: "no", linkedin: "partial", greenhouse: "no", bullhorn: "no" },
    note: "Educators and employers group learners into a classroom (self-serve join code or email invite), assign any course or learning path with a due date + required flag, and watch a live per-student progress roll-up (completed / in-progress / overdue, with scores) at /tools?tab=classrooms. This is the i-Ready / LMS administration layer — but on a platform where finishing the training feeds straight into getting hired, and where every lesson is gamified (points / streaks / badges) which i-Ready and LinkedIn Learning don't do. LinkedIn Learning can assign content but has no cohort progress dashboard for a non-admin educator and no employment funnel; Greenhouse, Bullhorn, and LOXO have no learning surface at all.",
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
  {
    feature: "Resume Roast viral engine + LinkedIn share card",
    icon: Flame,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "AI-generated playful roast + visible score + LinkedIn share intent + PNG card download. Drives top-of-funnel inbound on a surface no recruiting platform owns.",
  },
  {
    feature: "Two-way calendar sync (Google + Outlook) with interview slot generation",
    icon: CalendarCheck,
    values: { hired: "yes", loxo: "partial", linkedin: "no", greenhouse: "partial", bullhorn: "partial" },
    note: "Native OAuth on both providers with refresh-token rotation, interview-slot generator, book-interview flow, and reminder notifications — not a vendor integration.",
  },
  {
    feature: "Inbox sync (Gmail/Outlook unified inbox + reply tracking)",
    icon: Inbox,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "partial" },
    note: "3 mailboxes included on Pro; +$5/mo each additional. Threaded inbox with reply tracking, candidate-link enrichment, and email rules per user.",
  },
  {
    feature: "In-video lead-capture forms (Wistia Turnstile equivalent)",
    icon: PlaySquare,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Pin a form to any playback timestamp; submissions mirror into marketing_leads so the unified inbox surfaces them. Same primitive doubles as in-lesson knowledge checks on courses.",
  },
  {
    feature: "Frame.io-style time-coded review comments + tokenized share links",
    icon: MessageCircle,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Threaded comments pinned to any frame, anonymous-external-reviewer share tokens, no separate Frame.io / Vimeo Pro license required.",
  },
  {
    feature: "Token-metered AI (top-up packs $3.99–$199.99 in addition to monthly allowance)",
    icon: Coins,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "1M tokens/mo on Pro plus pay-as-you-go top-ups (Bite/Standard/Power/Mega). No competitor exposes token-level metering at consumer prices.",
  },
  {
    feature: "Public, programmable API + OpenAPI 3.1 spec",
    icon: KeyRound,
    values: { hired: "yes", loxo: "partial", linkedin: "yes", greenhouse: "yes", bullhorn: "yes" },
    note: "SHA-256-hashed API keys with per-call scoping (Pro tier). Spec at /api/openapi.json + Swagger UI at /docs.",
  },
  {
    feature: "Creator monetisation (95/5 split on voice clones + templates + future media)",
    icon: TrendingUp,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Creator-uploaded voice clones, templates, and future media sold to other users with a 95/5 split + CC processing on buyer. No recruiting platform pays the creator at all.",
  },
  {
    feature: "White-label tenants (subdomain + brand + dedicated portal)",
    icon: Layers,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "partial" },
    note: "University / bootcamp / staffing-firm tenant types with ROI calculator, custom branding, plan-tier control. Bullhorn enterprise contracts support white-label for staffing customers only.",
  },
  {
    feature: "Stock media library (Unsplash + Pexels + Pixabay) with content-addressed dedup",
    icon: ImageIcon,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Aggregated stock library inside the AI Studio. One R2 object per sha256(bytes) — same asset backs many users without duplication.",
  },
  {
    feature: "Multi-format AI Studio (video + podcast + voice + animation + comic + game + CAD)",
    icon: Headphones,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Studio splits on a `mediaKind` axis with kind-specific scene templates + render engines. Most competitors are video-only or audio-only.",
  },
  {
    feature: "AI presenter avatars (talking-head — WebGPU client-side, no per-render fee)",
    icon: UserCircle,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "AvatarWidget in canvas-v2: viseme-driven mouth shapes synced to TTS word boundaries via existing tts-engines `onBoundary` callback. 6 stock presenters bundled (gender / ethnicity variants); BYO portrait support via the same voice-clone-style upload flow. Synthesia charges $30–$96/seat/mo for the comparable surface; HeyGen $24–$69. We ship it client-side with no per-minute render cost.",
  },
  {
    feature: "AI multi-language video dubbing in your own cloned voice",
    icon: Languages,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no" },
    note: "Studio → Dub panel: Whisper transcribes source → OpenRouter LLM translates each caption cue → cloned-voice TTS (Kokoro / Piper / VibeVoice WebGPU stack) re-renders audio in the target language → muxed into a parallel audio track in the timeline. 20+ target languages. Synthesia bundles dubbing only on Creator / Enterprise; Rask AI charges $24–$89/mo standalone — we ship it inside Pro.",
  },
  {
    feature: "WCAG 2.2 accessibility audit on Studio output (alt-text, contrast, captions, reading order)",
    icon: Accessibility,
    values: { hired: "yes", loxo: "no", linkedin: "no", greenhouse: "no", bullhorn: "no", },
    note: "StudioAccessibilityPanel runs against the live CanvasState — flags missing alt text on image widgets, low-contrast text overlays (4.5:1 AA / 7:1 AAA), missing caption tracks on video clips, and non-sequential reading order. Closes the Articulate 360 accessibility-tooling gap without the $1,099/seat/yr ticket.",
  },
  {
    feature: "Installable mobile + offline experience (PWA — Add to Home Screen, offline shell)",
    icon: Smartphone,
    values: { hired: "yes", loxo: "no", linkedin: "partial", greenhouse: "no", bullhorn: "no" },
    note: "Installable PWA via web app manifest + service-worker offline shell — users add hired.video to their iOS/Android home screen and run the recruiter pipeline + candidate dashboard from a standalone window. Closes the CapCut / Canva mobile-parity gap without paying for a separate native build.",
  },
  {
    feature: "Multilingual UI (English, Español, Français — Canada)",
    icon: Globe,
    values: { hired: "yes", loxo: "no", linkedin: "yes", greenhouse: "partial", bullhorn: "partial" },
    note: "Hired.Video ships English + Spanish + Canadian French (Quebec Law 25 — fr-CA) so candidates in Mexico and Quebec enroll, build resumes, and apply in their native language. Locale switcher in the footer + header + signup honours visitor choice via a `?lang=` URL override and persists it onto `account_preferences.language` at signup. LinkedIn supports 24+ languages. Greenhouse and Bullhorn translate the candidate-facing careers site but keep the recruiter / admin tool mostly English.",
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
      "Massive sourcing database (1.2B profiles) with deep personal-contact enrichment",
      "Mature integrated ATS + CRM workflow at the high end",
      "Bundled VoIP layer for outbound calls directly from the CRM",
    ],
    whereHiredWins: [
      "$9.95/seat/mo Pro vs. $169/user/mo Basic — and AI is on the Free tier",
      "Recruiter Chrome extension matches Loxo Boost feature-for-feature — profile capture with personal email + phone + LinkedIn / GitHub / X / website auto-enrichment, bulk capture from search-result pages (up to 25 candidates per click), click-to-call (recorded VoIP via SignalWire) + click-to-SMS + click-to-email, one-click submit to a job / list / call queue / outreach sequence, inline tag editor, tracked-jobs tab, and an interactive 🪄 picker (job / profile / company modes) with learned-selector replay — all auto-logged to the activity timeline at 1/17th the per-seat price",
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
      "Unmatched 1B-profile professional graph — the only structural moat",
      "Sponsored InMail and brand-of-record sourcing at enterprise scale",
      "LinkedIn Learning content library (separately licensed)",
    ],
    whereHiredWins: [
      "About 1/100th the cost of Recruiter Corporate per seat",
      "Free, uncapped direct messaging — no InMail credit limit, no per-message paywall to reach non-connections",
      "\"Ask for an intro\" through a mutual is a built-in CTA on every profile (LinkedIn's same workflow is gated behind paid Recruiter)",
      "\"Grab a coffee\" meetup invites with calendar event + shared accountability task on accept — LinkedIn has no native equivalent",
      "Native ATS, CRM, and async video interviews — Recruiter requires an external ATS",
      "Candidates get first-class tools too: AI video resumes, interview practice, and resume tailoring",
      "Built-in learning content library (AI, RAG, must-have skills) bundled with every plan — LinkedIn Learning is a separately-licensed ~$379/seat/yr SKU on top of Recruiter",
      "SCORM 1.2 + xAPI + employer-authored learning paths (LinkedIn Learning is content-only — no SCORM ingestion, no DAG paths, no employer-author surface)",
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
      "**Back-office at parity, not a $20K+/yr upcharge** — punch-in/out → weekly timesheets → approval-derived invoicing → contractor payout ledger → compliance doc vault (I-9 / W-9 / W-8BEN / COI / MSA) with native + DocuSign e-sign → QuickBooks Online / Xero / Gusto / Helcim push, all inside the $9.95/seat plan",
      "Per-placement P&L (revenue · contractor pay · gross margin · approved-timesheet count) with drill-through to placement detail — Bullhorn's same surface lives behind enterprise reporting add-ons",
      "Multi-recruiter commission splits (sourcer / manager fanout) + payout ledger that accrues on every approved timesheet, with a Recruiter Commissions dashboard included",
      "Native video resume, interview, AI Studio, and outreach tooling — no per-module upcharge",
      "Full agency-recruiter mode in My Services, including pitch decks and shareable candidate links",
      "Candidate-facing surface — gamification, learning paths, public profile, map discovery — that Bullhorn doesn't ship at all",
      "Remaining honest gap: Bullhorn's deeper VMS / MSP connector marketplace (logged as roadmap)",
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
  {
    name: "Synthesia",
    positioning:
      "AI avatar training and explainer video platform. Best-known for high-quality presenter avatars and 140+ languages, marketed primarily to L&D teams and internal comms.",
    pricing:
      "Starter $30/mo · Creator $96/mo per seat · Enterprise custom. No creator rev-share — buyers pay seat licenses; instructional designers don't get a cut when a course is sold.",
    whereTheyShine: [
      "Best-in-class AI presenter avatars",
      "140+ language dubbing with consistent voice",
      "Mature L&D + internal-comms positioning",
    ],
    whereHiredWins: [
      "**AI presenter avatars shipped client-side** — viseme-driven mouth shapes synced to TTS word boundaries via WebGPU. No per-render fee, no $30–$96/seat ticket.",
      "**Multi-language dubbing in your own cloned voice** — Whisper transcript → LLM-translated cues → cloned-voice TTS re-renders → mux into a parallel audio track. 20+ target languages, inside Pro at $9.95/mo.",
      "Real voice cloning + voice marketplace (95/5 split to the creator) — Synthesia doesn't pay creators",
      "Multi-format Studio: comics, games, podcasts, animation, CAD — not just talking-head videos",
      "Native SCORM 1.2 + xAPI export + verifiable certificates — Synthesia exports MP4 only",
      "Full hiring stack underneath the studio (ATS, CRM, job board, interview practice) at consumer prices",
      "Honest residual gap: Synthesia's photo-realistic avatar fidelity (140+ language brand-voice library, studio-grade lip-sync) is still ahead — our avatars are stylized 2D presenters today; photorealistic ML-rig avatars are on roadmap.",
    ],
  },
  {
    name: "HeyGen",
    positioning:
      "Consumer-friendly AI avatar studio competing with Synthesia. Strong on UI ergonomics + faster avatar iteration.",
    pricing:
      "Free (limited) · Creator $24/mo · Team $69/mo per seat. No creator rev-share.",
    whereTheyShine: [
      "Approachable consumer UI for AI avatar creation",
      "Fast avatar style iteration + voice library",
    ],
    whereHiredWins: [
      "**Client-side AI avatar + dubbing** — runs in the browser on WebGPU, no per-minute render bill and no model-cost exposure as your usage scales",
      "Multi-format authoring (comics + games + podcasts + CAD) — not just AI avatars",
      "Native ATS + CRM + interview tools + job board — full talent vertical",
      "Creator marketplace with 95/5 split, gamification cashout, SCORM export — none of which HeyGen ships",
    ],
  },
  {
    name: "Articulate 360 (Storyline + Rise)",
    positioning:
      "Gold-standard L&D authoring tool — 20+ years of maturity, gigantic asset library, every L&D buyer knows it. Storyline is desktop-first; Rise is web.",
    pricing:
      "$1,099/seat/yr (Personal) · $1,749/seat/yr (Teams). No creator rev-share — buyers pay annual seat fees, course creators don't see any of the downstream course-sale revenue.",
    whereTheyShine: [
      "20+ year ecosystem with deep template + asset libraries",
      "Familiar UX for the entire L&D persona",
      "Strong screen-reader / accessibility tooling",
    ],
    whereHiredWins: [
      "$9.95/mo Pro vs. $1,099/yr seat — 92% lower for individual authors",
      "AI scripting + **AI presenter avatars (WebGPU client-side)** + voice cloning + **20+ language dubbing** + auto captions baked in (Articulate is mostly manual)",
      "**WCAG 2.2 audit panel** on Studio output — flags missing alt text, low-contrast overlays, missing caption tracks, non-sequential reading order in-editor before publish. Closes the Articulate accessibility-tooling gap inline.",
      "Web-native authoring (Articulate Storyline is still partly desktop)",
      "95/5 creator rev-share when courses sell — Articulate keeps 100% of the seat fee",
      "Same studio also produces AI video resumes, podcasts, comics, games — not just elearning",
      "Honest residual gap: Articulate's 20+ years of asset / template library breadth is still wider — our Studio template library is ~20 templates today, growing per gap #1167 (mass template seeding).",
    ],
  },
  {
    name: "Canva / CapCut",
    positioning:
      "Consumer-grade video + design editors. Canva covers static + light video; CapCut is a TikTok-style mobile-first video editor.",
    pricing:
      "Canva Free / Pro $14.99/mo · CapCut Free / Pro $9.99/mo. No creator rev-share.",
    whereTheyShine: [
      "Huge template libraries + mass consumer brand recognition",
      "Mobile + web parity (especially CapCut)",
      "Massive social-media template fit",
    ],
    whereHiredWins: [
      "Studio outputs are linked into a hiring + career platform — videos become resumes / interview submissions / course lessons",
      "AI generation from a single prompt (storyboard → scene graph → render) — Canva/CapCut are manual",
      "**Installable PWA** — Add to Home Screen on iOS / Android, offline shell, standalone-window run mode. Closes the CapCut mobile-parity gap without paying for a separate native build.",
      "Creator marketplace with 95/5 split + SCORM/xAPI export + ATS package generator — not present on Canva or CapCut",
      "Voice cloning + voice marketplace + per-second engagement heatmap on every published video",
      "Honest residual gap: Canva's social-template library breadth + CapCut's native-mobile editing fidelity are still ahead — our Studio is web-PWA, not Capacitor/native, and our template count is order-of-magnitude smaller.",
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
    name: "Hired.Video vs. competitor recruiting + studio + L&D platforms",
    description:
      "Side-by-side comparison of Hired.Video against LOXO, LinkedIn Recruiter, Greenhouse, Bullhorn, HireVue, VidCruiter, Synthesia, HeyGen, Articulate 360, Canva, and CapCut — covering AI video resumes, ATS, recruiting CRM, AI studio (video / comic / podcast / animation), voice cloning marketplace, SCORM 1.2 + xAPI learning paths, gamification, in-video lead capture, two-way calendar sync, and pricing.",
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
      {/* Pricing-at-a-glance — the optional section header shares this same
          max-w-6xl centered container so its heading centers and its sub-copy
          spans the full table width (no separate narrower block that drifts
          left of the table). */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {showSectionHeader && (
            <div className="text-center mb-12">
              {eyebrow && (
                <Badge className="mb-3" variant="outline">
                  <Trophy className="h-4 w-4 mr-1" /> {eyebrow}
                </Badge>
              )}
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                How Hired.Video compares
              </h2>
              <p className="text-muted-foreground">
                Side-by-side against LOXO, LinkedIn Recruiter, Greenhouse,
                Bullhorn, HireVue, and VidCruiter — pricing, ATS/CRM, AI video
                resumes, voice cloning, async interviews, gamification, and
                learning pathways.
              </p>
            </div>
          )}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">Pricing at a glance</h2>
            <p className="text-muted-foreground">
              Starting prices for the lowest-tier paid plan most teams actually
              buy. Free tiers and per-seat costs noted where published;
              enterprise plans are typically custom-quoted.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-background">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
