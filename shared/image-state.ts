/**
 * Image state spec — the canonical JSON shape for `mediaKind: "image"`
 * studio projects (Photoshop-shaped raster authoring, #932).
 *
 * Parallel to `shared/timeline.ts` (Timeline runtime), `shared/game-state.ts`
 * (Game runtime), and the staged comic-state shape — each canvas runtime
 * owns its own state model per PRD §1.2 canvas-runtime extensibility.
 *
 * SCENE SHAPE — image is SINGLE-SCENE. There is no time dimension and
 * no state graph; the workspace IS the scene. The shared editor shell's
 * scene rail collapses for image projects (the runtime decides whether
 * to render it). All authoring lives on one canvas surface with N
 * layers stacked back-to-front.
 *
 * STATE MODEL — layers + dimensions + history. Each layer carries its
 * raster pixels as a base64 PNG dataURL (`pixelsDataUrl`) so the
 * project round-trips cleanly through JSONB without an out-of-band
 * blob store. Vector layers, adjustment layers, layer masks, and
 * blend-modes-beyond-normal are tracked as separate roadmap items
 * (see Consolidated Gap Register #932 follow-ons).
 *
 * Versioning: `schemaVersion` is bumped on any breaking change.
 * Don't delete or rename existing fields — add new ones with defaults
 * and migrate readers. The first version covers the MVP toolset
 * (brush / eraser / fill / layers / color picker / undo-redo + AI
 * prompt generation); follow-on tools layer onto the same shape.
 *
 * Persistence: `studio_projects.image_state` jsonb column (migration
 * 0102). The editor's `<CanvasRouter mediaKind/>` mounts
 * `<DrawingStage>` when the project is image-kind and the stage
 * reads / writes this shape via the standard save-draft endpoint.
 */

export const IMAGE_STATE_SCHEMA_VERSION = 1;

/** Blend mode applied when compositing a layer onto the layers below.
 *  The MVP only ships `normal`; the others are reserved so a future
 *  blend-mode picker can flip the field without a state-shape change. */
export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "exclusion";

/** What kind of content a layer carries. The MVP shipped `raster`;
 *  `vector` + `text` landed in #940 Phase 2 (basic shape + text authoring,
 *  full control-point editing for vector deferred to a follow-on);
 *  `adjustment` layers remain reserved. */
export type LayerKind = "raster" | "vector" | "text" | "adjustment";

/** Vector shape primitive carried by `kind: "vector"` layers. Each
 *  shape is positioned in CANVAS-LOCAL coordinates (top-left origin,
 *  same frame as raster `pixelsDataUrl`). All shapes are renderable
 *  through a single `path2d` walk so the compositor branch is small. */
export type VectorShape =
  | { id: string; kind: "rect"; x: number; y: number; width: number; height: number; fill?: string; stroke?: string; strokeWidth?: number; cornerRadius?: number }
  | { id: string; kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; strokeWidth?: number }
  | { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth?: number }
  | { id: string; kind: "path"; d: string; fill?: string; stroke?: string; strokeWidth?: number };

/** Text content carried by `kind: "text"` layers. The MVP renders the
 *  text on a single line via canvas `fillText`; multi-line + rich text
 *  editing land in a follow-on. */
export interface TextLayerContent {
  text: string;
  fontFamily: string;
  /** Pixel size — matches Canvas-2D `ctx.font` convention. */
  fontSize: number;
  /** CSS colour. */
  color: string;
  /** Top-left anchor of the text baseline rect, in canvas pixels. */
  x: number;
  y: number;
  /** Bold / italic style hints — applied to the canvas `font` string. */
  bold?: boolean;
  italic?: boolean;
}

