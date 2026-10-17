/** Divider widget plugin — a horizontal rule centred in its box. */
import type { DividerWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { numberOr, stringOr } from "@/lib/numeric";
import { registerPlugin } from "../plugin";

type DividerParams = Extract<WidgetParams, { data: DividerWidgetParams }>;

export const dividerPlugin = registerPlugin<DividerParams>({
  effectKind: "canvas-v2:divider",
  widgetKinds: ["divider"],
  meta: {
    labelKey: "studio.effects.kind.divider",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.6, height: 0.02, color: "#ffffff", thickness: 2 },
    paramHints: { color: { type: "color" } },
  },
  emit: (p) => ({ color: p.data.color, thickness: p.data.thickness }),
  parse: (raw) => ({ kind: "divider", data: { color: stringOr(raw.color, "#ffffff"), thickness: numberOr(raw.thickness, 2) } }),
  draw: ({ data }, content) => [
    {
      op: "rect",
      box: { x: content.x, y: content.y + content.h / 2 - data.thickness / 2, w: content.w, h: data.thickness },
      fill: data.color,
    },
  ],
});
