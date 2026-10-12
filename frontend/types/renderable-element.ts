/**
 * RenderableElement + InteractiveCanvas — the host-agnostic element
 * model. Originally lived only inside `VideoScript.scenes[].sceneElements`;
 * now embeds anywhere a record wants an interactive overlay (resume
 * sub-records like Employment / Volunteer / Project, company "About"
 * sections, profile sections, job postings, and so on).
 *
 * The element union is re-exported from `types/video-script.ts` so the
 * single source of truth stays where the studio compiler lives — adding
 * a new kind there propagates to every host automatically.
 *
 * `SceneElement` (the legacy name) is kept as an alias so existing
 * studio imports continue to work; new host integrations should reach
 * for `RenderableElement` to make their intent clear.
 */

import type {
  AudioElement,
  ChartElement,
  ChartType,
  ChipsElement,
  ElementBox,
  ElementStyle,
  ImageElement,
  SceneElement,
  TextElement,
  VideoElement,
  WebcamElement,
} from "./video-script";

// ─── Element union ──────────────────────────────────────────────────────────

/** Neutral name for the element union — same shape as `SceneElement`,
 *  imported here so non-studio hosts (resume / company / profile / job)
 *  read intent without dragging "scene" into their domain language. */
export type RenderableElement = SceneElement;

// Re-export the per-kind interfaces + supporting types so non-studio
// hosts have a single import surface for everything they need.
export type {
  AudioElement,
  ChartElement,
  ChartType,
  ChipsElement,
  ElementBox,
  ElementStyle,
  ImageElement,
  SceneElement,
  TextElement,
  VideoElement,
  WebcamElement,
};

/** Discriminated kind values — handy for switches that want exhaustive
 *  checking without repeating the string literals. */
export type RenderableElementKind = RenderableElement["kind"];

// ─── Container ──────────────────────────────────────────────────────────────

/**
 * InteractiveCanvas — a positioned set of `RenderableElement`s with an
 * optional background and aspect ratio. Hosts attach this to records
 * they want to make interactive: a resume Employment entry, a
 * company "About" section, a job posting hero, etc.
 *
 * The video pipeline composes many of these in sequence (one per
 * `SceneScript`); host pages render one per record. Same data shape,
 * same element kinds, same renderer.
 */
export interface InteractiveCanvas {
  /** Schema version for future migrations. Current = 1. */
  version?: 1;
  /** Z-ordered list of elements. Higher `z` (per element) draws on top. */
  elements: RenderableElement[];
  /** Background fill — solid colour, gradient string, or image URL.
   *  Hosts that don't care can leave undefined; the renderer falls
   *  through to its parent's background. */
  background?: string;
  /** Aspect ratio as `"W:H"` ("16:9", "9:16", "1:1", "4:3"). When
   *  omitted the renderer fits the parent's intrinsic ratio. */
  aspect?: string;
  /** Optional per-canvas accent colour. Element renderers can pull
   *  from this for default fills / strokes. */
  accentColor?: string;
}

/** Empty canvas factory — used by host editors when seeding a new
 *  interactive overlay so the renderer never sees a malformed object. */
export function makeEmptyCanvas(): InteractiveCanvas {
  return { version: 1, elements: [] };
}

/** Type guard for "is this record's `interactive` field a usable canvas?"
 *  Centralised so every host viewer answers the question identically. */
export function isInteractiveCanvas(value: unknown): value is InteractiveCanvas {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as InteractiveCanvas).elements)
  );
}
