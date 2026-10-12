/**
 * Rectangle + circle widget plugins. CSS `border-box` geometry: the fill
 * covers the whole box and the stroke sits INSIDE it (`filledBoxOps`).
 */
import type { ShapeWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { numberOr, stringOr } from "../frame";
import { registerPlugin } from "../plugin";
import { filledBoxOps } from "../draw-ops";

type ShapeParams = Extract<WidgetParams, { data: ShapeWidgetParams }>;

const SHAPE_HINTS = { fill: { type: "color" }, strokeColor: { type: "color" } } as const;

function parseShape(raw: Record<string, unknown>, fill: string, cornerRadius: number): ShapeWidgetParams {
  return {
    fill: stringOr(raw.fill, fill),
    strokeColor: stringOr(raw.strokeColor, "#ffffff"),
    strokeWidth: numberOr(raw.strokeWidth, 0),
    cornerRadius,
  };
}

const strokeOf = (data: ShapeWidgetParams) => ({ color: data.strokeColor, width: data.strokeWidth });

export const shapeRectPlugin = registerPlugin<ShapeParams>({
  effectKind: "canvas-v2:shape-rect",
  widgetKinds: ["shape-rect"],
  meta: {
    labelKey: "studio.effects.kind.rectangle",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.3, height: 0.3, fill: "#0ea5e9", strokeColor: "#ffffff", strokeWidth: 0, cornerRadius: 8 },
    paramHints: SHAPE_HINTS,
  },
  emit: (p) => ({ fill: p.data.fill, strokeColor: p.data.strokeColor, strokeWidth: p.data.strokeWidth, cornerRadius: p.data.cornerRadius }),
  parse: (raw) => ({ kind: "shape-rect", data: parseShape(raw, "#0ea5e9", numberOr(raw.cornerRadius, 8)) }),
  draw: ({ data }, content) => filledBoxOps("rect", content, data.fill, strokeOf(data), data.cornerRadius),
});

export const shapeCirclePlugin = registerPlugin<ShapeParams>({
  effectKind: "canvas-v2:shape-circle",
  widgetKinds: ["shape-circle"],
  meta: {
    labelKey: "studio.effects.kind.circle",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.25, height: 0.25, fill: "#22c55e", strokeColor: "#ffffff", strokeWidth: 0 },
    paramHints: SHAPE_HINTS,
  },
  emit: (p) => ({ fill: p.data.fill, strokeColor: p.data.strokeColor, strokeWidth: p.data.strokeWidth }),
  parse: (raw) => ({ kind: "shape-circle", data: parseShape(raw, "#22c55e", 0) }),
  draw: ({ data }, content) => filledBoxOps("ellipse", content, data.fill, strokeOf(data)),
});
