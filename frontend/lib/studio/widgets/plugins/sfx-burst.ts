/** SFX-burst plugin (#939) — "POW!" lettering on a burst silhouette:
 *  heavy uppercase text with a 2px offset shadow in the ink colour. */
import type { SfxBurstWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { numberOr, stringOr, type Box } from "../frame";
import { registerPlugin } from "../plugin";
import type { DrawOp } from "../draw-ops";
import type { TextStyle } from "../text-layout";
import { burstOutline } from "./comic-geometry";
import { layoutText, oneOf, optionalString, textLineOps, when } from "./shared";

type BurstParams = Extract<WidgetParams, { data: SfxBurstWidgetParams }>;

const SHAPES = ["star", "jagged", "circle-jagged", "lightning"] as const;
const SHADOW_OFFSET = 2;

export const sfxBurstPlugin = registerPlugin<BurstParams>({
  effectKind: "canvas-v2:sfx-burst",
  widgetKinds: ["sfx-burst"],
  meta: {
    labelKey: "studio.effects.kind.sfxBurst",
    category: "title",
    defaults: {
      x: 0.55, y: 0.55, width: 0.25, height: 0.25,
      shape: "star", bgColor: "#facc15", strokeColor: "#0f172a", strokeWidth: 3, color: "#0f172a",
      text: "BOOM!", fontPx: 32, fontFamily: "", rotation: 12,
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
    shape: p.data.shape,
  }),
  parse: (raw) => ({
    kind: "sfx-burst",
    data: {
      text: stringOr(raw.text, "POW!"),
      fontPx: numberOr(raw.fontPx, 48),
      ...when("fontFamily", optionalString(raw.fontFamily)),
      color: stringOr(raw.color, "#0a0a0a"),
      bgColor: stringOr(raw.bgColor, "#facc15"),
      strokeColor: stringOr(raw.strokeColor, "#0a0a0a"),
      strokeWidth: numberOr(raw.strokeWidth, 4),
      shape: oneOf(raw.shape, SHAPES, "star"),
    },
  }),
  draw({ data }, content, env) {
    const style: TextStyle = { fontPx: data.fontPx, fontWeight: 900, fontFamily: data.fontFamily || env.render.fontFamily };
    const area: Box = { x: content.x + content.w * 0.1, y: content.y + content.h * 0.1, w: content.w * 0.8, h: content.h * 0.8 };
    const layout = layoutText(data.text.toUpperCase(), style, area, env);
    const shadowLayout = {
      ...layout,
      area: { ...layout.area, x: layout.area.x + SHADOW_OFFSET },
      top: layout.top + SHADOW_OFFSET,
    };
    const ops: DrawOp[] = [
      { op: "path", d: burstOutline(data.shape, content), fill: data.bgColor, stroke: { color: data.strokeColor, width: data.strokeWidth } },
      ...textLineOps(shadowLayout, style, data.strokeColor, "center"),
      ...textLineOps(layout, style, data.color, "center"),
    ];
    return ops;
  },
});
