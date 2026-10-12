/**
 * The kit video's export resolution as a pixel scale — the ONE helper every
 * pixel size goes through, so generated type and the owner's hand edits grow
 * and shrink together.
 *
 * The video is designed at 1080p. Boxes and positions are fractions of the
 * canvas and never scale; pixel sizes do (type, strokes, borders, padding,
 * corners). Hand edits (plan.canvas) are STORED at the 1080p design scale:
 * applying them multiplies by the scale (canvas-overrides), recording an
 * edit made on a scaled canvas divides by it (frame-edits).
 */
import type { ExportResolution } from "@shared/video-plan";
import type { Widget } from "@/lib/studio/editor-v2/canvas-state";

/** Canvas size relative to the 1080p design. */
export const RESOLUTION_SCALE: Record<ExportResolution, number> = { "720p": 2 / 3, "1080p": 1, "4k": 2 };

export function resolutionScale(resolution: ExportResolution | undefined): number {
  return RESOLUTION_SCALE[resolution ?? "1080p"];
}

/** A pixel size at scale `f` (2 decimals, so a round trip is lossless enough). */
export function scalePx(n: number, f: number): number {
  return f === 1 ? n : Math.round(n * f * 100) / 100;
}

/** Container / element chrome: the pixel fields scaled, colours kept. */
export function scaleStyle<S extends { borderWidth?: number; borderRadius?: number; padding?: number }>(style: S, f: number): S {
  if (f === 1) return style;
  const out = { ...style };
  if (typeof style.borderWidth === "number") out.borderWidth = scalePx(style.borderWidth, f);
  if (typeof style.borderRadius === "number") out.borderRadius = scalePx(style.borderRadius, f);
  if (typeof style.padding === "number") out.padding = scalePx(style.padding, f);
  return out;
}

/** The pixel-valued keys of a widget's `params.data` (canvas-state). */
export const PIXEL_DATA_KEYS = ["fontPx", "cardFontPx", "ctaFontPx", "strokeWidth", "cornerRadius"] as const;

/** A widget data object (or a patch of one) with its pixel keys scaled. */
export function scalePixelData<T extends Record<string, unknown>>(data: T, f: number): T {
  if (f === 1) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of PIXEL_DATA_KEYS) {
    const v = data[key];
    if (typeof v === "number") out[key] = scalePx(v, f);
  }
  return out as T;
}

/** A whole widget's pixel sizes scaled (params data + container chrome). */
export function scaleWidgetPixels(widget: Widget, f: number): Widget {
  if (f === 1) return widget;
  const data = scalePixelData(widget.params.data as unknown as Record<string, unknown>, f);
  return {
    ...widget,
    params: { ...widget.params, data } as Widget["params"],
    ...(widget.containerStyle ? { containerStyle: scaleStyle(widget.containerStyle, f) } : {}),
  };
}
