// Single source of truth for content templates surfaced in:
//  - StudioWizard step 0 (What to Promote)
//  - StudioSidebar > Templates section
//  - StudioEditor first-tab routing (which intake form to render)
//
// Each template is fully self-describing: label, icon, copy, the import mode
// the wizard should run when it's selected, the StudioPurpose to persist,
// and the intake form component the wizard / editor should mount.

import {
  BarChart3,
  Briefcase,
  Building2,
  Code2,
  FileText,
  Film,
  Megaphone,
  Monitor,
  Palette,
  Sparkles,
  UserCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { StudioProjectState } from "@/types/studio";
import type { StudioPurpose } from "@/lib/services/studio-service";

import ProfileIntake from "./intake/ProfileIntake";
import ResumeIntake from "./intake/ResumeIntake";
import PersonalBrandIntake from "./intake/PersonalBrandIntake";
import SkillsDemoIntake from "./intake/SkillsDemoIntake";
import CodeWalkthroughIntake from "./intake/CodeWalkthroughIntake";
import DesignPortfolioIntake from "./intake/DesignPortfolioIntake";
import DataAnalysisIntake from "./intake/DataAnalysisIntake";
import JobAdIntake from "./intake/JobAdIntake";
import CompanyPromoIntake from "./intake/CompanyPromoIntake";
import SizzleReelIntake from "./intake/SizzleReelIntake";
import ToolPromoIntake from "./intake/ToolPromoIntake";

// ─── Public types ────────────────────────────────────────────────────────────

export type ContentTemplate =
  | "profile"
  | "resume"
  | "personal_brand"
  | "skills_demo"
  | "code_walkthrough"
  | "design_portfolio"
  | "data_analysis"
  | "job_ad"
  | "company_promo"
  | "sizzle_reel"
  | "tool_promo";

/** How the wizard imports the artifact backing this template at step 0.
 *  - "auto-resume":  load the user's master resume
 *  - "auto-profile": load the user's profile + service offerings
 *  - "pick-job":     show a job picker
 *  - "pick-company": show a company picker
 *  - "none":         no auto-import; the intake form is the input
 */
export type ImportMode =
  | "auto-resume"
  | "auto-profile"
  | "pick-job"
  | "pick-company"
  | "none";

export interface IntakeProps {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  /** Allows the intake form to flash required fields when the user tries to
   *  advance without enough input — wizard / editor pass this through. */
  validationFlash?: boolean;
  /** Called when the user picks a source artifact (resume / job) so the
   *  parent can auto-link the corresponding subject to the active project.
   *  Optional — most intake forms ignore it. */
  onLinkSubject?: (subject: { kind: "resume" | "job"; id: string }) => void;
}

export interface TemplateDef {
  id: ContentTemplate;
  label: string;
  /** Short copy shown under the label in cards. */
  desc: string;
  icon: LucideIcon;
  importMode: ImportMode;
  /** Persisted on the project — drives backend prompt config + storyboard generation. */
  purpose: StudioPurpose;
  /** Default project name when this template is picked. */
  defaultName: string;
  /** Default AI prompt when this template is picked. */
  defaultPrompt: string;
  /** Label for the editor's first tab when this template is active. */
  firstTabLabel: string;
  /** The intake form component mounted on wizard step 2 + editor tab 1. */
  IntakeForm: React.ComponentType<IntakeProps>;
  /** When set, StudioActions opens the Recording panel and auto-arms
   *  the WebcamRecorder in this mode the moment the user reaches the
   *  Actions tab. Same auto-arm hook the extension's `?capture=screen`
   *  URL param uses — both signals route through StudioLayout's
   *  recorder-intent state (DRY: one effect, two triggers). */
  defaultRecordingMode?: "webcam" | "screen" | "screen+webcam";
}

// ─── Catalog ─────────────────────────────────────────────────────────────────
//
// Order matters — this is the order users see in both the sidebar and the
// wizard's Promote-What grid.

export const TEMPLATE_CATALOG: TemplateDef[] = [
  {
    id: "profile",
    label: "Promote Yourself",
    desc: "Profile-led video — bio, highlights, and any services you offer.",
    icon: UserCircle,
    importMode: "auto-profile",
    purpose: "personal_brand",
    defaultName: "Promote Yourself",
    defaultPrompt: "Create a 30-second video promoting my profile — my role, expertise, and what I offer.",
    firstTabLabel: "Profile",
    IntakeForm: ProfileIntake,
  },
  {
    id: "resume",
    label: "Video Resume",
    desc: "Turn your work history into a 60-second video pitch.",
    icon: FileText,
    importMode: "auto-resume",
    purpose: "resume",
    defaultName: "New Video Resume",
    defaultPrompt: "Create a professional 28-second video resume",
    firstTabLabel: "Prompt",
    IntakeForm: ResumeIntake,
  },
  {
    id: "personal_brand",
    label: "Personal Brand",
    desc: "Tell your career story from scratch — no resume needed.",
    icon: Sparkles,
    importMode: "none",
    purpose: "personal_brand",
    defaultName: "Personal Brand Video",
    defaultPrompt: "Create a personal brand video that tells my story",
    firstTabLabel: "Prompt",
    IntakeForm: PersonalBrandIntake,
  },
  {
    id: "skills_demo",
    label: "Skills Demo",
    desc: "Pick skills from your resume and visualize where you've used them.",
    icon: Monitor,
    importMode: "auto-resume",
    purpose: "resume",
    defaultName: "Skills Demo",
    defaultPrompt: "Create a skills demonstration video showcasing technical expertise",
    firstTabLabel: "Setup",
    IntakeForm: SkillsDemoIntake,
  },
  {
    id: "code_walkthrough",
    label: "Code Walkthrough",
    desc: "Screen + webcam walkthrough of your code, with snippets and project links.",
    icon: Code2,
    importMode: "none",
    purpose: "resume",
    defaultName: "Code Walkthrough",
    defaultPrompt: "Create a video walking through code architecture and decisions",
    firstTabLabel: "Setup",
    IntakeForm: CodeWalkthroughIntake,
  },
  {
    id: "design_portfolio",
    label: "Design Portfolio",
    desc: "Showcase design projects with images and links — auto-pulled from your resume.",
    icon: Palette,
    importMode: "auto-resume",
    purpose: "resume",
    defaultName: "Design Portfolio",
    defaultPrompt: "Create a video showcasing my design portfolio — projects, process, and outcomes",
    firstTabLabel: "Setup",
    IntakeForm: DesignPortfolioIntake,
  },
  {
    id: "data_analysis",
    label: "Data Analysis",
    desc: "Show insights from your data — paste a sample, pick a chart, narrate the takeaway.",
    icon: BarChart3,
    importMode: "none",
    purpose: "resume",
    defaultName: "Data Analysis",
    defaultPrompt: "Create a video showing data insights, methodology, and visualizations",
    firstTabLabel: "Setup",
    IntakeForm: DataAnalysisIntake,
  },
  {
    id: "job_ad",
    label: "Job Ad",
    desc: "Promote an open role. Pick a job to auto-fill the script.",
    icon: Briefcase,
    importMode: "pick-job",
    purpose: "job_ad",
    defaultName: "Job Ad Video",
    defaultPrompt: "Create a compelling 30-second job advertisement video",
    firstTabLabel: "Job Details",
    IntakeForm: JobAdIntake,
  },
  {
    id: "company_promo",
    label: "Promote Your Company",
    desc: "Showcase your company to candidates. Pick one of your companies to auto-fill the script.",
    icon: Building2,
    importMode: "pick-company",
    purpose: "company_promo",
    defaultName: "Company Promo Video",
    defaultPrompt: "Create a 30-second video promoting my company — what we do, who we serve, and why we hire.",
    firstTabLabel: "Company Details",
    IntakeForm: CompanyPromoIntake,
  },
  {
    id: "sizzle_reel",
    label: "Sizzle Reel",
    desc: "Drop clips + a music bed. We pick the best moments and cut to the beat.",
    icon: Film,
    importMode: "none",
    purpose: "personal_brand",
    defaultName: "Sizzle Reel",
    defaultPrompt: "Build a sizzle reel from my clips, cut to the music",
    firstTabLabel: "Reel Builder",
    IntakeForm: SizzleReelIntake,
  },
  {
    id: "tool_promo",
    label: "Tool Promo",
    desc: "One-scene 30s promo for a tool from the catalog — screen + voiceover.",
    icon: Wrench,
    importMode: "none",
    // Reuses the existing product_launch backend prompt config — a tool
    // is a product. If tool promos ever need their own server-side prompt
    // shape, add a "tool_promo" StudioPurpose.
    purpose: "product_launch",
    defaultName: "Tool Promo",
    defaultPrompt: "Create a single-scene 30-second promo video for a tool from the hired.video catalog. Open with the problem, show the tool in use, end with a clear call to action.",
    firstTabLabel: "Pick Tool",
    IntakeForm: ToolPromoIntake,
    // Auto-open the Recording panel in screen+webcam mode (PiP) on
    // the Actions tab. The whole template exists to demo a tool in
    // the browser — there's no scenario where the user wouldn't
    // reach for screen capture next.
    defaultRecordingMode: "screen+webcam",
  },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

/** Find a template by id. Falls back to the first template (profile) for
 *  unknown ids — defensive for legacy persisted values like "skills-demo". */
export function getTemplate(id: ContentTemplate | string | undefined): TemplateDef {
  return (
    TEMPLATE_CATALOG.find((t) => t.id === id) ??
    TEMPLATE_CATALOG.find((t) => t.id === legacyAlias(id)) ??
    TEMPLATE_CATALOG[0]
  );
}

/** Normalize legacy id strings written before the catalog refactor. */
function legacyAlias(id: ContentTemplate | string | undefined): ContentTemplate | undefined {
  if (id === "skills-demo") return "skills_demo";
  return undefined;
}

/** Convenience for the megaphone icon on Job Ad — kept exported in case
 *  consumers want to render their own ad-hoc card. */
export { Megaphone };
