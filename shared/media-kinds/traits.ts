import { isMediaKind, type MediaKind } from "./kinds.js";

// ─── Per-kind behaviour traits ───────────────────────────────────────────────
//
// Boolean flags the editor / save / export / preview surfaces branch on.
// Callers ask a semantic question (`mediaKindIsDocument(kind)`) instead of
// comparing against a literal (`kind === "document"`), so adding a kind — or
// moving one between runtimes — is an edit to THIS record only.

export interface MediaKindTraits {
  /** The default "video" kind — video-only flows (render-on-load, the
   *  "Post video" label, the video templates shelf, the hidden badge). */
  primaryVideo: boolean;
  /** Paged WYSIWYG document (#1912): DocumentStage, entity binding, PDF. */
  document: boolean;
  /** Single still raster canvas (DrawingStage): saved to the image library. */
  stillImage: boolean;
  /** Public pages show it inside a framed (non-16:9-video) preview. */
  framedPreview: boolean;
  /** Comic page authoring (pages = scenes, panels = widgets). */
  comic: boolean;
  /** Frame-by-frame raster animation (#1003): AnimationStage + its encoders. */
  frameAnimation: boolean;
  /** HTML5 game runtime (GameStage): needs a seeded GameState to export. */
  gameRuntime: boolean;
}

const NO_TRAITS: MediaKindTraits = {
  primaryVideo: false,
  document: false,
  stillImage: false,
  framedPreview: false,
  comic: false,
  frameAnimation: false,
  gameRuntime: false,
};

export const MEDIA_KIND_TRAITS: Record<MediaKind, MediaKindTraits> = {
  video: { ...NO_TRAITS, primaryVideo: true },
  podcast: NO_TRAITS,
  voice: NO_TRAITS,
  animation: { ...NO_TRAITS, framedPreview: true, frameAnimation: true },
  game: { ...NO_TRAITS, gameRuntime: true },
  comic: { ...NO_TRAITS, comic: true },
  interactive_comic: NO_TRAITS,
  image: { ...NO_TRAITS, stillImage: true, framedPreview: true },
  cad: { ...NO_TRAITS, framedPreview: true },
  cad_3d: NO_TRAITS,
  document: { ...NO_TRAITS, document: true },
};

/** Traits for a (possibly unknown / missing) kind; unknown → all false. */
export function mediaKindTraits(kind: string | null | undefined): MediaKindTraits {
  return isMediaKind(kind) ? MEDIA_KIND_TRAITS[kind] : NO_TRAITS;
}

export const mediaKindIsPrimaryVideo = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).primaryVideo;
export const mediaKindIsDocument = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).document;
export const mediaKindIsStillImage = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).stillImage;
export const mediaKindHasFramedPreview = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).framedPreview;
export const mediaKindIsComic = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).comic;
export const mediaKindIsFrameAnimation = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).frameAnimation;
export const mediaKindIsGame = (kind: string | null | undefined): boolean =>
  mediaKindTraits(kind).gameRuntime;
