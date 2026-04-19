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
  FileText,
  GitMerge,
  Heart,
  MessageSquare,
  PenTool,
  Sparkles,
  Target,
  Flame,
  ClipboardPaste,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type ToolTier = "free" | "pro";

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
  /** Target href. Keep PascalCase routes for existing public URLs. */
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
    href: "/Tools/ResumeOptimizer",
    title: "Resume Optimizer",
    description: "AI analyzes and improves your resume for maximum impact",
    tier: "pro",
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
  },
  {
    id: "skill-extractor",
    href: "/Tools/SkillExtractor",
    title: "Skill Extractor",
    description: "Pull every skill from a job description or resume",
    tier: "free",
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
  },
  {
    id: "interview-coach",
    href: "/chat",
    title: "Interview Coach",
    description: "Practice interviews with AI Chat",
    tier: "free",
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
  },
  {
    id: "salary-calculator",
    href: "/Tools/SalaryCalculator",
    title: "Salary Calculator",
    description: "Know your worth with market data insights",
    tier: "free",
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
    href: "/Tools/JobResumeMatch",
    title: "Job-Resume Match",
    description: "Find perfect job matches based on your profile",
    tier: "pro",
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
  },
  {
    id: "ai-resume-scorer",
    href: "/Tools/AIResumeScorer",
    title: "AI Resume Scorer",
    description: "Get instant feedback on your resume's effectiveness",
    tier: "free",
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
  },
  {
    id: "summarize-resume",
    href: "/Tools/SummarizeResume",
    title: "Resume Summarization",
    description: "Generate compelling summaries instantly",
    tier: "free",
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
  },
  {
    id: "sentiment-analysis",
    href: "/Tools/SentimentAnalysis",
    title: "Sentiment Analysis",
    description: "Check the tone and language of your resume",
    tier: "free",
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
  },
  {
    id: "pdf-to-json",
    href: "/Tools/pdftojson",
    title: "Document Converter",
    description: "Convert PDF/Word resumes to JSON",
    tier: "free",
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
  },
  {
    id: "value-proposition",
    href: "/Tools/ValueProposition",
    title: "Value Proposition",
    description: "Craft compelling career value statements",
    tier: "pro",
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
  },
  {
    id: "resume-tailor",
    href: "/Tools/ResumeTailor",
    title: "Resume Tailor",
    description: "Tailor your resume to a specific job description",
    tier: "pro",
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
  },
  {
    id: "form-autofill",
    href: "/tools/auto-fill",
    title: "Form Autofill",
    description: "Fill job applications with saved profile data",
    tier: "free",
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
  },
  {
    id: "resume-roast",
    href: "/tools/resume-roast",
    title: "Resume Roast",
    description: "Get a brutally honest take on your resume",
    tier: "free",
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
  },
  {
    id: "resume-consolidator",
    href: "/tools/resume-consolidator",
    title: "Resume Consolidator",
    description: "Merge multiple resumes into one master",
    tier: "free",
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
  },
  {
    id: "chrome-extension",
    href: "/chrome-extension",
    title: "Best Resume Generator",
    description: "Chrome extension for job-specific resumes",
    tier: "free",
    icon: Chrome,
    iconBgClassName: "bg-blue-100",
    iconColorClassName: "text-blue-600",
    statusBadge: BADGE_CHROME,
    stats: [
      { value: "1-Click", label: "Generation", valueClassName: "text-blue-600" },
      { value: "Job", label: "Specific", valueClassName: "text-blue-600" },
    ],
    features: ["Job-specific optimization", "Browser integration", "Instant generation"],
    ctaLabel: "Learn More",
  },
];

export function getToolsForHome(): ToolCatalogEntry[] {
  return TOOLS_CATALOG.filter((t) => t.showOnHome);
}
