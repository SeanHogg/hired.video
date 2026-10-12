/**
 * Helpers several widget plugins share (#2312): text blocks as draw ops,
 * and the tolerant readers each `parse` uses on saved clip params.
 */
import type { Box } from "../frame";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, layoutTextBlock, type TextBlockLayout, type TextStyle } from "../text-layout";

export type TextAlign = "left" | "center" | "right";

/** x of a line's anchor for `align` (canvas `textAlign` semantics). */
export function alignAnchorX(area: Box, align: TextAlign): number {
  if (align === "center") return area.x + area.w / 2;
  if (align === "right") return area.x + area.w;
  return area.x;
}

/** Lay out `text` in `area` (vertically centred) with the env's metrics. */
export function layoutText(text: string, style: TextStyle, area: Box, env: DrawEnv, lineHeight?: number): TextBlockLayout {
  return layoutTextBlock(text, style, area, env.measure(fontShorthand(style)), lineHeight);
}

/** One text op per laid-out line. */
export function textLineOps(
  layout: TextBlockLayout,
  style: TextStyle,
  color: string,
  align: TextAlign,
  alpha?: number,
): DrawOp[] {
  const x = alignAnchorX(layout.area, align);
  return layout.lines.map((text, i) => ({
    op: "text" as const,
    text,
    x,
    y: layout.top + (i + 0.5) * layout.lineHeightPx,
    font: style,
    color,
    align,
    ...(alpha !== undefined && alpha < 1 ? { alpha } : {}),
  }));
}

/** Lay out and emit a centred text block in one step. */
export function textBlockOps(
  text: string,
  style: TextStyle,
  area: Box,
  env: DrawEnv,
  color: string,
  align: TextAlign,
  lineHeight?: number,
): DrawOp[] {
  return textLineOps(layoutText(text, style, area, env, lineHeight), style, color, align);
}

/** Text squeezed onto one line with an ellipsis when it overflows. */
export function fitOneLine(text: string, maxW: number, measure: (s: string) => number): string {
  if (measure(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string") : [];
}

/** A non-empty string, else undefined (optional saved fields). */
export function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export function optionalNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function oneOf<T extends string>(v: unknown, options: ReadonlyArray<T>, fallback: T): T {
  return typeof v === "string" && (options as ReadonlyArray<string>).includes(v) ? (v as T) : fallback;
}

/** Spread helper: `{ key: value }` only when value is defined. */
export function when<K extends string, V>(key: K, value: V | undefined | null): Partial<Record<K, V>> {
  return value === undefined || value === null ? {} : ({ [key]: value } as Record<K, V>);
}