export interface ImageLayer {
  /** Stable id — referenced by the editor's selection state. */
  id: string;
  /** User-visible label in the layers panel. */
  label: string;
  /** Which content shape this layer holds. MVP raster only. */
  kind: LayerKind;
  /** 0..1. The layers panel surfaces this as a 0–100% slider. */
  opacity: number;
  /** When false the layer is skipped during compositing AND export. */
  visible: boolean;
  /** When true the layer is read-only (no brush strokes, no fill, no
   *  move). Lets the user pin a reference image while painting above. */
  locked: boolean;
  /** Compositing blend mode. Defaults to `normal` — the MVP UI doesn't
   *  expose other modes yet, but the field is here so a future picker
   *  can flip it without migrating state. */
  blendMode: LayerBlendMode;
  /** Raster pixels as a base64 PNG dataURL. Null for empty layers
   *  (a freshly inserted layer with no strokes yet). The dataURL is
   *  sized to the canvas dimensions (no off-canvas pixels), keeping
   *  exports straightforward and the JSONB rows bounded.
   *
   *  Trade-off: dataURL inflation (~33% over the raw bytes) is the
   *  cost of round-tripping through JSONB; the cap on canvas
   *  dimensions (see ImageState.width/height) plus PNG compression
   *  keep the payload modest for the MVP. When the layer's flattened
   *  PNG would exceed `LAYER_DATAURL_SPILL_BYTES` the host uploads
   *  the pixels to R2 and stores the key in `pixelsR2Key` instead
   *  (#940 brush dataURL bloat mitigation). */
  pixelsDataUrl: string | null;
  /** R2 object key for spilled layer pixels (#940 brush dataURL bloat
   *  mitigation). When set, the editor fetches the PNG from R2 instead
   *  of decoding `pixelsDataUrl`. Mutually exclusive with
   *  `pixelsDataUrl` carrying real data — the spill helper clears
   *  the dataURL when promoting to R2. */
  pixelsR2Key?: string;
  /** Translation offset applied to the layer's pixels when
   *  compositing — set by the Hand / Move tool's drag. Pixels still
   *  live in their natural top-left frame on the dataURL; the offset
   *  shifts them visually + on export. Omitted = `{ x: 0, y: 0 }`. */
  transformOffset?: { x: number; y: number };
  /** Per-layer scale factor applied at composite time. `{ x: 1, y: 1 }`
   *  or omitted = no scaling. Set by the Hand / Move tool's
   *  resize-handle drag (`<TransformHandles/>` primitive). */
  transformScale?: { x: number; y: number };
  /** Per-layer rotation in DEGREES applied at composite time around
   *  the layer's canvas centre (matches V2 Video's widget pivot
   *  semantics). 0 or omitted = no rotation. Set by the Hand /
   *  Move tool's rotation-handle drag. */
  transformRotation?: number;
  /** Vector shapes for `kind: "vector"` layers. Null/empty for non-vector
   *  layers. Rendered onto the layer's offscreen canvas via
   *  `hydrateVectorLayer` (#940 Image Phase 2). */
  vectorShapes?: VectorShape[];
  /** Text content for `kind: "text"` layers. Null for non-text layers
   *  (#940 Image Phase 2). */
  textContent?: TextLayerContent;
  /** Per-layer non-destructive filter chain (#940 Image Phase 2).
   *  The compositor applies these as a Canvas-2D `ctx.filter` string
   *  while drawing the layer's pixels onto the destination. Pure
   *  edits — the layer's `pixelsDataUrl` is untouched; toggling the
   *  filter on / off, or changing values, doesn't destroy data.
   *
   *  Each field maps 1:1 to a CSS / Canvas2D filter primitive:
   *   - `blur`        — pixels (`blur(Npx)`). Default 0.
   *   - `brightness`  — 0..2 (`brightness(N)`). Default 1 (= unity).
   *   - `contrast`    — 0..2. Default 1.
   *   - `saturate`    — 0..2. Default 1.
   *   - `hueRotate`   — degrees, 0..360.
   *   - `grayscale`   — 0..1.
   *   - `invert`      — 0..1.
   *
   *  Stacking order: filter is applied INSIDE the blend-mode +
   *  opacity pass, so a layer with blend "multiply" + opacity 0.7 +
   *  filter `{ blur: 8 }` renders the blurred pixels through the
   *  multiply blend at 70% alpha. Matches Photoshop's "Smart Filter"
   *  ordering. */
  filters?: LayerFilters;
}

/** Per-layer filter parameters. All optional; absent fields default
 *  to identity (no effect). Reads / writes through the layers panel's
 *  Filters section (#940 Image Phase 2). */
export interface LayerFilters {
  /** Gaussian blur radius in pixels. Default 0. */
  blur?: number;
  /** Brightness multiplier — 1 = unity, 0 = full black, 2 = double
   *  brightness. Default 1. */
  brightness?: number;
  /** Contrast multiplier — 1 = unity, 0 = solid grey, 2 = doubled.
   *  Default 1. */
  contrast?: number;
  /** Saturation multiplier — 1 = unity, 0 = full grayscale, 2 =
   *  oversaturated. Default 1. */
  saturate?: number;
  /** Hue rotation in degrees, 0..360. Default 0. */
  hueRotate?: number;
  /** Grayscale conversion — 0..1 (0 = colour, 1 = full grayscale).
   *  Default 0. */
  grayscale?: number;
  /** Colour inversion — 0..1 (0 = normal, 1 = full inverse).
   *  Default 0. */
  invert?: number;
}

/** Background fill behind layer 0. `transparent` leaves the canvas
 *  alpha=0 (PNG/WebP export preserves transparency; JPEG flattens to
 *  white). `color` paints a solid fill. */
export type CanvasBackground =
  | { kind: "transparent" }
  | { kind: "color"; color: string };

