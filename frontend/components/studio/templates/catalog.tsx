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
  BookOpen,
  Brush,
  Briefcase,
  Brain,
  Building2,
  Clapperboard,
  Code2,
  FileText,
  Film,
  FilePlus2,
  Frame,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  Mic2,
  Megaphone,
  Monitor,
  Palette,
  Podcast,
  Rabbit,
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
import ComicIntake from "./intake/ComicIntake";
import { COMIC_GENRES, type ComicGenre } from "@shared/comic-genres";
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
  | "podcast_interview"
  | "voice_audition_reel"
  | "voice_ivr_prompt"
  | "voice_audiobook_chapter"
  | "product_promo"
  | "endless_runner"
  | "quiz_game"
  | "memory_match"
  // ─── Comic genres (#894 / mediaKind === "comic") ──────────────────────
  // One template per genre — every genre ships its own palette + stock
  // SVG pack + AI tone-shaping prompt. All share the single ComicIntake
  // form (per `feedback_extract_on_duplication`); the wizard picks the
  // active genre via `state.comicGenreId` which the card click sets.
  | "comic_hero"
  | "comic_noir"
  | "comic_scifi"
  | "comic_fantasy"
  | "comic_romance"
  | "comic_slice"
  | "comic_manga"
  | "comic_horror"
  | "comic_comedy"
  | "comic_retro80s"
  | "comic_webtoon"
  | "comic_adventure"
  // ─── Image / drawing canvas (#932 / mediaKind === "image") ───────────
  // Single-frame Photoshop-shaped raster authoring. Each entry seeds
  // the DrawingStage with a starter canvas of the right dimensions for
  // its use case; the user can change dimensions later via the editor.
  | "drawing_blank"
  | "drawing_social_square"
  | "drawing_og_card";

/** Coarse buckets for the /studio catalog filter pills. Templates self-tag so
 *  the landing page can group them without a parallel mapping table. The
 *  "film" pill clusters Director / Actor surfaces (self-tapes, monologues,
 *  showreels, director pitches, casting calls) so the demographic finds
 *  its templates in one place. */
