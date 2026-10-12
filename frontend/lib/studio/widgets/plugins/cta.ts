/**
 * CTA end-card plugin — a rounded card with a wrapped headline, an optional
 * subheadline (80% opacity) and a pill button, stacked and centred. Font
 * sizes come from the shared `resolveCtaFontSizes` policy. For the export
 * target the card also carries its link fallback (cta-export-fallback.ts):
 * the readable URL under the button and, room permitting, a QR column.
 */
import { resolveCtaFontSizes, type CtaWidgetParams, type WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { stringOr, type Box } from "../frame";
import { registerPlugin } from "../plugin";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, type TextBlockLayout, type TextStyle } from "../text-layout";
import { ctaExportFallback, ctaLinkInteractions, ctaQrPayloads } from "./cta-export-fallback";
import { fitOneLine, layoutText, optionalNumber, optionalString, textLineOps, when } from "./shared";

type CtaParams = Extract<WidgetParams, { data: CtaWidgetParams }>;

const CTA_LINE_HEIGHT = 1.2;
/** The export's link line: a step below the subheadline, 80% opacity. */
const LINK_FONT_RATIO = 0.85;

export function ctaOps(data: CtaWidgetParams, content: Box, env: DrawEnv): DrawOp[] {
  const { y, w, h } = content;
  const sizes = resolveCtaFontSizes(data.cardFontPx, data.ctaFontPx);
  const fontFamily = env.render.fontFamily;
  const pad = Math.round(Math.min(w, h) * 0.08);
  const gap = Math.round(sizes.headline * 0.5);
  const fallback = ctaExportFallback(data, content, pad, env);
  // The text stack: the whole card, or the card minus the export's QR column.
  const stack = fallback?.stack ?? content;
  const innerW = Math.max(0, stack.w - pad * 2);
  const ops: DrawOp[] = [{ op: "rect", box: content, radius: Math.min(24, Math.min(w, h) * 0.08), fill: data.bgColor }];

  const headStyle: TextStyle = { fontPx: sizes.headline, fontWeight: "bold", fontFamily };
  const subStyle: TextStyle = { fontPx: sizes.subheadline, fontWeight: "normal", fontFamily };
  const btnStyle: TextStyle = { fontPx: sizes.button, fontWeight: "bold", fontFamily };
  const linkStyle: TextStyle = { fontPx: Math.max(10, Math.round(sizes.subheadline * LINK_FONT_RATIO)), fontWeight: "normal", fontFamily };
  // Wrapping depends only on width: lay each block out once, then stack.
  const area: Box = { x: stack.x + pad, y, w: innerW, h: 0 };
  const head = layoutText(data.headline, headStyle, area, env, CTA_LINE_HEIGHT);
  const sub = data.subheadline ? layoutText(data.subheadline, subStyle, area, env, CTA_LINE_HEIGHT) : null;
  const label = data.ctaText || env.t("studio.widgetBody.ctaFallback");
  const btnH = Math.round(sizes.button * 2.1);
  const btnW = Math.min(innerW, env.measure(fontShorthand(btnStyle))(label) + sizes.button * 2);
  const linkH = Math.round(linkStyle.fontPx * CTA_LINE_HEIGHT);
  const blockH = (l: TextBlockLayout) => l.lines.length * l.lineHeightPx;
  const total = blockH(head) + (sub ? gap + blockH(sub) : 0) + gap + btnH + (fallback ? gap + linkH : 0);
  let cursor = y + Math.max(pad, (h - total) / 2);

  ops.push(...textLineOps({ ...head, top: cursor }, headStyle, data.textColor, "center"));
  cursor += blockH(head) + gap;
  if (sub) {
    ops.push(...textLineOps({ ...sub, top: cursor }, subStyle, data.textColor, "center", 0.8));
    cursor += blockH(sub) + gap;
  }
  const btn: Box = { x: stack.x + (stack.w - btnW) / 2, y: cursor, w: btnW, h: btnH };
  ops.push({ op: "rect", box: btn, radius: btnH / 2, fill: data.accentColor });
  ops.push(...textLineOps({ area: btn, lines: [label], lineHeightPx: btnH, top: btn.y }, btnStyle, data.accentTextColor, "center"));
  if (fallback) {
    const line = fitOneLine(fallback.linkText, innerW, env.measure(fontShorthand(linkStyle)));
    ops.push(...textLineOps({ area, lines: [line], lineHeightPx: linkH, top: btn.y + btnH + gap }, linkStyle, data.textColor, "center", 0.8));
    ops.push(...fallback.qr);
  }
  return ops;
}

export const ctaPlugin = registerPlugin<CtaParams>({
  effectKind: "canvas-v2:cta",
  widgetKinds: ["cta"],
  meta: {
    labelKey: "studio.effects.kind.ctaCard",
    category: "title",
    defaults: {
      x: 0.15, y: 0.3, width: 0.7, height: 0.4,
      headline: "Let's talk", subheadline: "", ctaText: "Learn more", ctaUrl: "",
      bgColor: "#0f172a", textColor: "#f8fafc", accentColor: "#7c3aed", accentTextColor: "#ffffff",
      cardFontPx: 24, ctaFontPx: 14,
    },
    paramHints: {
      bgColor: { type: "color" },
      textColor: { type: "color" },
      accentColor: { type: "color" },
      accentTextColor: { type: "color" },
    },
  },
  emit: (p) => ({
    headline: p.data.headline,
    subheadline: p.data.subheadline ?? "",
    ctaText: p.data.ctaText,
    ctaUrl: p.data.ctaUrl,
    bgColor: p.data.bgColor,
    textColor: p.data.textColor,
    accentColor: p.data.accentColor,
    accentTextColor: p.data.accentTextColor,
    ...when("cardFontPx", p.data.cardFontPx),
    ...when("ctaFontPx", p.data.ctaFontPx),
    // Only the opt-out is saved: absent = on, so existing saves keep their hash.
    ...when("exportFallback", p.data.exportFallback === false ? false : undefined),
  }),
  parse: (raw) => ({
    kind: "cta",
    data: {
      headline: stringOr(raw.headline, "Ready to get started?"),
      ...when("subheadline", optionalString(raw.subheadline)),
      ctaText: stringOr(raw.ctaText, "Learn more"),
      ctaUrl: stringOr(raw.ctaUrl, ""),
      bgColor: stringOr(raw.bgColor, "#0f172a"),
      textColor: stringOr(raw.textColor, "#ffffff"),
      accentColor: stringOr(raw.accentColor, "#a78bfa"),
      accentTextColor: stringOr(raw.accentTextColor, "#0f172a"),
      ...when("cardFontPx", optionalNumber(raw.cardFontPx)),
      ...when("ctaFontPx", optionalNumber(raw.ctaFontPx)),
      ...when("exportFallback", raw.exportFallback === false ? false : undefined),
    },
  }),
  draw: ({ data }, content, env) => ctaOps(data, content, env),
  assets: ({ data }) => ({ qrCodes: ctaQrPayloads(data) }),
  interactions: ctaLinkInteractions,
});