export interface ImageState {
  schemaVersion: number;
  /** Canvas width in pixels. Capped at 4096 by the editor — keeps
   *  per-layer dataURLs bounded. */
  width: number;
  /** Canvas height in pixels. Capped at 4096 by the editor. */
  height: number;
  /** Background fill behind layer 0. */
  background: CanvasBackground;
  /** Layers in z-order — index 0 is the BOTTOM-most layer (drawn first),
   *  the last layer is the TOP (drawn last). The layers panel reverses
   *  this for display (top of the list = top of the stack) to match
   *  Photoshop convention. */
  layers: ImageLayer[];
  /** Which layer the brush / eraser / fill currently writes to. Must
   *  match a `layers[].id`. The editor enforces "there is always an
   *  active layer" — the constraint lives client-side. */
  activeLayerId: string;
  /** AI-prompt history — every successful "Generate" or "Refine" call
   *  appends one entry. Surfaced in the prompt panel as a previous-prompt
   *  picker so the user can iterate without retyping. Capped at 50
   *  entries client-side; older entries fall off in FIFO order. */
  aiPromptHistory: AiPromptHistoryEntry[];
  /** Current selection rect in canvas-local pixels (#940 Phase 2
   *  selection tools). Brush / fill / clear / inpaint operations gate
   *  on this rect when present — pixels outside are untouched.
   *  Cleared when the user clicks "Deselect" or starts a non-selection
   *  tool. */
  selection?: { x: number; y: number; width: number; height: number };
}

/** Threshold above which a layer's flattened PNG should spill to R2
 *  instead of being inlined as a base64 dataURL in the JSONB row.
 *  1MB of compressed PNG ≈ 1.33MB dataURL; over this the row bloats
 *  noticeably + autosaves get sluggish. */
export const LAYER_DATAURL_SPILL_BYTES = 1024 * 1024;

export interface AiPromptHistoryEntry {
  /** Stable id so the panel can key the list without index churn. */
  id: string;
  /** The prompt text the user submitted. */
  prompt: string;
  /** ISO timestamp the prompt was issued. */
  at: string;
  /** Which engine handled the request (`webgpu-sd-turbo` /
   *  `server-cf-sdxl-lightning` / etc.). Surfaced so the user can see
   *  which path their last call took, and so the support team can
   *  diagnose engine-specific output quality issues. */
  engineId: string;
  /** R2 / object-store URL of the generated image. Optional — the
   *  client-side WebGPU engine returns a Blob URL the user can choose
   *  to keep ephemeral rather than persist. */
  resultUrl?: string;
}

// ─── Factory + helpers (single source — every caller routes through here) ──

/** Default canvas dimensions for a freshly created image project. 1024²
 *  matches the standard social-media post + the AI generation default,
 *  and keeps round-trip payloads small while still being usable for
 *  most poster / cover / icon work. */
export const DEFAULT_IMAGE_WIDTH = 1024;
export const DEFAULT_IMAGE_HEIGHT = 1024;

/** Build a blank image state with one empty raster layer. Used by the
 *  StudioEditorV2 hydration path when a fresh `mediaKind: 'image'`
 *  project loads with `image_state IS NULL`. */
export function createBlankImageState(
  width: number = DEFAULT_IMAGE_WIDTH,
  height: number = DEFAULT_IMAGE_HEIGHT,
  background: CanvasBackground = { kind: "color", color: "#ffffff" },
): ImageState {
  const layerId = `layer-${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: IMAGE_STATE_SCHEMA_VERSION,
    width,
    height,
    background,
    layers: [
      {
        id: layerId,
        label: "Background",
        kind: "raster",
        opacity: 1,
        visible: true,
        locked: false,
        blendMode: "normal",
        pixelsDataUrl: null,
      },
    ],
    activeLayerId: layerId,
    aiPromptHistory: [],
  };
}

/** Resolve a layer by id. Returns null when the id doesn't match — the
 *  editor falls back to the top layer in that case. */
export function findLayer(state: ImageState, layerId: string): ImageLayer | null {
  return state.layers.find((l) => l.id === layerId) ?? null;
}

/** Build a fresh vector layer (#940 Phase 2). Empty by default; callers
 *  add shapes via the layers panel's "Add shape" affordance. */
export function makeVectorLayer(label: string = "Vector layer"): ImageLayer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 10)}`,
    label,
    kind: "vector",
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: "normal",
    pixelsDataUrl: null,
    vectorShapes: [],
  };
}

/** Build a fresh text layer (#940 Phase 2). Seeds with a sample
 *  string + sensible defaults so the layer renders something the user
 *  can see immediately. */
export function makeTextLayer(
  label: string = "Text layer",
  text: string = "Text",
): ImageLayer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 10)}`,
    label,
    kind: "text",
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: "normal",
    pixelsDataUrl: null,
    textContent: {
      text,
      fontFamily: "Inter",
      fontSize: 48,
      color: "#000000",
      x: 48,
      y: 96,
    },
  };
}

/** Return the first layer (bottom-up) that has any pixel content —
 *  the cheapest "show me something" preview for thumbnail surfaces
 *  (`<VideoProjectThumbnail>` for image projects, `<ProjectPlayer>`'s
 *  image branch, future entity-card grids). Returns null when no
 *  layer has been drawn on yet so callers can fall through to a
 *  kind-palette placeholder.
 *
 *  Per the DRY rule the layer-lookup lives ONCE here — every preview
 *  surface reads from this function instead of hand-rolling
 *  `state.layers.find((l) => l.pixelsDataUrl != null)` inline. */
export function firstLayerPixels(
  state: ImageState | null | undefined,
): string | null {
  if (!state) return null;
  for (const layer of state.layers) {
    if (layer.pixelsDataUrl != null) return layer.pixelsDataUrl;
  }
  return null;
}

