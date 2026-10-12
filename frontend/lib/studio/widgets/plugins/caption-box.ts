/** Caption-box plugin (#939) — the rectangular narration block: a filled
 *  box with its border inside, text left-aligned and vertically centred. */
import type { CaptionBoxWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { numberOr, stringOr, type Box } from "../frame";
import { registerPlugin } from "../plugin";
import { filledBoxOps } from "../draw-ops";
import { optionalString, textBlockOps, when } from "./shared";

type CaptionParams = Extract<WidgetParams, { data: CaptionBoxWidgetParams }>;

const PAD_X = 12;
const PAD_Y = 4;

export const captionBoxPlugin = registerPlugin<CaptionParams>({
  effectKind: "canvas-v2:caption-box",
  widgetKinds: ["caption-box"],
  meta: {
    labelKey: "studio.effects.kind.captionBox",
    category: "title",
    defaults: {
      x: 0.1, y: 0.85, width: 0.8, height: 0.1,
      bgColor: "#fef9c3", strokeColor: "#0f172a", strokeWidth: 2, color: "#0f172a",
      text: "Meanwhile, in the city below…", fontPx: 18, fontFamily: "", italic: true,
    },
    paramHints: { bgColor: { type: "color" }, strokeColor: { type: "color" }, color: { type: "color" } },
  },
  emit: (p) => ({
    text: p.data.text,
    fontPx: p.data.fontPx,
    fontFamily: p.data.fontFamily ?? "",
    color: p.data.color,
    bgColor: p.data.bgColor,
    strokeColor: p.data.strokeColor,
    strokeWidth: p.data.strokeWidth,
    italic: p.data.italic,
  }),
  parse: (raw) => ({
    kind: "caption-box",
    data: {
      text: stringOr(raw.text, ""),
      fontPx: numberOr(raw.fontPx, 18),
      ...when("fontFamily", optionalString(raw.fontFamily)),
      color: stringOr(raw.color, "#1c1917"),
      bgColor: stringOr(raw.bgColor, "#fef3c7"),
      strokeColor: stringOr(raw.strokeColor, "#1c1917"),
      strokeWidth: numberOr(raw.strokeWidth, 2),
      italic: raw.italic === true,
    },
  }),
  draw({ data }, content, env) {
    const bw = Math.max(0, data.strokeWidth);
    const area: Box = {
      x: content.x + bw + PAD_X,
      y: content.y + bw + PAD_Y,
      w: Math.max(0, content.w - (bw + PAD_X) * 2),
      h: Math.max(0, content.h - (bw + PAD_Y) * 2),
    };
    const style = { fontPx: data.fontPx, fontWeight: "normal" as const, fontFamily: data.fontFamily || env.render.fontFamily, italic: data.italic };
    return [
      ...filledBoxOps("rect", content, data.bgColor, { color: data.strokeColor, width: bw }),
      ...textBlockOps(data.text, style, area, env, data.color, "left", 1.2),
    ];
  },
});
