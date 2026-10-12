/**
 * Shared text layout for widget plugins (#2312). Line breaks are computed
 * ONCE from canvas text metrics and both renderers draw those exact lines:
 * the export painter with `fillText`, the DOM body as one absolutely
 * positioned row per line. Browser CSS wrapping never decides a break, so
 * the preview and the MP4 wrap identically.
 *
 * Rules (match the authoring expectations of `pre-wrap` + `break-word`):
 * explicit newlines start a new line, words wrap greedily, a word wider
 * than the line breaks by character, blank lines are kept.
 */
import type { Box } from "./frame";

export type Measure = (text: string) => number;

export interface TextStyle {
  fontPx: number;
  /** "normal" / "bold" or a numeric CSS weight (100–900). */
  fontWeight: "normal" | "bold" | number;
  fontFamily: string;
  italic?: boolean;
}

/** CSS the DOM's SVG text pins so nothing inherited from the page (a
 *  `tracking-*` utility, a heading rule, the UA's kerning choice) moves
 *  glyphs away from where the export's canvas draws them. paint-ops sets
 *  the canvas equivalents. */
export const TEXT_RESET_STYLE = {
  letterSpacing: 0,
  wordSpacing: 0,
  fontKerning: "normal",
  fontFeatureSettings: "normal",
  fontVariationSettings: "normal",
} as const;

/** Line height as a multiple of the font size, shared by both renderers. */
export const TEXT_LINE_HEIGHT = 1.1;

/** CSS / canvas `font` shorthand for a style. */
export function fontShorthand(style: TextStyle): string {
  const weight = style.fontWeight === "bold" ? 700 : style.fontWeight === "normal" ? 400 : style.fontWeight;
  return `${style.italic ? "italic " : ""}${weight} ${style.fontPx}px ${style.fontFamily}`;
}

function breakWord(word: string, maxWidth: number, measure: Measure): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current && measure(current + ch) > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapLines(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
      } else {
        const pieces = breakWord(word, maxWidth, measure);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1] ?? "";
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface TextBlockLayout {
  /** Area the lines are laid out in (content box minus any padding). */
  area: Box;
  lines: string[];
  lineHeightPx: number;
  /** Top of the first line — the block is vertically centred in `area`. */
  top: number;
}

/** Lay out a text block inside `area`, vertically centred. */
export function layoutTextBlock(
  text: string,
  style: TextStyle,
  area: Box,
  measure: Measure,
  lineHeight: number = TEXT_LINE_HEIGHT,
): TextBlockLayout {
  const lines = wrapLines(text, area.w, measure);
  const lineHeightPx = style.fontPx * lineHeight;
  return { area, lines, lineHeightPx, top: area.y + (area.h - lines.length * lineHeightPx) / 2 };
}

let measureCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined;

function sharedMeasureCtx(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1).getContext("2d")
        : typeof document !== "undefined"
          ? document.createElement("canvas").getContext("2d")
          : null;
  }
  return measureCtx;
}

/** A measurer for `font` using a shared offscreen context, or null where
 *  no 2D canvas exists (SSR / tests without canvas). */
export function measurerFor(font: string): Measure | null {
  const ctx = sharedMeasureCtx();
  if (!ctx) return null;
  return (s) => {
    ctx.font = font;
    return ctx.measureText(s).width;
  };
}

/** Share of the font size the alphabetic baseline sits below a line's
 *  vertical middle when no 2D canvas can report font metrics. */
const FALLBACK_BASELINE_SHARE = 0.35;

/**
 * How far below a text op's `y` (the line's vertical middle) its alphabetic
 * baseline sits, in px. BOTH renderers draw on the alphabetic baseline at
 * `y + textBaselineOffset(font)`: SVG `dominant-baseline: central` and
 * canvas `textBaseline: "middle"` resolve the middle from different font
 * metrics, which shifted every line by a pixel or two between the DOM stage
 * and the export (#2312). One number from one context keeps glyphs on the
 * same row. Not cached: a web font that finishes loading changes it.
 */
export function textBaselineOffset(font: TextStyle): number {
  const fallback = font.fontPx * FALLBACK_BASELINE_SHARE;
  const ctx = sharedMeasureCtx();
  if (!ctx) return fallback;
  ctx.font = fontShorthand(font);
  const m = ctx.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return fallback;
  return (ascent - descent) / 2;
}
