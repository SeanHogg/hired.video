/**
 * DrawingStage tool model — single source of truth for the MVP tool
 * set + brush settings. Per the canvas-runtime extensibility model
 * (#931 / #932) the runtime owns its own UI state; this file is that
 * runtime's tool vocabulary.
 *
 * MVP tool set (#932 phase 1): brush, eraser, fill, color picker.
 * Selections / shapes / text / vector / mask / filters are tracked as
 * follow-ons in the Consolidated Gap Register; the `DrawingTool` union
 * is here so adding one is one entry.
 */

/** Which tool the brush slot is currently in.
 *
 *  - "hand" — selects the active layer + drags it (translate +
 *    resize + rotate via the floating `<TransformHandles/>` chrome).
 *  - "marquee" — rectangular pixel selection. Delete clears /
 *    Fill paints inside the rect on the active layer.
 *  - "lasso" — free-form polygon selection (pointer drag traces the
 *    perimeter; on pointerup the polygon is closed + rasterized to a
 *    selection mask).
 *  - "magic-wand" — single-click tolerance flood-fill on the
 *    composited canvas; the connected same-color region becomes the
 *    selection mask.
 *  - "quick-select" — brush-style mask grow; each dab samples the
 *    pixel + flood-fills within tolerance into the mask. Multiple
 *    dabs accumulate.
 *
 *  All four selection tools produce the same `MarqueeSelection`
 *  output shape — the floating Delete / Fill action chips consume
 *  the selection regardless of which tool drew it. */
export type DrawingTool =
  | "brush"
  | "eraser"
  | "fill"
  | "eyedropper"
  | "hand"
  | "marquee"
  | "lasso"
  | "magic-wand"
  | "quick-select";

/** Brush stroke settings — shared by brush + eraser (eraser ignores
 *  color but honours size + opacity). The "soft brush" curve is the
 *  Photoshop default — alpha falls off radially from the centre. */
export interface BrushSettings {
  /** Stroke diameter in CANVAS pixels (pre-zoom). 1..200. */
  size: number;
  /** 0..1. Per-stroke flow; the layer's own opacity applies on top. */
  opacity: number;
  /** 0..1. Edge softness — 0 = hard circle, 1 = full falloff. */
  hardness: number;
  /** Fill color in #rrggbb. Eraser ignores this. */
  color: string;
}

/** Default brush starting state — chosen to feel like the Photoshop
 *  default "soft round 30" brush. */
export const DEFAULT_BRUSH: BrushSettings = {
  size: 24,
  opacity: 1,
  hardness: 0.6,
  color: "#111827",
};

/** Recent-colors swatch row — capped to keep the picker compact. */
export const MAX_RECENT_COLORS = 8;

/** A point captured from a pointer move event in CANVAS coordinates
 *  (pre-zoom). The brush engine interpolates between successive points
 *  so a fast drag still produces a continuous line. */
export interface CanvasPoint {
  x: number;
  y: number;
  /** 0..1 — pressure sensitivity from the PointerEvent. Falls back to
   *  0.5 when the input device doesn't report pressure. */
  pressure: number;
}
