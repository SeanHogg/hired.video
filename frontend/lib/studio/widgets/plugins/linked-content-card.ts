/**
 * The linked-content card the export paints in place of the entity's live
 * React renderer (which the DOM mounts — see the `embed` op): kind label,
 * wrapped title + subtitle, body lines, badge chips and the CTA pill at the
 * bottom right. Entity text comes from the export's preloaded summary.
 */
import type { LinkedContentWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import {
  DEFAULT_LINKED_CONTENT_COLORS,
  getLinkedContentMeta,
  resolveLinkedContentCtaTypography,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";
import type { Box } from "../frame";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, wrapLines, type TextStyle } from "../text-layout";

export function linkedContentCardOps(
  data: LinkedContentWidgetParams,
  summary: LinkedContentSummary | null,
  content: Box,
  env: DrawEnv,
): DrawOp[] {
  const { x, y, w, h } = content;
  const c = linkedContentColors(data);
  const meta = getLinkedContentMeta(data.entityKind);
  const family = env.render.fontFamily;
  const min = Math.min(w, h);
  const pad = Math.round(min * 0.07);
  const innerW = Math.max(0, w - pad * 2);
  const ops: DrawOp[] = [{ op: "rect", box: content, radius: Math.min(24, min * 0.08), fill: c.bgColor }];

  /** Wrapped lines from `top`; returns the y below the block. */
  const block = (text: string, style: TextStyle, lineH: number, color: string, top: number, maxY = Infinity): number => {
    let cursor = top;
    for (const line of wrapLines(text, innerW, env.measure(fontShorthand(style)))) {
      if (cursor + lineH > maxY) break;
      ops.push({ op: "text", text: line, x: x + pad, y: cursor + lineH / 2, font: style, color, align: "left" });
      cursor += lineH;
    }
    return cursor;
  };

  const kindPx = Math.max(11, Math.round(min * 0.05));
  let cursor = block(meta.label.toUpperCase(), { fontPx: kindPx, fontWeight: 600, fontFamily: family }, kindPx * 1.2, c.mutedColor, y + pad);
  cursor += Math.round(kindPx * 0.2);

  const titlePx = Math.max(18, Math.round(min * 0.11));
  const kindName = meta.label.toLowerCase();
  const title =
    summary?.title ??
    env.t(data.entityId ? "studio.widgetBody.linkedLoading" : "studio.widgetBody.linkedEmpty", { kind: kindName });
  cursor = block(title, { fontPx: titlePx, fontWeight: "bold", fontFamily: family }, titlePx * 1.2, c.textColor, cursor);

  const subPx = Math.max(13, Math.round(titlePx * 0.55));
  cursor += Math.round(subPx * 0.3);
  if (summary?.subtitle) {
    cursor = block(summary.subtitle, { fontPx: subPx, fontWeight: "normal", fontFamily: family }, subPx * 1.3, c.mutedColor, cursor);
    cursor += Math.round(subPx * 0.4);
  }

  // CTA pill (bottom right) first, so body lines and chips stop above it.
  const cta = resolveLinkedContentCtaTypography(data.entityKind, data);
  const ctaPx = cta.fontPx ?? Math.max(12, Math.round(min * 0.06));
  const ctaStyle: TextStyle = { fontPx: ctaPx, fontWeight: cta.fontWeight, fontFamily: cta.fontFamily };
  const ctaH = ctaPx + Math.round(ctaPx * 1.1);
  const ctaW = env.measure(fontShorthand(ctaStyle))(cta.label) + ctaPx * 2;
  const ctaBox: Box = { x: x + w - pad - ctaW, y: y + h - pad - ctaH, w: ctaW, h: ctaH };

  const bodyPx = Math.max(12, Math.round(titlePx * 0.46));
  const bodyLineH = bodyPx * 1.35;
  for (const line of summary?.body ?? []) {
    cursor = block(line, { fontPx: bodyPx, fontWeight: "normal", fontFamily: family }, bodyLineH, c.textColor, cursor, ctaBox.y - pad * 0.8);
  }

  if (summary?.badges?.length) {
    const chipPx = Math.max(11, Math.round(bodyPx * 0.85));
    const chipFont: TextStyle = { fontPx: chipPx, fontWeight: 600, fontFamily: family };
    const measure = env.measure(fontShorthand(chipFont));
    const padX = Math.round(chipPx * 0.6);
    const gap = Math.round(chipPx * 0.4);
    const chipH = chipPx + Math.round(chipPx * 0.3) * 2;
    const chipY = Math.max(cursor + bodyLineH * 0.5, ctaBox.y - pad * 0.4 - chipH);
    let chipX = x + pad;
    for (const badge of summary.badges) {
      const chipW = measure(badge) + padX * 2;
      if (chipX + chipW > ctaBox.x - gap) break;
      ops.push({ op: "rect", box: { x: chipX, y: chipY, w: chipW, h: chipH }, radius: chipH / 2, fill: c.mutedColor, alpha: 0.18 });
      ops.push({ op: "text", text: badge, x: chipX + padX, y: chipY + chipH / 2, font: chipFont, color: c.textColor, align: "left" });
      chipX += chipW + gap;
    }
  }

  ops.push({ op: "rect", box: ctaBox, radius: ctaH / 2, fill: c.accentColor });
  ops.push({
    op: "text",
    text: cta.label,
    x: ctaBox.x + ctaW / 2,
    y: ctaBox.y + ctaH / 2,
    font: ctaStyle,
    color: c.accentTextColor,
    align: "center",
  });
  return ops;
}

/** The card's resolved colours (theme stamp over the defaults). */
export function linkedContentColors(data: LinkedContentWidgetParams): typeof DEFAULT_LINKED_CONTENT_COLORS {
  return { ...DEFAULT_LINKED_CONTENT_COLORS, ...definedColors(data) };
}

function definedColors(data: LinkedContentWidgetParams): Partial<typeof DEFAULT_LINKED_CONTENT_COLORS> {
  const out: Partial<typeof DEFAULT_LINKED_CONTENT_COLORS> = {};
  if (data.bgColor) out.bgColor = data.bgColor;
  if (data.textColor) out.textColor = data.textColor;
  if (data.mutedColor) out.mutedColor = data.mutedColor;
  if (data.accentColor) out.accentColor = data.accentColor;
  if (data.accentTextColor) out.accentTextColor = data.accentTextColor;
  return out;
}
