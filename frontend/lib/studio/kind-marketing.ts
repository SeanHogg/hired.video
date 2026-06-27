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
import type { ContentTemplate } from "@/components/studio/templates/catalog";

export interface KindMarketingPitch {
  /** i18n flat-key for the display title — what the kind IS in user-facing
   *  terms. Different from `MEDIA_KIND_UI[kind].badgeLabel` because that's a
   *  single-word chip ("Video", "Comic") whereas the pitch wants a marketable
   *  phrase ("Video pitches & resumes", "Interactive comics"). Per the repo
   *  i18n rule, this pure module exposes a key — the consumer renders it via
   *  `t(...)`, never the literal. Catalog: `studioKind.<kind>.title`. */
  titleKey: string;
  /** i18n flat-key for the 1-2 sentence pitch — what the user can MAKE with
   *  this kind. Reads as the body copy under the title in the "What you can
   *  make" grid. Catalog: `studioKind.<kind>.blurb`. */
  blurbKey: string;
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
  /** Representative built-in content template the marketing "What you can
   *  make" card seeds when a signed-out visitor picks this kind. Clicking
   *  the card drops them straight into the anon editor on a fresh draft of
   *  the right mediaKind via `/studio/new?contentTemplate=<id>` (#2212 anon
   *  adoption). One curated starter per kind — the flagship template for
   *  that format, not just "the first catalog match". Roadmap kinds carry a
   *  best-fit id for type completeness; it's never linked because the grid
   *  filters on `isShippable`. */
  starterTemplate: ContentTemplate;
}

/** Per-kind pitch. `Record<MediaKind, …>` makes adding a new kind a
 *  build-time forcing function: TypeScript errors on this declaration
 *  the moment a new entry lands in `MEDIA_KINDS` without a matching
 *  pitch here. */
export const KIND_MARKETING: Record<MediaKind, KindMarketingPitch> = {
  video: {
    titleKey: "studioKind.video.title",
    blurbKey: "studioKind.video.blurb",
    icon: Film,
    // Mid-tone slate so the icon mirrors the video badge's slate identity
    // (`MediaKindBadge` uses bg-slate-900/85) while staying legible on BOTH
    // the dark studio landing and light surfaces — `text-slate-900` rendered
    // the flagship icon invisible against the dark "What you can make" grid.
    accentClass: "bg-slate-500/10 text-slate-500",
    isShippable: true,
    // Video resume — the flagship video starter, same default the hero CTA
    // seeds so the hero + this card open the identical fresh draft.
    starterTemplate: "resume",
  },
  podcast: {
    titleKey: "studioKind.podcast.title",
    blurbKey: "studioKind.podcast.blurb",
    icon: Headphones,
    accentClass: "bg-violet-600/10 text-violet-600",
    isShippable: true,
    starterTemplate: "podcast_episode",
  },
  voice: {
    titleKey: "studioKind.voice.title",
    blurbKey: "studioKind.voice.blurb",
    icon: Mic2,
    accentClass: "bg-amber-500/10 text-amber-600",
    isShippable: true,
    starterTemplate: "voice_audition_reel",
  },
  animation: {
    titleKey: "studioKind.animation.title",
    blurbKey: "studioKind.animation.blurb",
    icon: Sparkles,
    accentClass: "bg-emerald-500/10 text-emerald-600",
    isShippable: true,
    starterTemplate: "animation-explainer",
  },
  game: {
    titleKey: "studioKind.game.title",
    blurbKey: "studioKind.game.blurb",
    icon: Gamepad2,
    accentClass: "bg-fuchsia-600/10 text-fuchsia-600",
    isShippable: true,
    // 3D world — the headline of the games shelf (the 2D mini-games are the
    // secondary lane). See [project_3d_world_game_studio].
    starterTemplate: "game_3d_world",
  },
  comic: {
    titleKey: "studioKind.comic.title",
    blurbKey: "studioKind.comic.blurb",
    icon: BookOpen,
    accentClass: "bg-sky-600/10 text-sky-600",
    isShippable: true,
    // First genre in COMIC_GENRES — the editor lets the user switch genre
    // inside ComicIntake, so any genre starter is a valid entry point.
    starterTemplate: "comic_hero",
  },
  image: {
    // Roadmap kind — see #932 / #940. Listed here for TypeScript
    // exhaustiveness; `isShippable: false` keeps it out of the public
    // "what you can make" grid until the runtime ships.
    titleKey: "studioKind.image.title",
    blurbKey: "studioKind.image.blurb",
    icon: ImageIcon,
    accentClass: "bg-rose-600/10 text-rose-600",
    isShippable: false,
    starterTemplate: "drawing_blank",
  },
  cad: {
    // CAD 2D drafting runtime (#930) — Phase 1 scaffolding ships the
    // canvas surface + state model; full tooling (DXF / STEP / layers /
    // dimensions UI) lands in Phase 2.
    titleKey: "studioKind.cad.title",
    blurbKey: "studioKind.cad.blurb",
    icon: Ruler,
    accentClass: "bg-cyan-600/10 text-cyan-600",
    isShippable: false,
    starterTemplate: "cad-floor-plan",
  },
  cad_3d: {
    // 3D CAD runtime (#930 follow-on). Primitive solids + boolean ops;
    // STL / STEP / PNG export. BREP analytic surfaces land with the
    // replicad kernel integration.
    titleKey: "studioKind.cad_3d.title",
    blurbKey: "studioKind.cad_3d.blurb",
    icon: Box,
    accentClass: "bg-teal-600/10 text-teal-600",
    isShippable: false,
    starterTemplate: "cad3d_part",
  },
  interactive_comic: {
    // Branching comic runtime (#929). Pages = scenes; reader picks
    // branches at runtime.
    titleKey: "studioKind.interactive_comic.title",
    blurbKey: "studioKind.interactive_comic.blurb",
    icon: Workflow,
    accentClass: "bg-indigo-600/10 text-indigo-600",
    isShippable: false,
    starterTemplate: "icomic_branching_pitch",
  },
  document: {
    // Paged WYSIWYG document runtime (#1912) — resume / job / article / blog
    // authored on a fixed print sheet. Hidden from the public grid until the
    // DocumentStage runtime ships.
    titleKey: "studioKind.document.title",
    blurbKey: "studioKind.document.blurb",
    icon: FileText,
    accentClass: "bg-blue-700/10 text-blue-700",
    isShippable: false,
    starterTemplate: "resume_doc",
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

/** Anon-editor deep link for a kind's marketing card. Drops a signed-out
 *  visitor straight into `/studio/new` on a fresh draft of the right
 *  mediaKind, seeded from the kind's representative starter template (#2212
 *  anon adoption). The raw `ContentTemplate` id is passed verbatim as
 *  `?contentTemplate=` — StudioEditorV2 resolves both the snake id and its
 *  kebab slug (`slugToBuiltinId(hint) ?? hint`), so no normalisation here.
 *  Single SoT for "where does picking this kind take you" — every marketing
 *  surface links through this, never a hand-built `/studio/new?...` string. */
export function kindStarterHref(kind: MediaKind): string {
  return `/studio/new?contentTemplate=${KIND_MARKETING[kind].starterTemplate}`;
}
