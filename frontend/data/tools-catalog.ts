// Single source of truth for every tool card shown on the Tools page and
// the Home page highlights. Each entry is a plain data value — no JSX —
// consumed by the <ToolCard> presentation component. Adding a new tool
// here automatically surfaces it on both pages (and anywhere else that
// renders from the catalog).

import {
  BarChart3,
  Brain,
  Calculator,
  Chrome,
  ClipboardCheck,
  Compass,
  FileText,
  GitMerge,
  Heart,
  Mail,
  MessageSquare,
  PenTool,
  Sparkles,
  Target,
  Flame,
  ClipboardPaste,
  UserCheck,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { USER_ROLES, type UserRole } from "@shared/user-roles";
import { aiCoachHref } from "@/lib/ai-context";

/** Priming message sent the moment the AI side panel opens for the
 *  Interview Coach tile. Phrased to make the CHRO immediately switch
 *  into interview-coach mode and ask the role/level it should target. */
const INTERVIEW_COACH_PRIMING =
  "Let's start an interview practice session. Ask me 1 question at a time " +
  "(behavioral first, then role-specific), wait for my answer, then give me " +
  "real-time STAR-method feedback + a 0–10 score per answer. " +
  "First, ask what role and seniority I'm preparing for.";

export type ToolTier = "free" | "pro";

/** Entity contexts a tool can run against. Used by the entity action
 *  menus to know whether to deep-link the tool with an entity id, and to
 *  flag tools that don't make sense from a given entity (so we don't
 *  blindly attach a `?resumeId` to a Salary Calculator link). */
export type ToolEntityContext = "resume" | "job" | "company";

/** Top-level grouping surfaced as a chip on the ToolCard and the
 *  ToolPageHeader. Drives no behavior — purely for at-a-glance scanning
 *  on /tools and on each tool's full-page header. Keep the list short
 *  so the chip reads as a label, not a free-text tag. */
export type ToolCategory =
  | "Resume"
  | "Job"
  | "Profile"
  | "Career"
  | "Interview"
  | "Salary"
  | "Application"
  | "Extension";

/** Optional status pill shown in the top-right corner of the full card. */
export interface ToolStatusBadge {
  label: string;
  /** Full Tailwind class string for bg + text color. */
  className: string;
}

/** Stats highlighted above the feature bullets (two per card). */
export interface ToolCardStat {
  value: string;
  label: string;
  /** Tailwind text color class for the value — e.g. "text-green-600". */
  valueClassName?: string;
}

export interface ToolCatalogEntry {
  /** Stable id — mirrors the backend tool id where one exists. */
  id: string;
  /** Target href. Always kebab-case canonical (`/tools/<slug>`); legacy
   *  PascalCase paths are 308-redirected in App.tsx. */
  href: string;
  title: string;
  description: string;
  tier: ToolTier;
  icon: LucideIcon;
  /** Tailwind bg class for the icon tile (e.g. "bg-purple-100"). */
  iconBgClassName: string;
  /** Tailwind text color class for the icon itself (e.g. "text-brand-purple"). */
  iconColorClassName: string;
  statusBadge?: ToolStatusBadge;
  stats?: [ToolCardStat, ToolCardStat];
  features?: string[];
  /** Button label shown at the bottom of the full card. */
  ctaLabel?: string;
  /** If set, surface this tool on the Home page highlight grid. */
  showOnHome?: boolean;
  /** Entity contexts this tool accepts as a starting point. Drives the
   *  Run-Tool submenu on a resume/job/company action menu — links are
   *  deep-linked with the entity id when this list includes the entity
   *  type. Tools with no `appliesTo` (Salary Calculator, Interview
   *  Coach, …) still appear in the menu but the link is plain. */
  appliesTo?: ToolEntityContext[];
  /** Audience this tool is built for. Drives both:
   *   • the audience chip on <ToolCard> ("Job Seekers" /
   *     "Recruiters & Employers" / "Everyone"), and
   *   • the audience filter on /tools (and the per-entity action menu
   *     filter in `getCatalogToolsForEntity`).
   *  Omit when the tool is genuinely useful to every role (Salary
   *  Calculator, Skill Extractor, …). SuperAdmins fall back to the
   *  role they're previewing via the Preview-role pill. Values come
   *  from the shared USER_ROLES enum so client and server stay aligned. */
  audienceRoles?: UserRole[];
  /** Entity contexts on which a recruiter / employer should ALSO see
   *  this tool, even when `audienceRoles` is job-seeker-only. Drives
   *  #432: a recruiter looking at an imported candidate resume should
   *  still see "Run AI Resume Scorer" / "Tailor Resume" on that row —
   *  the tool itself is seeker-audience on /tools, but acting on a
   *  candidate's resume is a recruiter-evaluation workflow. Omit when
   *  the tool is only useful when run on your own entity. */
  recruiterUseOnEntity?: ToolEntityContext[];
  /** URL of a 1-scene promo video that demos the tool in use. When set,
   *  <ToolPromoVideo> renders a "Watch demo" affordance on the card and
   *  any tool detail surface. Produced by the "Tool Promo" Studio
   *  template (one scene, screen+webcam capture, voiceover lane). */
  promoVideoUrl?: string;
  /** Top-level category surfaced as a chip on the ToolCard + every
   *  tool's full-page header. Required so the chip never goes missing
   *  on a new tool — adding a tool forces a category decision, which
   *  keeps /tools scannable as the catalog grows. */
  category: ToolCategory;
}

/** Three audience buckets we surface in the UI: candidate-side tools,
 *  hire-side tools, or universal. Keep narrow — admins / super-admins
 *  see whichever bucket they're previewing as. */
export type ToolAudience = "job_seeker" | "recruiter_employer" | "universal";

const RECRUITER_OR_EMPLOYER: ReadonlySet<UserRole> = new Set([
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
]);

/** Bucket a catalog entry's audienceRoles into one of three buckets. */
export function getToolAudience(entry: ToolCatalogEntry): ToolAudience {
  if (!entry.audienceRoles || entry.audienceRoles.length === 0) {
    return "universal";
  }
  const isSeeker = entry.audienceRoles.includes(USER_ROLES.JOB_SEEKER);
  const isHire = entry.audienceRoles.some((r) => RECRUITER_OR_EMPLOYER.has(r));
  if (isSeeker && !isHire) return "job_seeker";
  if (isHire && !isSeeker) return "recruiter_employer";
  return "universal";
}

/** Map an effective viewer role to the audience bucket whose tools they
 *  should see when filtering "For me". Returns null for admin / unknown
 *  / unauthenticated viewers — caller should treat null as "show all". */
export function audienceForRole(
  role: UserRole | string | null | undefined,
): ToolAudience | null {
  if (role === USER_ROLES.JOB_SEEKER) return "job_seeker";
  if (role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER) {
    return "recruiter_employer";
  }
  return null;
}

/** Decide whether a tool should be visible to a viewer in the given
 *  audience bucket. Universal tools always pass. The bucket-match
 *  check lives here so /tools, the entity action menus, and any
 *  future surface stay consistent. */
export function isToolInAudience(
  entry: ToolCatalogEntry,
  audience: ToolAudience | "all" | null,
): boolean {
  if (audience == null || audience === "all") return true;
  const bucket = getToolAudience(entry);
  if (bucket === "universal") return true;
  return bucket === audience;
}

// Status-badge presets so the catalog stays declarative.
const BADGE_AVAILABLE: ToolStatusBadge = { label: "Available", className: "bg-green-100 text-green-800" };
const BADGE_NEW: ToolStatusBadge = { label: "New", className: "bg-green-100 text-green-800" };
const BADGE_HOT: ToolStatusBadge = { label: "Hot", className: "bg-yellow-100 text-yellow-800" };
const BADGE_BETA: ToolStatusBadge = { label: "Beta", className: "bg-orange-100 text-orange-800" };
const BADGE_CHROME: ToolStatusBadge = { label: "Chrome Extension", className: "bg-blue-100 text-blue-800" };
const BADGE_AI_CHAT: ToolStatusBadge = { label: "Available in AI Chat", className: "bg-blue-100 text-blue-800" };

export const TOOLS_CATALOG: ToolCatalogEntry[] = [
  {
    id: "resume-optimizer",
    href: "/tools/resume-optimizer",
    title: "Resume Optimizer",
    description: "AI analyzes and improves your resume for maximum impact",
    tier: "pro",
    category: "Resume",
    icon: Zap,
    iconBgClassName: "bg-blue-100",
    iconColorClassName: "text-brand-blue",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "85%", label: "ATS Pass Rate", valueClassName: "text-green-600" },
      { value: "50+", label: "Improvements", valueClassName: "text-blue-600" },
    ],
    features: ["ATS optimization", "Keyword suggestions", "Industry benchmarking"],
    ctaLabel: "Optimize Resume",
    showOnHome: true,
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "skill-extractor",
    href: "/tools/skill-extractor",
    title: "Skill Extractor",
    description: "Pull every skill from a job description or resume",
    tier: "free",
    category: "Job",
    icon: Sparkles,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "Job", label: "or Resume", valueClassName: "text-purple-600" },
      { value: "AI", label: "Categorized", valueClassName: "text-purple-600" },
    ],
    features: [
      "Upload PDF or paste text",
      "Deduplicated skill list",
      "Required vs. preferred tags",
    ],
    ctaLabel: "Extract Skills",
    showOnHome: true,
    appliesTo: ["resume", "job"],
    // Universal: seekers parse a JD, recruiters parse a candidate's resume.
  },
  {
    id: "career-360",
    href: "/tools/career-360",
    title: "Career 360",
    description: "Pick where you want to go — see the gaps and the plan to get there",
    tier: "free",
    category: "Career",
    icon: Compass,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: { label: "New", className: "bg-green-100 text-green-800" },
    stats: [
      { value: "AI", label: "Targets", valueClassName: "text-purple-600" },
      { value: "Plan", label: "+ Roadmap", valueClassName: "text-purple-600" },
    ],
    features: [
      "AI-suggested target roles",
      "Gap analysis tied to your profile",
      "30/60/90/180-day roadmap",
      "Stamps of improvement per tool run",
    ],
    ctaLabel: "Open Career 360",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "interview-questions",
    href: "/tools/interview-questions",
    title: "Interview Questions",
    description:
      "Generate skill-tailored interview questions from a resume, a job, or just a target role — copy, practise with the AI Coach, or assign to a candidate.",
    tier: "free",
    category: "Interview",
    icon: ClipboardCheck,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "Skills", label: "Targeted", valueClassName: "text-purple-600" },
      { value: "Assign", label: "or Copy", valueClassName: "text-purple-600" },
    ],
    features: [
      "Pulls skills from your resume or a job",
      "Copy questions, hand off to AI Coach, or assign",
      "Magic-link invite for the candidate (text or video answers)",
    ],
    ctaLabel: "Generate Questions",
    showOnHome: true,
    appliesTo: ["resume", "job"],
    // Universal: job seekers practise; recruiters/employers assign.
  },
  {
    id: "interview-coach",
    href: aiCoachHref(INTERVIEW_COACH_PRIMING),
    title: "Interview Coach",
    description: "Practice interviews with AI Chat",
    tier: "free",
    category: "Interview",
    icon: MessageSquare,
    iconBgClassName: "bg-blue-100",
    iconColorClassName: "text-brand-blue",
    statusBadge: BADGE_AI_CHAT,
    stats: [
      { value: "100+", label: "Questions", valueClassName: "text-green-600" },
      { value: "Real-time", label: "Feedback", valueClassName: "text-blue-600" },
    ],
    features: ["Role-specific questions", "Real-time feedback", "Confidence scoring"],
    ctaLabel: "Start AI Chat",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "interview-templates",
    href: "/tools/interview-templates",
    title: "Interview Templates",
    description:
      "Save reusable interview question sets. Attach to a job posting once — every applicant gets the same screening interview automatically.",
    tier: "free",
    category: "Interview",
    icon: ClipboardCheck,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "Reusable", label: "Library", valueClassName: "text-purple-600" },
      { value: "1-click", label: "Attach", valueClassName: "text-purple-600" },
    ],
    features: [
      "Personal + company-shared libraries",
      "AI scoring + recruiter shortlist built in",
      "Auto-attached on /apply when a job has one",
    ],
    ctaLabel: "Manage Templates",
    showOnHome: true,
    audienceRoles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER],
  },
  {
    id: "video-pitch-lab",
    href: "/tools/video-pitch-lab",
    title: "Video Pitch Lab",
    description:
      "Workshop the 60-second 'tell me about yourself' video pitch every recruiter asks for. AI script, prep timer, retake, portable URL.",
    tier: "free",
    category: "Interview",
    icon: Video,
    iconBgClassName: "bg-pink-100",
    iconColorClassName: "text-pink-600",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "60s", label: "Practice Pitch", valueClassName: "text-pink-600" },
      { value: "AI", label: "Script + Review", valueClassName: "text-pink-600" },
    ],
    features: [
      "AI script tailored to your resume",
      "Teleprompter + prep timer + retake",
      "One portable URL for every application",
    ],
    ctaLabel: "Open Video Pitch Lab",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "salary-calculator",
    href: "/tools/salary-calculator",
    title: "Salary Calculator",
    description: "Know your worth with market data insights",
    tier: "free",
    category: "Salary",
    icon: Calculator,
    iconBgClassName: "bg-green-100",
    iconColorClassName: "text-brand-green",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "$120K", label: "Avg. Salary", valueClassName: "text-green-600" },
      { value: "25%", label: "Negotiation Boost", valueClassName: "text-green-600" },
    ],
    features: ["Market rate analysis", "Location adjustments", "Negotiation tips"],
    ctaLabel: "Calculate Salary",
  },
  {
    id: "job-resume-match",
    href: "/tools/job-resume-match",
    title: "Job-Resume Match",
    description: "Find perfect job matches based on your profile",
    tier: "pro",
    category: "Job",
    icon: Target,
    iconBgClassName: "bg-green-100",
    iconColorClassName: "text-green-600",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "95%", label: "Match Score", valueClassName: "text-green-600" },
      { value: "AI", label: "Powered", valueClassName: "text-green-600" },
    ],
    features: ["Skills alignment", "Culture fit scoring", "Growth potential"],
    ctaLabel: "Match Jobs",
    showOnHome: true,
    appliesTo: ["resume", "job"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "ai-resume-scorer",
    href: "/tools/ai-resume-scorer",
    title: "AI Resume Scorer",
    description: "Get instant feedback on your resume's effectiveness",
    tier: "free",
    category: "Resume",
    icon: Brain,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_HOT,
    stats: [
      { value: "A+", label: "Grade Score", valueClassName: "text-purple-600" },
      { value: "6", label: "Categories", valueClassName: "text-purple-600" },
    ],
    features: ["Overall scoring", "Category breakdown", "Improvement tips"],
    ctaLabel: "Score Resume",
    showOnHome: true,
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
    // #432 — recruiters also score candidate resumes for fit; surface
    // this on their pool / pipeline row menus.
    recruiterUseOnEntity: ["resume"],
  },
  {
    id: "summarize-resume",
    href: "/tools/summarize-resume",
    title: "Resume Summarization",
    description: "Generate compelling summaries instantly",
    tier: "free",
    category: "Resume",
    icon: FileText,
    iconBgClassName: "bg-orange-100",
    iconColorClassName: "text-brand-orange",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "3s", label: "Generation", valueClassName: "text-orange-600" },
      { value: "AI", label: "Powered", valueClassName: "text-orange-600" },
    ],
    features: ["Professional summaries", "Key highlights", "Multiple formats"],
    ctaLabel: "Summarize Resume",
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "sentiment-analysis",
    href: "/tools/sentiment-analysis",
    title: "Sentiment Analysis",
    description: "Check the tone and language of your resume",
    tier: "free",
    category: "Resume",
    icon: Heart,
    iconBgClassName: "bg-pink-100",
    iconColorClassName: "text-pink-600",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "Tone", label: "Analysis", valueClassName: "text-pink-600" },
      { value: "AI", label: "Powered", valueClassName: "text-pink-600" },
    ],
    features: ["Positive tone detection", "Language improvements", "Impact scoring"],
    ctaLabel: "Analyze Sentiment",
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
    // #432 — sentiment chip on the candidate card uses this tool; if
    // it's stripped from the recruiter menu the chip click breaks.
    recruiterUseOnEntity: ["resume"],
  },
  {
    id: "pdf-to-json",
    href: "/tools/pdf-to-json",
    title: "Document Converter",
    description: "Convert PDF/Word resumes to JSON",
    tier: "free",
    category: "Resume",
    icon: FileText,
    iconBgClassName: "bg-orange-100",
    iconColorClassName: "text-brand-orange",
    statusBadge: BADGE_BETA,
    stats: [
      { value: "PDF", label: "Support", valueClassName: "text-orange-600" },
      { value: "JSON", label: "Output", valueClassName: "text-orange-600" },
    ],
    features: ["PDF/Word parsing", "Structured JSON output", "Data extraction"],
    ctaLabel: "Convert Document",
    // Universal: recruiters use it on candidate PDFs, seekers on their own.
  },
  {
    id: "value-proposition",
    href: "/tools/value-proposition",
    title: "Value Proposition",
    description: "Craft compelling career value statements",
    tier: "pro",
    category: "Career",
    icon: PenTool,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-purple-600",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "AI", label: "Generated", valueClassName: "text-purple-600" },
      { value: "Custom", label: "Tailored", valueClassName: "text-purple-600" },
    ],
    features: ["Personal branding", "Career positioning", "Unique messaging"],
    ctaLabel: "Craft Value",
    appliesTo: ["resume", "job", "company"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "vendor-sync",
    href: "/tools/vendor-sync",
    title: "LinkedIn & Profile Sync",
    description: "Sync your master resume to LinkedIn, Indeed, Glassdoor, GitHub, Wellfound, and more — paste-ready blocks plus Chrome-extension import",
    tier: "free",
    category: "Profile",
    icon: Chrome,
    iconBgClassName: "bg-blue-100",
    iconColorClassName: "text-blue-600",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "9", label: "Vendors", valueClassName: "text-blue-600" },
      { value: "Ext.", label: "Optional", valueClassName: "text-blue-600" },
    ],
    features: [
      "LinkedIn, Indeed, Glassdoor, GitHub, Wellfound + 4 more",
      "Pull updates back via Chrome extension",
      "Track which variant you posted where",
    ],
    ctaLabel: "Open LinkedIn & Profile Sync",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "profile-audit",
    href: "/tools/profile-audit",
    title: "Profile Audit",
    description: "Grade your candidate profile and accept an AI-rewritten headline + summary",
    tier: "pro",
    category: "Profile",
    icon: UserCheck,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "5", label: "Recruiter Checks", valueClassName: "text-purple-600" },
      { value: "AI", label: "Rewrite", valueClassName: "text-purple-600" },
    ],
    features: [
      "Headline + summary rewrite",
      "Side-by-side card & page preview",
      "Accept changes one click",
    ],
    ctaLabel: "Audit My Profile",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "resume-tailor",
    href: "/tools/resume-tailor",
    title: "Resume Tailor",
    description: "Tailor your resume to a specific job description",
    tier: "pro",
    category: "Resume",
    icon: BarChart3,
    iconBgClassName: "bg-amber-100",
    iconColorClassName: "text-amber-600",
    statusBadge: BADGE_AVAILABLE,
    stats: [
      { value: "ATS", label: "Optimized", valueClassName: "text-amber-600" },
      { value: "Job", label: "Specific", valueClassName: "text-amber-600" },
    ],
    features: ["Job description parsing", "Keyword alignment", "Score delta"],
    ctaLabel: "Tailor Resume",
    appliesTo: ["resume", "job"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
    // #432 — recruiters tailor a candidate's resume to a job they're
    // sourcing for. Surface on both resume and job rows.
    recruiterUseOnEntity: ["resume", "job"],
  },
  {
    id: "form-autofill",
    href: "/tools/auto-fill",
    title: "Form Autofill",
    description: "Fill job applications with saved profile data",
    tier: "free",
    category: "Application",
    icon: ClipboardPaste,
    iconBgClassName: "bg-indigo-100",
    iconColorClassName: "text-indigo-600",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "1-Click", label: "Fill", valueClassName: "text-indigo-600" },
      { value: "Saved", label: "Profiles", valueClassName: "text-indigo-600" },
    ],
    features: ["Profile detection", "Multiple applications", "Field mapping"],
    ctaLabel: "Auto-Fill Forms",
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    // Inbox Sync — connect Gmail/Outlook so ATS replies, recruiter pitches,
    // interviews, and offers flow into the unified inbox AND auto-create
    // job_items for high-confidence inbound opportunities. Settings owns
    // the OAuth flow + rule editor so the tool href deep-links into the
    // Integrations tab; the tool card on /tools is the discovery surface.
    id: "inbox-sync",
    href: "/settings?tab=email",
    title: "Inbox Sync",
    description:
      "Connect Gmail or Outlook — auto-classify ATS updates, recruiter outreach, interviews, and offers, and extract jobs into your tracker.",
    tier: "free",
    category: "Application",
    icon: Mail,
    iconBgClassName: "bg-emerald-100",
    iconColorClassName: "text-emerald-600",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "Gmail", label: "+ Outlook", valueClassName: "text-emerald-600" },
      { value: "AI", label: "Classified", valueClassName: "text-emerald-600" },
    ],
    features: [
      "Auto-link replies to jobs you applied to",
      "AI-classify recruiter outreach vs. ATS updates",
      "Auto-create job items from inbound opportunities",
    ],
    ctaLabel: "Connect Inbox",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "resume-roast",
    href: "/tools/resume-roast",
    title: "Resume Roast",
    description: "Get a brutally honest take on your resume",
    tier: "free",
    category: "Resume",
    icon: Flame,
    iconBgClassName: "bg-red-100",
    iconColorClassName: "text-red-600",
    statusBadge: BADGE_HOT,
    stats: [
      { value: "Fun", label: "Format", valueClassName: "text-red-600" },
      { value: "Real", label: "Feedback", valueClassName: "text-red-600" },
    ],
    features: ["Witty takedowns", "Actionable fixes", "Improved rewrites"],
    ctaLabel: "Get Roasted",
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "resume-consolidator",
    href: "/tools/resume-consolidator",
    title: "Resume Consolidator",
    description: "Merge multiple resumes into one master",
    tier: "free",
    category: "Resume",
    icon: GitMerge,
    iconBgClassName: "bg-teal-100",
    iconColorClassName: "text-teal-600",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "AI", label: "Matching", valueClassName: "text-teal-600" },
      { value: "Dedup", label: "Highlights", valueClassName: "text-teal-600" },
    ],
    features: [
      "Merge variants into master",
      "Import & merge from PDF/Word",
      "Smart section matching",
    ],
    ctaLabel: "Consolidate Resumes",
    appliesTo: ["resume"],
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "chrome-extension-jobseeker",
    href: "/chrome-extension#job-seeker",
    title: "Job Seeker Extension",
    description: "Tailor a job-specific resume on any job board with one click",
    tier: "free",
    category: "Extension",
    icon: Chrome,
    iconBgClassName: "bg-blue-100",
    iconColorClassName: "text-blue-600",
    statusBadge: BADGE_CHROME,
    stats: [
      { value: "1-Click", label: "Tailoring", valueClassName: "text-blue-600" },
      { value: "13+", label: "Job Boards", valueClassName: "text-blue-600" },
    ],
    features: [
      "Job-specific resume tailoring",
      "Works on LinkedIn, Indeed, Workday & more",
      "Instant generation",
    ],
    ctaLabel: "Learn More",
    showOnHome: true,
    audienceRoles: [USER_ROLES.JOB_SEEKER],
  },
  {
    id: "chrome-extension-recruiter",
    href: "/chrome-extension#recruiter",
    title: "Recruiter Extension",
    description: "Source and import candidates straight from LinkedIn into your pipeline",
    tier: "free",
    category: "Extension",
    icon: Chrome,
    iconBgClassName: "bg-purple-100",
    iconColorClassName: "text-brand-purple",
    statusBadge: BADGE_CHROME,
    stats: [
      { value: "LinkedIn", label: "Sourcing", valueClassName: "text-purple-600" },
      { value: "1-Click", label: "Import", valueClassName: "text-purple-600" },
    ],
    features: [
      "Candidate sourcing from LinkedIn",
      "Import profiles to your CRM",
      "Company & job capture",
    ],
    ctaLabel: "Learn More",
    showOnHome: true,
    audienceRoles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER],
  },
  {
    // HireVue/PI parity — validated-inspired psychometric battery. Free
    // tier ships Big Five + cognitive sample; Pro unlocks SJT, EQ, DISC,
    // and the resume → predictive-index match. History captured per run.
    id: "predictive-assessments",
    href: "/tools/predictive-assessments",
    title: "Predictive Assessments",
    description:
      "Big Five, cognitive ability, situational judgment, EQ, DISC — and a resume → predictive-index match.",
    tier: "free",
    category: "Career",
    icon: ClipboardCheck,
    iconBgClassName: "bg-emerald-100",
    iconColorClassName: "text-emerald-700",
    statusBadge: BADGE_NEW,
    stats: [
      { value: "5", label: "Instruments", valueClassName: "text-emerald-600" },
      { value: "Free", label: "Big Five + Cognitive", valueClassName: "text-emerald-600" },
    ],
    features: [
      "Big Five personality (IPIP short form)",
      "Cognitive ability sample (Wonderlic-style)",
      "Situational judgment + EQ + DISC (Pro)",
      "Resume → predictive-index match (Pro)",
      "Every start + complete saved to your history",
    ],
    ctaLabel: "Take Assessment",
    showOnHome: false,
  },
];

