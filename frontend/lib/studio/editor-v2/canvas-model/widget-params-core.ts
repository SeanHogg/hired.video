/**
 * Widget param shapes — core kinds (text / media / shape / data / CTA).
 * Part of the canvas-state model; re-exported by `../canvas-state`.
 */

export interface TextWidgetParams {
  text: string;
  fontPx: number;
  color: string;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
  background: string | null;
}

export interface ImageWidgetParams {
  /** MediaSource id from the Timeline media-source table, OR a remote URL
   *  for newly-dropped uploads that haven't been ingested yet. The save
   *  path resolves either to a stable sourceId before persistence. */
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  fit: "cover" | "contain" | "stretch";
  /** Alternative text for screen readers — WCAG 2.2 SC 1.1.1
   *  (Non-text Content). Read by the StudioAccessibilityPanel audit;
   *  read by the published-page renderer to populate `<img alt>` on
   *  the public viewer. Optional for back-compat with pre-#1556 widgets;
   *  the audit flags any image whose alt is empty / missing. */
  altText?: string;
  /** Per-widget colour-grading filters (#596 / #806). Same `VideoFilters`
   *  shape scenes use, applied to THIS widget only. `null` / undefined =
   *  identity (no grade). The DOM preview folds it into the element's CSS
   *  `filter`; the canvas-v2 image applier bakes the same grade into the
   *  exported frame so preview === render. */
  filters?: import("@/lib/studio/video-filters").VideoFilters | null;
}

export interface VideoWidgetParams {
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  muted: boolean;
  /** Chroma-key (green-screen) parameters. When set, the editor preview
   *  and the render pipeline both knock matching pixels out so the
   *  widget's video composites against whatever sits behind it.
   *  `null` / undefined means no keying. Single source of truth for the
   *  key math lives in `lib/studio/chroma-key.ts` so the editor preview
   *  and the canvas-v2 video applier produce identical pixels. */
  chromaKey?: ChromaKeyParams | null;
  /** Per-widget colour-grading filters (#596 / #806). Same `VideoFilters`
   *  shape scenes use, applied to THIS widget only. `null` / undefined =
   *  identity. Composes with `chromaKey` (key first, then grade). */
  filters?: import("@/lib/studio/video-filters").VideoFilters | null;
}

/** Chroma-key configuration. `keyColor` is the colour to knock out
 *  (RGB hex, e.g. `#00ff00` for a green screen). `threshold` is the
 *  normalized chrominance distance (0..1) under which a pixel becomes
 *  fully transparent. `softness` widens the falloff above `threshold`
 *  for edge feathering — pixels in `(threshold, threshold+softness]`
 *  ramp linearly back to opaque. `spillSuppression` (0..1) desaturates
 *  retained pixels' chroma toward neutral whenever they lean toward
 *  the key colour, reducing the green halo around foreground subjects.
 *  Mirrors the params accepted by the registered `chroma-key` effect
 *  so widget-level data round-trips cleanly into the render pass. */
export interface ChromaKeyParams {
  keyColor: string;
  threshold: number;
  softness: number;
  spillSuppression?: number;
}

export interface ShapeWidgetParams {
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface DividerWidgetParams {
  color: string;
  thickness: number;
}

/** Chart widget — wraps the shared `<ChartRenderer>` so v2 reads
 *  CSV/TSV/JSON data the same way v1's chart elements do. Mirrors
 *  `ChartElement` from `types/video-script`. */
export interface ChartWidgetParams {
  chartType: "bar" | "line" | "pie" | "scatter";
  /** Raw user-supplied data — CSV / TSV / JSON. */
  data: string;
  format?: "csv" | "tsv" | "json";
  title?: string;
  takeaway?: string;
  colors?: string[];
}

/** Webcam widget — interactive renders ask `getUserMedia` for a live
 *  preview; once recorded the URL points at the captured clip. Mirrors
 *  `WebcamElement`. */
export interface WebcamWidgetParams {
  /** Recorded clip URL (blob: in memory, R2 cdn after upload). When
   *  `null`/`undefined` the renderer can request a live stream. */
  recordingUrl?: string | null;
  mirror?: boolean;
  muted?: boolean;
}

/** Chips widget — a row / column of pill-shaped labels. Mirrors v1's
 *  `ChipsElement` so a v1 project's chips survive import without
 *  collapsing into joined text (gap #611). */
export interface ChipsWidgetParams {
  chips: string[];
  fontPx: number;
  fontFamily?: string;
  chipColor: string;
  textColor: string;
  direction: "row" | "column";
}

/** CTA widget — end-card with primary text + a tappable call-to-action
 *  button that opens `ctaUrl` in a new tab. Mirrors v1's per-scene
 *  `ctaText` / `ctaUrl` so v1 "cta" scenes can upgrade losslessly into
 *  a CTA widget on the final scene (gap #616). */
export interface CtaWidgetParams {
  /** Headline shown above the button. */
  headline: string;
  /** Secondary copy shown under the headline. Optional. */
  subheadline?: string;
  /** Button label. */
  ctaText: string;
  /** Destination URL. Opens in a new tab. */
  ctaUrl: string;
  /** Card background colour. */
  bgColor: string;
  /** Headline + subheadline text colour. */
  textColor: string;
  /** Button background colour. */
  accentColor: string;
  /** Button text colour. */
  accentTextColor: string;
  /** Headline font size in px. Subheadline derives from this (~55%).
   *  Optional for backwards compatibility with CTAs authored before
   *  this field existed; `resolveCtaFontSizes` supplies the fallback. */
  cardFontPx?: number;
  /** Button label font size in px. Optional for back-compat — see above. */
  ctaFontPx?: number;
  /** `false` hides the link fallback a downloaded / posted file paints
   *  (readable URL + QR, #2312). Absent or `true` = on; only `false` is
   *  emitted, so existing saves keep their hash. */
  exportFallback?: boolean;
}

/** Resolve the headline / subheadline / button font sizes for a CTA
 *  widget. Single source of truth shared by the DOM preview
 *  (`CanvasStage.CtaBody`) and the canvas-pixel renderer
 *  (`canvas-v2:cta`) so both surfaces honour the same defaults +
 *  subheadline-derivation ratio. */
export function resolveCtaFontSizes(
  cardFontPx: number | undefined,
  ctaFontPx: number | undefined,
): { headline: number; subheadline: number; button: number } {
  const headline = typeof cardFontPx === "number" && cardFontPx > 0 ? cardFontPx : 24;
  const button = typeof ctaFontPx === "number" && ctaFontPx > 0 ? ctaFontPx : 14;
  const subheadline = Math.max(11, Math.round(headline * 0.55));
  return { headline, subheadline, button };
}
