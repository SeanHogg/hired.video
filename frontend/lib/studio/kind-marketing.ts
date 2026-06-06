/**
 * Per-mediaKind marketing pitch — single source of truth for the
 * "what can I make in the studio?" surfaces shown to anonymous /
 * shopping-mode visitors.
 *
 * Consumers:
 *   - `frontend/pages/studio/StudioLayout.tsx` Landing (the marketing
 *     page at hired.video/studio for signed-out visitors) — the "What
 *     you can make" grid maps over this record so adding a kind
 *     ripples here automatically.
 *   - Future kind-specific marketing pages (#900 audience pages,
 *     #901 per-template SEO pages) read from here when they need a
 *     "you can also make…" cross-sell.
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`): every
 * surface that wants to describe a mediaKind in marketing copy reads
 * from this record. NEVER hardcode "video resume", "podcast",
 * "comic" copy in a marketing component — the strings live here so a
 * rename in one place propagates. Adding a new kind requires (1) a new
 * entry in `MEDIA_KINDS` (shared/media-kinds.ts), (2) the corresponding
 * UI hint in `MEDIA_KIND_UI`, (3) one new entry here. TypeScript's
 * `Record<MediaKind, …>` exhaustiveness check fails the build if step
 * 3 is forgotten.
 */

import {
  BookOpen,
  Box,
  FileText,
  Film,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  Mic2,
  Ruler,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { MediaKind } from "@shared/media-kinds";

export interface KindMarketingPitch {
  /** Display title — what the kind IS in user-facing terms. Different
   *  from `MEDIA_KIND_UI[kind].badgeLabel` because that's a single-word
   *  chip ("Video", "Comic") whereas the pitch wants a marketable
   *  phrase ("Video pitches & resumes", "Interactive comics"). */
  title: string;
  /** 1-2 sentence pitch — what the user can MAKE with this kind. Plain
   *  prose, no marketing jargon. Reads as the body copy under the
   *  title in the "What you can make" grid. */
  blurb: string;
  /** Marketing icon. lucide-react reference; the grid renders it at
   *  ~h-10 w-10 size. */
  icon: LucideIcon;
  /** Tailwind colour class applied to the icon's tinted background.
   *  Per-kind so the grid reads as a colourful spread rather than a
   *  flat mono grid. Mirrors the `MediaKindBadge` palette so the same
   *  kind reads as the same colour across every marketing surface. */
  accentClass: string;
  /** When false, the kind is excluded from the public "what you can
   *  make" grid even though it's enumerable in MEDIA_KINDS. Used for
   *  roadmap kinds that aren't shippable yet — `image` is in the enum
   *  for #932 plumbing but the marketing surface still hides it until
   *  the runtime ships. Single SoT for "is this kind shipping?" — the
   *  router + the landing both gate on this flag. */
  isShippable: boolean;
}

/** Per-kind pitch. `Record<MediaKind, …>` makes adding a new kind a
 *  build-time forcing function: TypeScript errors on this declaration
 *  the moment a new entry lands in `MEDIA_KINDS` without a matching
 *  pitch here. */
export const KIND_MARKETING: Record<MediaKind, KindMarketingPitch> = {
  video: {
    title: "Video pitches & resumes",
    blurb:
      "AI writes the script and renders a polished 720p / 1080p video in 60 seconds. Job seekers, recruiters, and companies all use the same canvas — video resumes, job ads, company promos, sizzle reels.",
    icon: Film,
    accentClass: "bg-slate-900/10 text-slate-900",
    isShippable: true,
  },
  podcast: {
    title: "Podcasts & audio episodes",
    blurb:
      "Trailers, full-length episodes, two-host interviews. MP3 / M4A export with chapter markers, RSS-feed-ready. The same studio surface, just audio-first.",
    icon: Headphones,
    accentClass: "bg-violet-600/10 text-violet-600",
    isShippable: true,
  },
  voice: {
    title: "Voice clips",
    blurb:
      "Audition reels, IVR / voicemail prompts, audiobook chapters. Powered by the same TTS + voice-clone catalog that drives video voiceovers.",
    icon: Mic2,
    accentClass: "bg-amber-500/10 text-amber-600",
    isShippable: true,
  },
  animation: {
    title: "Animated loops",
    blurb:
      "GIFs, animated WebP, looping promo clips for social. The same canvas runtime, exported as a loop.",
    icon: Sparkles,
    accentClass: "bg-emerald-500/10 text-emerald-600",
    isShippable: true,
  },
  game: {
    title: "Browser games",
    blurb:
      "Endless runners, quiz games, memory matches. Built in the studio, exported as a self-contained HTML5 bundle that runs on any web host.",
    icon: Gamepad2,
    accentClass: "bg-fuchsia-600/10 text-fuchsia-600",
    isShippable: true,
  },
  comic: {
    title: "Interactive comics",
    blurb:
      "Turn your resume into a 6-page pitch comic — 12 genres from noir detective to shonen manga, each with its own palette + AI scriptwriter that grounds the story in your real career.",
    icon: BookOpen,
    accentClass: "bg-sky-600/10 text-sky-600",
    isShippable: true,
  },
  image: {
    // Roadmap kind — see #932 / #940. Listed here for TypeScript
    // exhaustiveness; `isShippable: false` keeps it out of the public
    // "what you can make" grid until the runtime ships.
    title: "Static images",
    blurb:
      "Photoshop-shaped raster authoring — single-frame social posts, OG cards, podcast covers. Coming soon (#932).",
    icon: ImageIcon,
    accentClass: "bg-rose-600/10 text-rose-600",
    isShippable: false,
  },
  cad: {
    // CAD 2D drafting runtime (#930) — Phase 1 scaffolding ships the
    // canvas surface + state model; full tooling (DXF / STEP / layers /
    // dimensions UI) lands in Phase 2.
    title: "Technical drawings",
    blurb:
      "2D vector drafting — lines, rectangles, circles, dimensions. Millimetre-accurate. Coming soon (#930).",
    icon: Ruler,
    accentClass: "bg-cyan-600/10 text-cyan-600",
    isShippable: false,
  },
  cad_3d: {
    // 3D CAD runtime (#930 follow-on). Primitive solids + boolean ops;
    // STL / STEP / PNG export. BREP analytic surfaces land with the
    // replicad kernel integration.
    title: "3D models",
    blurb:
      "Primitive solids, boolean ops, STL + STEP export for 3D printing and downstream CAM. Coming soon (#930).",
    icon: Box,
    accentClass: "bg-teal-600/10 text-teal-600",
    isShippable: false,
  },
  interactive_comic: {
    // Branching comic runtime (#929). Pages = scenes; reader picks
    // branches at runtime.
    title: "Branching comics",
    blurb:
      "Choose-your-own-adventure comics — reader picks panels' next page, flags unlock branches. Coming soon (#929).",
    icon: Workflow,
    accentClass: "bg-indigo-600/10 text-indigo-600",
    isShippable: false,
  },
  document: {
    // Paged WYSIWYG document runtime (#1912) — resume / job / article / blog
    // authored on a fixed print sheet. Hidden from the public grid until the
    // DocumentStage runtime ships.
    title: "Resumes & documents",
    blurb:
      "Design resumes, job posts, and articles on a print-perfect canvas — drag in sections, add interactive media, export to PDF. Coming soon (#1912).",
    icon: FileText,
    accentClass: "bg-blue-700/10 text-blue-700",
    isShippable: false,
  },
};

/** The shippable subset of `KIND_MARKETING`, in `MEDIA_KINDS` declaration
 *  order. Marketing surfaces map over this directly — the order is the
 *  display order. Adding a new shippable kind appears automatically
 *  without touching any consumer. */
export function listShippableKindPitches(): Array<
  { kind: MediaKind } & KindMarketingPitch
> {
  return (Object.entries(KIND_MARKETING) as Array<[MediaKind, KindMarketingPitch]>)
    .filter(([, p]) => p.isShippable)
    .map(([kind, pitch]) => ({ kind, ...pitch }));
}