export type TemplateCategory =
  | "promote"
  | "showcase"
  | "hiring"
  | "quick"
  | "film"
  | "comic";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "promote", label: "Promote Yourself" },
  { id: "showcase", label: "Showcase Work" },
  { id: "hiring", label: "Hiring" },
  { id: "film", label: "Film & Acting" },
  // Comic mediaKind (#894). Twelve genre templates live in this bucket so
  // the landing page can surface the whole comic shelf with one click.
  { id: "comic", label: "Comics" },
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
    // No `defaultRecordingMode` — V2 derives the primary recorder
    // (voiceover for audio-only kinds) via `deriveKindDefaults`. V1
    // doesn't surface podcast templates.
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
    // Audio-only — V2 auto-arms Voiceover via `deriveKindDefaults`.
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
    // Audio-only — V2 auto-arms Voiceover via `deriveKindDefaults`.
  },
  // ─── Voice templates (Phase 4 of #894 / docs/prd/studio-media-kinds.md) ─────
  // Audio-only authoring like podcasts but optimised for short script-
  // driven cuts (auditions, IVR prompts, audiobook chapters). All three
  // reuse `BasicIntake` (the user describes the read in prose); a voice-
  // specific intake with script-input + voice-clone picker is a follow-
  // on (#915). `mediaKind: "voice"` routes the save-menu's publish row to
  // the voice marketplace destination (already in PUBLISH_DESTINATIONS).
  {
    id: "voice_audition_reel",
    label: "Voice audition reel",
    desc: "30–60 sec multi-style demo for casting agents — characters, tones, accents.",
    icon: AudioWaveform,
    importMode: "none",
    purpose: "personal_brand",
    category: "promote",
    mediaKind: "voice",
    audiences: ["voice_actor", "actor", "creator"],
    defaultName: "Voice audition reel",
    defaultPrompt:
      "Create a 45-second voice audition reel: slate with the actor's name + reps, three short reads each in a distinct style (warm narrator / energetic commercial / character voice), and an outro card with contact info. Keep cuts tight — no music bed beneath the reads.",
    firstTabLabel: "Reel",
    IntakeForm: BasicIntake,
    // Audio-only — V2 auto-arms Voiceover via `deriveKindDefaults`.
  },
  {
    id: "voice_ivr_prompt",
    label: "IVR / voicemail prompt",
    desc: "Short business prompt — greeting, menu options, hold message.",
    icon: Mic2,
    importMode: "none",
    purpose: "personal_brand",
    category: "quick",
    mediaKind: "voice",
    audiences: ["voice_actor", "founder", "employer"],
    defaultName: "Voicemail prompt",
    defaultPrompt:
      "Write a 20-second business voicemail / IVR prompt: warm greeting with the company name, two short menu options (sales / support) or a 'leave your name and number' line, and a polite hold-music handoff. Tone: professional, friendly, no jokes.",
    firstTabLabel: "Prompt",
    IntakeForm: BasicIntake,
    // Audio-only — V2 auto-arms Voiceover via `deriveKindDefaults`.
  },
  {
    id: "voice_audiobook_chapter",
    label: "Audiobook chapter",
    desc: "Long-form chapter read — chapter title slate, paced narration, soft outro.",
    icon: Headphones,
    importMode: "none",
    purpose: "personal_brand",
    category: "showcase",
    mediaKind: "voice",
    audiences: ["voice_actor", "creator", "educator"],
    defaultName: "Audiobook chapter",
    defaultPrompt:
      "Outline an audiobook chapter recording: book title + chapter number slate (read aloud), paced narration of the chapter text the user pastes in, and a 3-second silence outro before the next chapter join. Production note: leave a clean 2-second pre-roll for engineer trim.",
    firstTabLabel: "Chapter",
    IntakeForm: BasicIntake,
    // Audio-only — V2 auto-arms Voiceover via `deriveKindDefaults`.
  },
  // ─── Generic Promo template (#926) ────────────────────────────────────
  // Closes the customer ask "why can't I make a promo video?" — the
  // catalog already had tool_promo (software-only) and company_promo
  // (employer-brand-only). product_promo is the generic shape for any
  // product / service / event / sale promo. Reuses the existing
  // `product_launch` StudioPurpose so backend prompt config doesn't fork.
  {
    id: "product_promo",
    label: "Product / service promo",
    desc: "30-second promotional video for any product, service, event, or sale.",
    icon: Megaphone,
    importMode: "none",
    purpose: "product_launch",
    category: "showcase",
    mediaKind: "video",
    audiences: ["creator", "founder", "employer", "recruiter"],
    defaultName: "Promo video",
    defaultPrompt:
      "Create a 30-second promotional video: open with the problem your customer has, show the product / service in use, list one or two key benefits with proof, then end with a clear call to action (offer + deadline + where to act).",
    firstTabLabel: "Promo",
    IntakeForm: BasicIntake,
  },
  // ─── Game templates (#927 / Phase 1 — runtime is placeholder) ─────────
  // `mediaKind: "game"` routes the editor's `<CanvasRouter>` to mount
  // `<GameStage>` instead of `<CanvasStage>`. Seeds live in
  // `lib/studio/game/game-seeds.ts` (parallel to `template-seeds.ts`
  // for Timeline kinds). All three reuse `BasicIntake` for the prose
  // prompt; a game-specific intake (sprite picker + behavior chips)
  // lands with the Phaser integration in a follow-on pass.
  {
    id: "endless_runner",
    label: "Endless runner",
    desc: "Side-scrolling jump-and-dodge game — your sprite, your obstacles, your music.",
    icon: Rabbit,
    importMode: "none",
    purpose: "personal_brand",
    category: "showcase",
    mediaKind: "game",
    audiences: ["creator", "developer", "designer"],
    defaultName: "Endless runner",
    defaultPrompt:
      "Design an endless runner game: a player sprite that jumps, scrolling ground, three obstacle types, score counter, and a game-over screen with restart. Pick a music bed; the engine spawns obstacles on the beat.",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },
  {
    id: "quiz_game",
    label: "Quiz game",
    desc: "Multiple-choice trivia — title screen, questions, scoring, leaderboard.",
    icon: Brain,
    importMode: "none",
    purpose: "personal_brand",
    category: "showcase",
    mediaKind: "game",
    audiences: ["creator", "educator", "employer", "recruiter"],
    defaultName: "Quiz game",
    defaultPrompt:
      "Build a multiple-choice quiz game: title screen, 10 questions with 4 answer options each, instant feedback per answer, running score, and a final screen with shareable result. Pick a topic; we seed example questions.",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },
  {
    id: "memory_match",
    label: "Memory match",
    desc: "Card-matching memory game — flip pairs, beat the clock, share your time.",
    icon: Gamepad2,
    importMode: "none",
    purpose: "personal_brand",
    category: "quick",
    mediaKind: "game",
    audiences: ["creator", "educator", "designer"],
    defaultName: "Memory match",
    defaultPrompt:
      "Build a memory-match card game: 4×4 grid of cards, flip two at a time, match pairs to clear them, timer + move counter, win screen with the player's stats. Pick the card-face artwork or upload your own.",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },

  // ─── Image / drawing templates (#932 / mediaKind === "image") ─────────
  // `mediaKind: "image"` routes `<CanvasRouter>` to mount `<DrawingStage>` —
  // a Photoshop-shaped raster editor (brush, eraser, fill, layers,
  // color picker, undo/redo, AI prompt). Each entry just seeds the
  // starting canvas dimensions; the user can change them later. All
  // reuse `BasicIntake` for the prose prompt; a drawing-specific
  // intake (preset size picker, optional reference upload) is a
  // follow-on tracked on the gap register.
  {
    id: "drawing_blank",
    label: "Blank canvas",
    desc: "Start from scratch — brush, eraser, fill, layers, AI prompt. 1024×1024.",
    icon: Brush,
    importMode: "none",
    purpose: "personal_brand",
    category: "quick",
    mediaKind: "image",
    audiences: ["creator", "designer", "developer"],
    defaultName: "Untitled drawing",
    defaultPrompt: "",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },
  {
    id: "drawing_social_square",
    label: "Social post (1:1)",
    desc: "1080×1080 square — Instagram / LinkedIn / X. Layers + AI generation.",
    icon: ImageIcon,
    importMode: "none",
    purpose: "personal_brand",
    category: "promote",
    mediaKind: "image",
    audiences: ["creator", "founder", "recruiter", "employer"],
    defaultName: "Social post",
    defaultPrompt:
      "Design a square social-media post for a launch announcement — bold headline, supporting subhead, accent color and a hero illustration. Keep critical content inside the 80% safe zone.",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },
  {
    id: "drawing_og_card",
    label: "OG / link preview card",
    desc: "1200×630 — the link-preview thumbnail social sites scrape from your page.",
    icon: Frame,
    importMode: "none",
    purpose: "personal_brand",
    category: "promote",
    mediaKind: "image",
    audiences: ["creator", "founder", "developer"],
    defaultName: "OG card",
    defaultPrompt:
      "Generate an Open Graph link-preview card: title, brand mark, supporting glyph, brand palette. Centred content with breathing room — the social sites crop the edges on some platforms.",
    firstTabLabel: "Setup",
    IntakeForm: BasicIntake,
  },

  // ─── Comic templates (#894 / mediaKind === "comic") ───────────────────
  // Twelve genre cards, each opening the same ComicIntake. The genre
  // chosen is persisted on `state.comicGenreId` so the AI scaffolder +
  // template-seeds.ts know which palette / tone / stock-pack to use.
  // Generated programmatically from the COMIC_GENRES catalog so the
  // template ids, default names, default prompts and stage names stay
  // in sync with one source of truth (DRY rule).
  ...COMIC_GENRES.map(comicGenreToTemplate),
];

