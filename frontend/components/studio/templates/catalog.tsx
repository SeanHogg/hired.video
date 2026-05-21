// Single source of truth for content templates surfaced in:
//  - StudioWizard step 0 (What to Promote)
//  - StudioSidebar > Templates section
//  - StudioEditor first-tab routing (which intake form to render)
//
// Each template is fully self-describing: label, icon, copy, the import mode
// the wizard should run when it's selected, the StudioPurpose to persist,
// and the intake form component the wizard / editor should mount.

import {
  AudioWaveform,
  BarChart3,
  Briefcase,
  Building2,
  Clapperboard,
  Code2,
  FileText,
  Film,
  FilePlus2,
  Headphones,
  Mic2,
  Megaphone,
  Monitor,
  Palette,
  Podcast,
  ScrollText,
  Sparkles,
  Star,
  UserCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { StudioProjectState } from "@/types/studio";
import type { StudioPurpose } from "@/lib/services/studio-service";
import type { MediaKind } from "@shared/media-kinds";

import BasicIntake from "./intake/BasicIntake";
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
import type { Audience } from "./audiences";

// ─── Public types ────────────────────────────────────────────────────────────

export type ContentTemplate =
  | "basic"
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
  | "tool_promo"
  | "self_tape"
  | "monologue"
  | "showreel"
  | "director_pitch"
  | "casting_call"
  | "podcast_trailer"
  | "podcast_episode"
  | "podcast_interview";

/** Coarse buckets for the /studio catalog filter pills. Templates self-tag so
 *  the landing page can group them without a parallel mapping table. The
 *  "film" pill clusters Director / Actor surfaces (self-tapes, monologues,
 *  showreels, director pitches, casting calls) so the demographic finds
 *  its templates in one place. */
export type TemplateCategory = "promote" | "showcase" | "hiring" | "quick" | "film";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "promote", label: "Promote Yourself" },
  { id: "showcase", label: "Showcase Work" },
  { id: "hiring", label: "Hiring" },
  { id: "film", label: "Film & Acting" },
  { id: "quick", label: "Quick" },
];

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
  /** Category bucket for the /studio landing filter pills. */
  category: TemplateCategory;
  /** Output axis (#894) — orthogonal to `purpose` (LLM prompt config) and
   *  `category` (intent). Drives the export menu, publish destinations, and
   *  per-template "Exports as MP4 / MP3+RSS / GIF" panel. SSoT for which
   *  output profiles + publish rows light up; see `@shared/media-kinds`.
   *  Every existing template is `"video"` — Podcast / Voice / Animation
   *  kinds land alongside their first template entries. */
  mediaKind: MediaKind;
  /** Demographics this template serves. Single SoT for #900 audience pages
   *  (`/for/:audience`) and #901 template-page "best for" chips. Filter the
   *  catalog directly — no parallel `AUDIENCE_TO_TEMPLATES` lookup. */
  audiences: Audience[];
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

// The per-template canvas content (the actual scenes + widgets a user
// starts with) lives in [editor-v2/template-seeds.ts]. Read it via
// `seedCanvasFromTemplate(id)` — that's the single source of truth
// across the marketplace press-play preview, the "Use this template"
// CTA, and the agent-tool hydrator. Do NOT add a parallel content field
// here.

// ─── Catalog ─────────────────────────────────────────────────────────────────
//
// Order matters — this is the order users see in both the sidebar and the
// wizard's Promote-What grid.

