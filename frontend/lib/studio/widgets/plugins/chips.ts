/** Chips widget plugin — pill labels laid out as wrapping rows or a column.
 *  Pill sizes scale with the font (padding 0.7em × 0.3em, gap 0.4em). */
import type { ChipsWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { type Box } from "../frame";
import { numberOr, stringOr } from "@/lib/numeric";
import { registerPlugin } from "../plugin";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, type TextStyle } from "../text-layout";
import { optionalString, stringArray, when } from "./shared";

type ChipsParams = Extract<WidgetParams, { data: ChipsWidgetParams }>;

export function chipsOps(data: ChipsWidgetParams, content: Box, env: DrawEnv): DrawOp[] {
  const font: TextStyle = { fontPx: data.fontPx, fontWeight: "normal", fontFamily: data.fontFamily || env.render.fontFamily };
  const measure = env.measure(fontShorthand(font));
  const padX = Math.round(data.fontPx * 0.7);
  const padY = Math.round(data.fontPx * 0.3);
  const gap = Math.round(data.fontPx * 0.4);
  const chipH = data.fontPx + padY * 2;
  const ops: DrawOp[] = [];
  let x = content.x;
  let y = content.y;
  for (const chip of data.chips) {
    const chipW = Math.min(content.w, measure(chip) + padX * 2);
    if (data.direction === "row" && x + chipW > content.x + content.w && x > content.x) {
      x = content.x;
      y += chipH + gap;
    }
    if (y + chipH > content.y + content.h) break;
    ops.push({ op: "rect", box: { x, y, w: chipW, h: chipH }, radius: chipH / 2, fill: data.chipColor });
    ops.push({ op: "text", text: chip, x: x + padX, y: y + chipH / 2, font, color: data.textColor, align: "left" });
    if (data.direction === "row") x += chipW + gap;
    else y += chipH + gap;
  }
  return ops;
}

export const chipsPlugin = registerPlugin<ChipsParams>({
  effectKind: "canvas-v2:chips",
  widgetKinds: ["chips"],
  meta: {
    labelKey: "studio.effects.kind.chips",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.6, height: 0.2, chips: [], fontPx: 14, fontFamily: "", chipColor: "#1e293b", textColor: "#f1f5f9", direction: "row" },
    paramHints: {
      chipColor: { type: "color" },
      textColor: { type: "color" },
      direction: {
        type: "select",
        options: [
          { value: "row", labelKey: "studio.effects.option.direction.row" },
          { value: "column", labelKey: "studio.effects.option.direction.column" },
        ],
      },
    },
  },
  emit: (p) => ({
    chips: p.data.chips,
    fontPx: p.data.fontPx,
    fontFamily: p.data.fontFamily ?? "",
    chipColor: p.data.chipColor,
    textColor: p.data.textColor,
    direction: p.data.direction,
  }),
  parse: (raw) => ({
    kind: "chips",
    data: {
      chips: stringArray(raw.chips),
      fontPx: numberOr(raw.fontPx, 14),
      ...when("fontFamily", optionalString(raw.fontFamily)),
      chipColor: stringOr(raw.chipColor, "#1e293b"),
      textColor: stringOr(raw.textColor, "#f1f5f9"),
      direction: raw.direction === "column" ? "column" : "row",
    },
  }),
  draw: ({ data }, content, env) => chipsOps(data, content, env),
});