/** Map a `ComicGenre` to a `TemplateDef`. Keeps the catalog DRY — one
 *  source of truth (`COMIC_GENRES` in `@shared/comic-genres`) feeds the
 *  AI scaffolder, the intake form, the SVG asset path resolver, AND the
 *  template catalog. Adding a 13th genre is one entry in COMIC_GENRES;
 *  the catalog picks it up automatically. */
function comicGenreToTemplate(genre: ComicGenre): TemplateDef {
  return {
    // `comic_<id>` matches the union member in `ContentTemplate`. The
    // editor reads the trailing genre id off the template to seed
    // `state.comicGenreId` (see `template-seeds.ts`).
    id: `comic_${genre.id}` as ContentTemplate,
    label: `${genre.label} comic`,
    desc: genre.description,
    icon: BookOpen,
    // The intake form gathers the rest — no auto-import from resume /
    // job / company. The user picks the source explicitly inside
    // ComicIntake (resume / profile / services / auto).
    importMode: "none",
    // Reuses the personal_brand server-side prompt config; the comic-
    // specific tone shaping happens in the dedicated comic scaffolder
    // route (`/api/studio/generate-comic`), not by switching purposes.
    purpose: "personal_brand",
    category: "comic",
    mediaKind: "comic",
    audiences: ["job_seeker", "creator", "founder", "recruiter"],
    defaultName: `${genre.label} pitch`,
    defaultPrompt: `Turn my career story into a ${genre.label.toLowerCase()} comic — protagonist makes their pitch through ${genre.tone[0]} panels.`,
    firstTabLabel: "Comic",
    IntakeForm: ComicIntake,
  };
}

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
