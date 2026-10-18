/**
 * Widget model — the `WidgetKind` union, geometry, the `WidgetParams`
 * discriminated union and the `Widget` record itself. Part of the
 * canvas-state model; re-exported by `../canvas-state`.
 */

import type {
  ChartWidgetParams,
  ChipsWidgetParams,
  CtaWidgetParams,
  DividerWidgetParams,
  ImageWidgetParams,
  ShapeWidgetParams,
  TextWidgetParams,
  VideoWidgetParams,
  WebcamWidgetParams,
} from "./widget-params-core";
import type {
  AvatarWidgetParams,
  BrandKitWidgetParams,
  CaptionBoxWidgetParams,
  EngagementAssetWidgetParams,
  LinkedContentWidgetParams,
  SfxBurstWidgetParams,
  SpeechBubbleWidgetParams,
} from "./widget-params-embed";

export type WidgetKind =
  | "text"
  | "heading"
  | "image"
  | "video"
  | "shape-rect"
  | "shape-circle"
  | "divider"
  | "chart"
  | "webcam"
  | "chips"
  | "cta"
  | "linked-content"
  // Comic-native widgets (mediaKind === "comic"). They're available to
  // every kind in principle (a video can drop a speech bubble on a
  // talking head), but the picker surfaces them only when the active
  // project is a comic so the palette doesn't bloat for the video flow.
  | "speech-bubble"
  | "caption-box"
  | "sfx-burst"
  // AI presenter avatar — viseme-driven 2D talking head painted client-side
  // via the lib/studio/avatar painter. Animated in preview via the active
  // TTS engine's `onBoundary` callback; baked into the exported MP4 at
  // render time from the same painter + the caption-cue timeline. Closes
  // the Synthesia / HeyGen avatar gap (#1557).
  | "avatar"
  // Engagement asset — embeds a per-project authored engagement artifact
  // (in-video lead form, chapter marker, thumbnail stamp, reviewer pin)
  // as a draggable widget on the canvas. Closes the orphan-binding gap
  // (#1579): forms / chapters / thumbnails / reviews authored via the
  // ActionsPanel Engagement section now have a visible canvas presence,
  // not just a server-side row. Like `linked-content`, the kind sub-axis
  // lives in `engagement-assets.ts`'s registry — one row there per new
  // engagement kind.
  | "engagement-asset"
  // Brand kit — paints the selected kit's logo on preview + export
  // (`canvas-v2:brand`). Distinct from the hired.video product
  // watermark (`watermark.ts` / BrandWatermark).
  | "brand-kit";

/** The widget kinds a user (or the AI CHRO via `studio_insert_widget`)
 *  can drop onto a scene from scratch. Co-located with the `WidgetKind`
 *  union so the list can't silently drift from the type. Excludes the
 *  kinds that are only created through a bound picker — `linked-content`
 *  (needs an entity id) and `engagement-asset` (needs an asset id) — and
 *  `webcam`, which is produced by the recorder, not a blank insert.
 *  `WidgetPalette`'s catalog adds presentation (label/icon/group) and
 *  the per-project mediaKind gate on top of this. */
export const INSERTABLE_WIDGET_KINDS: readonly WidgetKind[] = [
  "heading",
  "text",
  "chips",
  "image",
  "video",
  "avatar",
  "shape-rect",
  "shape-circle",
  "divider",
  "cta",
  "chart",
  "speech-bubble",
  "caption-box",
  "sfx-burst",
  "brand-kit",
] as const;

export interface WidgetPosition {
  /** Left edge as a fraction of canvas width (0..1). */
  x: number;
  /** Top edge as a fraction of canvas height (0..1). */
  y: number;
  /** Width as a fraction of canvas width (0..1). */
  width: number;
  /** Height as a fraction of canvas height (0..1). */
  height: number;
  /** Z-index within the scene; higher draws on top. */
  z: number;
  /** Rotation in degrees, clockwise, around the widget's centre. 0 means
   *  axis-aligned. Authoring + render apply the same centre-origin rotation
   *  so the editor preview matches the exported frame. */
  rotation: number;
}

/** One sample on a widget's transform animation (#808 / #3160). `position`
 *  is a partial overlay on the widget's static `position` (the base pose);
 *  listed numeric fields lerp between surrounding samples. `atSec` is
 *  seconds from the scene start. `z` is not interpolated. */
export interface WidgetTransformKeyframe {
  atSec: number;
  position: Partial<WidgetPosition>;
}

export type WidgetParams =
  | { kind: "text" | "heading"; data: TextWidgetParams }
  | { kind: "image"; data: ImageWidgetParams }
  | { kind: "video"; data: VideoWidgetParams }
  | { kind: "shape-rect" | "shape-circle"; data: ShapeWidgetParams }
  | { kind: "divider"; data: DividerWidgetParams }
  | { kind: "chart"; data: ChartWidgetParams }
  | { kind: "webcam"; data: WebcamWidgetParams }
  | { kind: "chips"; data: ChipsWidgetParams }
  | { kind: "cta"; data: CtaWidgetParams }
  | { kind: "linked-content"; data: LinkedContentWidgetParams }
  | { kind: "speech-bubble"; data: SpeechBubbleWidgetParams }
  | { kind: "caption-box"; data: CaptionBoxWidgetParams }
  | { kind: "sfx-burst"; data: SfxBurstWidgetParams }
  | { kind: "avatar"; data: AvatarWidgetParams }
  | { kind: "engagement-asset"; data: EngagementAssetWidgetParams }
  | { kind: "brand-kit"; data: BrandKitWidgetParams };

/**
 * Per-widget container styling — background fill, border colour /
 * width, corner radius, padding. Applies to every widget kind via the
 * CanvasStage outer div so every primitive (text / image / video /
 * shape) can have a uniform container chrome without rewriting each
 * Body component. Mirrors v1's `ElementStyle` so a v1 project's
 * `style: { backgroundColor, borderColor, borderWidth, borderRadius,
 * padding }` round-trips unchanged.
 */
export interface ContainerStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  position: WidgetPosition;
  params: WidgetParams;
  /** When set, the widget only appears within this sub-range of the
   *  scene (in seconds from scene start). `null` means the widget is
   *  visible for the entire scene. */
  visibleFrom: number | null;
  visibleTo: number | null;
  /** Per-widget enter / exit animation. `null` means no motion — the
   *  widget pops in and out at the edges of its visibility window. */
  motion: import("@/lib/studio/editor-v2/widget-motion").WidgetMotion | null;
  /** Optional container chrome (bg / border / radius / padding) applied
   *  uniformly across widget kinds. `undefined` means transparent (the
   *  widget body draws directly with no container). */
  containerStyle?: ContainerStyle;
  /** Optional per-widget visual effect chain (drop shadow, glow, blur,
   *  vignette, etc). Same `{kind, params}` shape v1 uses on
   *  `SceneEffect`, so the editor and the renderer route through the
   *  shared effect registry — no parallel effect schema. */
  effects?: Array<{ kind: string; params: Record<string, unknown> }>;
  /** Optional transform animation over scene time. `position` stays the
   *  base pose; these samples lerp x/y/width/height/rotation. Evaluated
   *  by `evaluateWidgetPositionAt` (preview + export). Persist with the
   *  canvas-state JSON; omitted when the widget does not animate. */
  keyframes?: WidgetTransformKeyframe[];
}