export function getToolsForHome(): ToolCatalogEntry[] {
  return TOOLS_CATALOG.filter((t) => t.showOnHome);
}

/** Look up a single catalog entry by stable id. Returned by tool history
 *  components to render labels and "Run again" links from a persisted
 *  toolId — falls back to undefined for legacy or removed tools. */
export function getCatalogTool(toolId: string): ToolCatalogEntry | undefined {
  return TOOLS_CATALOG.find((t) => t.id === toolId);
}

/**
 * Filter the full catalog for an action menu opened on a specific entity.
 *
 * Returns the catalog in declared order with two filters applied:
 *   • audience gate — driven by the same `isToolInAudience` rule used
 *     by the /tools page, so the entity menu and the catalog page can't
 *     drift. Universal tools always pass; bucketed tools are dropped
 *     when the viewer's role doesn't match the bucket. Anonymous and
 *     admin viewers see everything.
 *   • shape — every visible entry gets a stable `href` ready for use as
 *     a `<Link to={...}>` target. When the entry's `appliesTo` includes
 *     the current entityType, the entity id is appended as a query
 *     param so the destination tool page can preselect it.
 */
export function getCatalogToolsForEntity(
  entityType: ToolEntityContext,
  entityId: string,
  role: UserRole | string | null | undefined,
): Array<ToolCatalogEntry & { href: string }> {
  const audience = audienceForRole(role);
  return TOOLS_CATALOG.flatMap((entry) => {
    // #432 — a recruiter / employer surfacing this menu on an entity
    // they're EVALUATING (candidate resume in their pool, candidate
    // company profile, etc.) gets to run seeker-audience tools too,
    // when the tool opts in via `recruiterUseOnEntity`. Without this,
    // the audience tagging silently strips "Run AI Resume Scorer" from
    // the recruiter's row menu and breaks the score-this-candidate
    // workflow.
    const recruiterEvalOverride =
      audience === "recruiter_employer" &&
      entry.recruiterUseOnEntity?.includes(entityType) === true;
    if (!recruiterEvalOverride && !isToolInAudience(entry, audience)) return [];

    let href = entry.href;
    if (entry.appliesTo?.includes(entityType) && entityId) {
      const sep = href.includes("?") ? "&" : "?";
      const param = `${entityType}Id=${encodeURIComponent(entityId)}`;
      href = `${href}${sep}${param}`;
    }

    return [{ ...entry, href }];
  });
}
