import { isMediaKind, type MediaKind } from "./kinds.js";

// ─── Per-kind editor + save labels ───────────────────────────────────────────
//
// Tiny per-kind labels the UI surfaces in two places: the save menu's
// "Export …" verb and the project-card "kind" badge. Living here keeps
// the catalog free of `if mediaKind === "podcast"` string surgery.

export interface MediaKindUiHints {
  /** Verb the export item uses, e.g. "Export MP4" / "Export episode". */
  exportVerb: string;
  /** Short noun the project-card badge displays. */
  badgeLabel: string;
  /** Single-letter scoring icon hint for sparse-UI surfaces. */
  shortLabel: string;
  /**
   * Verb the wizard "Done" CTA uses. CanvasState-authoring kinds
   * (video / podcast / comic) say "Generate <noun>" because the wizard
   * actually fires an LLM scene/panel generator; non-CanvasState kinds
   * (voice / animation / game / image / cad) say "Create <noun>" because
   * the wizard just seeds a template — no AI round-trip.
   */
  createVerb: string;
}

export const MEDIA_KIND_UI: Record<MediaKind, MediaKindUiHints> = {
  video:     { exportVerb: "Export video",   badgeLabel: "Video",     shortLabel: "V", createVerb: "Generate video"     },
  podcast:   { exportVerb: "Export episode", badgeLabel: "Podcast",   shortLabel: "P", createVerb: "Generate podcast"   },
  voice:     { exportVerb: "Export audio",   badgeLabel: "Voice",     shortLabel: "A", createVerb: "Create voice clip"  },
  animation: { exportVerb: "Export loop",    badgeLabel: "Animation", shortLabel: "L", createVerb: "Create animation"   },
  game:      { exportVerb: "Export game",    badgeLabel: "Game",      shortLabel: "G", createVerb: "Create game"        },
  comic:     { exportVerb: "Export comic",   badgeLabel: "Comic",     shortLabel: "C", createVerb: "Generate comic"     },
  // `image` is the single-frame canvas runtime (#929) — single scene,
  // no time axis, exports as PNG/JPG/SVG. The hint lives here so
  // `Record<MediaKind, …>` typing is total even before the runtime ships.
  image:     { exportVerb: "Export image",   badgeLabel: "Image",     shortLabel: "I", createVerb: "Create image"       },
  // `cad` is the 2D drafting runtime (#930). Static vector output;
  // exports as SVG/PDF/DXF/PNG.
  cad:       { exportVerb: "Export drawing", badgeLabel: "CAD",       shortLabel: "D", createVerb: "Create drawing"     },
  // `cad_3d` is the 3D modelling runtime (#930 follow-on). Triangulated
  // mesh exports as STL / STEP / PNG. BREP analytic surfaces land when
  // the replicad kernel is wired through the editor.
  cad_3d:    { exportVerb: "Export model",   badgeLabel: "3D",        shortLabel: "M", createVerb: "Create 3D model"    },
  // `interactive_comic` is the branching comic runtime (#929). Pages
  // are CanvasState scenes; the branching graph rides in
  // interactiveComicState. Exports CBZ / PDF via a "first valid branch"
  // linear walk; reader runtime resolves choices live.
  interactive_comic: { exportVerb: "Export comic", badgeLabel: "Comic+", shortLabel: "B", createVerb: "Create interactive comic" },
  // `document` is the paged WYSIWYG runtime (#1912) — resume / job / article /
  // blog. Generic "Document" badge here (keyed by mediaKind); the finer
  // entity label (Resume / Job / …) is an entity-axis concern surfaced by the
  // document editor, not this media-kind record.
  document:  { exportVerb: "Export PDF",     badgeLabel: "Document",  shortLabel: "T", createVerb: "Create document"     },
};

// ─── "Not ready yet" empty-state copy ────────────────────────────────────────
//
// i18n KEYS (never strings) for the public play surfaces' empty state. One
// full sentence per kind so translations can agree in gender/number instead
// of splicing a noun into an English sentence.

export const MEDIA_KIND_NOT_READY_DEFAULT_KEY = "studio.notReady.default";

export const MEDIA_KIND_NOT_READY_KEYS: Record<MediaKind, string> = {
  video: "studio.notReady.video",
  podcast: "studio.notReady.podcast",
  voice: "studio.notReady.voice",
  animation: "studio.notReady.animation",
  game: "studio.notReady.game",
  comic: "studio.notReady.comic",
  interactive_comic: "studio.notReady.interactive_comic",
  image: "studio.notReady.image",
  cad: "studio.notReady.cad",
  cad_3d: "studio.notReady.cad_3d",
  document: "studio.notReady.document",
};

/** The not-ready sentence key for `kind`; unknown / missing kinds get the
 *  generic "media" fallback. */
export function mediaKindNotReadyKey(kind: string | null | undefined): string {
  return isMediaKind(kind) ? MEDIA_KIND_NOT_READY_KEYS[kind] : MEDIA_KIND_NOT_READY_DEFAULT_KEY;
}
