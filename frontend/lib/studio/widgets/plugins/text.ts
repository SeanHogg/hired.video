/**
 * Text + heading widget plugin. Layout (padding, wrapping, line height,
 * vertical centring, font) happens once here; both renderers draw the
 * resulting lines verbatim, so the browser never re-wraps them.
 */
import type { TextWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { type Box } from "../frame";
import { numberOr, stringOr } from "@/lib/numeric";
import { registerPlugin, type RenderContext } from "../plugin";
import type { DrawOp } from "../draw-ops";
import type { TextStyle } from "../text-layout";
import { layoutText, oneOf, textLineOps } from "./shared";

type TextParams = Extract<WidgetParams, { data: TextWidgetParams }>;

/** Inner padding when the text has a background fill. */
export const TEXT_BACKGROUND_PADDING = { x: 8, y: 4 } as const;

export function textStyle(data: TextWidgetParams, render: RenderContext): TextStyle {
  return { fontPx: data.fontPx, fontWeight: data.fontWeight, fontFamily: render.fontFamily };
}

const ALIGNS = ["left", "center", "right"] as const;

export const textPlugin = registerPlugin<TextParams>({
  effectKind: "canvas-v2:text",
  widgetKinds: ["text", "heading"],
  meta: {
    labelKey: "studio.effects.kind.textWidget",
    category: "title",
    defaults: { x: 0, y: 0, width: 0.4, height: 0.15, text: "Text", fontPx: 32, color: "#ffffff", fontWeight: "normal", align: "left", background: null },
    paramHints: {
      color: { type: "color" },
      align: {
        type: "select",
        options: [
          { value: "left", labelKey: "studio.effects.option.align.left" },
          { value: "center", labelKey: "studio.effects.option.align.center" },
          { value: "right", labelKey: "studio.effects.option.align.right" },
        ],
      },
    },
  },
  emit: (p) => ({
    text: p.data.text,
    fontPx: p.data.fontPx,
    color: p.data.color,
    fontWeight: p.data.fontWeight,
    align: p.data.align,
    background: p.data.background,
    isHeading: p.kind === "heading",
  }),
  parse: (raw) => ({
    kind: raw.isHeading === true ? "heading" : "text",
    data: {
      text: stringOr(raw.text, "Your text here"),
      fontPx: numberOr(raw.fontPx, 32),
      color: stringOr(raw.color, "#ffffff"),
      fontWeight: raw.fontWeight === "bold" ? "bold" : "normal",
      align: oneOf(raw.align, ALIGNS, "left"),
      background: typeof raw.background === "string" && raw.background ? raw.background : null,
    },
  }),
  draw({ data }, content, env) {
    const ops: DrawOp[] = [];
    const pad = data.background ? TEXT_BACKGROUND_PADDING : { x: 0, y: 0 };
    if (data.background) ops.push({ op: "rect", box: content, fill: data.background });
    const area: Box = {
      x: content.x + pad.x,
      y: content.y + pad.y,
      w: Math.max(0, content.w - pad.x * 2),
      h: Math.max(0, content.h - pad.y * 2),
    };
    const style = textStyle(data, env.render);
    ops.push(...textLineOps(layoutText(data.text, style, area, env), style, data.color, data.align));
    return ops;
  },
});