export const TEMPLATE_CATALOG: TemplateDef[] = [
  {
    id: "basic",
    label: "Basic",
    desc: "Start from scratch — describe one scene, generate the script.",
    icon: FilePlus2,
    importMode: "none",
    // Generic single-scene path — backend handles `basic` purpose
    // explicitly (no brand framing) so the script comes out as
    // whatever the user described, not a personal-brand mission
    // statement.
    purpose: "basic",
    category: "quick",
    mediaKind: "video",
    audiences: ["creator"],
    defaultName: "New Video",
    // Basic skips the LLM (#492) — it produces a single mock scene from
    // the user's description verbatim, so a pre-filled instructional
    // prompt would render as the scene body. Leave defaultPrompt empty
    // and require user input in BasicIntake before Generate fires (#494).
    defaultPrompt: "",
    firstTabLabel: "Description",
    IntakeForm: BasicIntake,
  },
  {
    id: "profile",
    label: "Promote Yourself",
    desc: "Profile-led video — bio, highlights, and any services you offer.",
    icon: UserCircle,
    importMode: "auto-profile",
    purpose: "personal_brand",
    category: "promote",
    mediaKind: "video",
    audiences: ["job_seeker", "creator", "founder", "recruiter"],
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
    category: "promote",
    mediaKind: "video",
    audiences: ["job_seeker"],
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
    category: "promote",
    mediaKind: "video",
    audiences: ["job_seeker", "creator", "founder"],
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
    category: "promote",
    mediaKind: "video",
    audiences: ["job_seeker", "developer", "designer", "data_analyst"],
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
    category: "showcase",
    mediaKind: "video",
    audiences: ["developer"],
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
    category: "showcase",
    mediaKind: "video",
    audiences: ["designer"],
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
    category: "showcase",
    mediaKind: "video",
    audiences: ["data_analyst", "job_seeker"],
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
    category: "hiring",
    mediaKind: "video",
    audiences: ["recruiter", "employer"],
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
    category: "hiring",
    mediaKind: "video",
    audiences: ["employer", "recruiter"],
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
    category: "showcase",
    mediaKind: "video",
    audiences: ["athlete", "actor", "musician", "creator", "director"],
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
    category: "showcase",
    mediaKind: "video",
    audiences: ["creator", "founder", "developer"],
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
  // ─── Film & Acting templates ───────────────────────────────────────────────
  // Director + Actor templates share the generic BasicIntake — the user
  // describes the scene / role / treatment in prose and the editor opens
  // pre-seeded with a film-industry-shaped composition (slate / scene /
  // outro for self-tape, role + sides + how-to-submit for casting calls,
  // etc.). Per DRY: no per-template intake forms; the existing prompt
  // textarea handles every "describe what you want" path. Adding a new
  // film template = one TEMPLATE_CATALOG entry + one SEEDS entry.
  {
    id: "self_tape",
    label: "Self-tape audition",
    desc: "Slate, scene read, and a clean outro — the industry-standard self-tape layout.",
    icon: Clapperboard,
    importMode: "none",
    // Personal-brand prompt config — the actor IS the product. Future
    // film-specific StudioPurpose could rephrase the system prompt, but
    // for now personal_brand produces an actor-friendly script.
    purpose: "personal_brand",
    category: "film",
    mediaKind: "video",
    audiences: ["actor"],
    defaultName: "Self-tape audition",
    defaultPrompt:
      "Create a self-tape audition layout: a slate scene with the actor's name, role, and agent, a scene-read with the dialogue, and a clean outro thanking the casting team.",
    firstTabLabel: "Audition",
    IntakeForm: BasicIntake,
    // Self-tapes are recorded against a backdrop — auto-open the webcam
    // recorder on the Actions tab so the actor doesn't have to hunt for it.
    defaultRecordingMode: "webcam",
  },
  {
    id: "monologue",
    label: "Monologue",
    desc: "Single-take dramatic monologue with captions for casting reviewers.",
    icon: Mic2,
    importMode: "none",
    purpose: "personal_brand",
    category: "film",
    mediaKind: "video",
    audiences: ["actor"],
    defaultName: "Monologue",
    defaultPrompt:
      "Create a single-scene monologue layout — actor close-up, optional title card, captions on by default so the casting reviewer can read along.",
    firstTabLabel: "Monologue",
    IntakeForm: BasicIntake,
    defaultRecordingMode: "webcam",
  },
  {
    id: "showreel",
    label: "Actor showreel",
    desc: "Multi-scene reel of your best clips — opens with credits, cuts on the beat.",
    icon: Star,
    importMode: "none",
    purpose: "personal_brand",
    category: "film",
    mediaKind: "video",
    audiences: ["actor"],
    defaultName: "Actor showreel",
    defaultPrompt:
      "Create a 60-90 second actor showreel: title card with the actor's name + reps, three to five scene snippets with project / role chips, and an outro card with contact info.",
    firstTabLabel: "Reel",
    IntakeForm: BasicIntake,
  },
  {
    id: "director_pitch",
    label: "Director's pitch",
    desc: "Treatment-style pitch for a film or series — logline, tone, characters, ask.",
    icon: Film,
    importMode: "none",
    // product_launch prompt config — a film is a product being pitched.
    purpose: "product_launch",
    category: "film",
    mediaKind: "video",
    audiences: ["director"],
    defaultName: "Director's pitch",
    defaultPrompt:
      "Create a director's pitch deck: title + logline, tone reference, character beats, comparable films, the ask (budget / partnership / cast), and a closing scene with director contact info.",
    firstTabLabel: "Pitch",
    IntakeForm: BasicIntake,
  },
  {
    id: "casting_call",
    label: "Casting call",
    desc: "Director-facing call: describe the role, submission window, and how to send a self-tape.",
    icon: ScrollText,
    importMode: "none",
    // job_ad prompt config — a casting call is structurally a job listing
    // (role description, requirements, submission window). The film
    // category keeps it visually separated from corporate Job Ad.
    purpose: "job_ad",
    category: "film",
    mediaKind: "video",
    audiences: ["director", "employer"],
    defaultName: "Casting call",
    defaultPrompt:
      "Create a casting call: production title, role name + character description, shoot dates + location, union / non-union status, submission deadline, and explicit how-to-submit instructions for self-tapes.",
    firstTabLabel: "Casting call",
    IntakeForm: BasicIntake,
  },
  // ─── Podcast templates (Phase 2 of #894 / docs/prd/studio-media-kinds.md) ────
  // Audio-first authoring — `mediaKind: "podcast"` gates the save-menu's
  // export rows to MP3 / M4A / WAV (+ video-podcast MP4) per
  // `outputProfilesFor("podcast")`. Reuses BasicIntake (the user
  // describes the episode in prose); a podcast-specific intake with
  // episode # / season / show notes fields lands when the chapter editor
  // (#907) ships.
  {
    id: "podcast_trailer",
    label: "Podcast trailer",
    desc: "60-second show trailer — hook, what listeners get, where to subscribe.",
    icon: AudioWaveform,
    importMode: "none",
    purpose: "personal_brand",
    category: "promote",
    mediaKind: "podcast",
    audiences: ["podcaster", "creator", "founder"],
    defaultName: "Podcast trailer",
    defaultPrompt:
      "Create a 60-second podcast trailer: cold-open hook, host introduction, what each episode delivers, three sample episode topics, and a clear call-to-subscribe with where to find the show.",
    firstTabLabel: "Trailer",
    IntakeForm: BasicIntake,
    defaultRecordingMode: "webcam",
  },
  {
    id: "podcast_episode",
    label: "Podcast episode",
    desc: "Full-length episode — intro music, chaptered segments, outro CTA.",
    icon: Podcast,
    importMode: "none",
    purpose: "personal_brand",
    category: "showcase",
    mediaKind: "podcast",
    audiences: ["podcaster", "educator", "founder", "creator"],
    defaultName: "New episode",
    defaultPrompt:
      "Outline a podcast episode: cold-open hook, intro music bed, host welcome, three numbered chapters with topic and 1-line takeaway each, sponsor break placement, listener call-to-action, and outro music. Each chapter becomes a marker on the timeline.",
    firstTabLabel: "Episode",
    IntakeForm: BasicIntake,
    defaultRecordingMode: "webcam",
  },
  {
    id: "podcast_interview",
    label: "Podcast interview",
    desc: "Two-host / guest format — multi-track audio for guest, host, and music.",
    icon: Headphones,
    importMode: "none",
    purpose: "personal_brand",
    category: "showcase",
    mediaKind: "podcast",
    audiences: ["podcaster", "educator", "recruiter", "founder"],
    defaultName: "Interview episode",
    defaultPrompt:
      "Outline a podcast interview: cold-open hook with a teaser quote, host intro of the guest (name + credential), three numbered topic chapters with a question prompt each, a rapid-fire segment, and an outro CTA with where to find the guest. Multi-track audio: separate host and guest channels for clean editing.",
    firstTabLabel: "Interview",
    IntakeForm: BasicIntake,
    defaultRecordingMode: "webcam",
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
