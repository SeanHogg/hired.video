/** Widget-kind entries: shape-rect, shape-circle, divider. */
import type { ElementStyle, TextElement } from "@/types/video-script";
import type { ShapeWidgetParams } from "../canvas-model/widget-params-core";
import type { ScriptElementContext, WidgetKindEntry } from "./types";
import { noText, widgetOf } from "./shared";

type ShapeChrome = Required<Pick<ElementStyle, "backgroundColor">> &
  Pick<ElementStyle, "borderColor" | "borderWidth" | "borderRadius">;

/** v1's SceneElement union doesn't have shape primitives — encode them
 *  as a styled text element with no text. Keeps the box + bg/border +
 *  radius visible in v1's render path. Gap-registered. */
function shapeAsTextElement(
  { widget, box, style, z, rotation }: ScriptElementContext,
  chrome: ShapeChrome,
): TextElement {
  return {
    id: widget.id,
    kind: "text",
    text: "",
    box,
    style: {
      ...style,
      backgroundColor: chrome.backgroundColor,
      borderColor: chrome.borderColor,
      borderWidth: chrome.borderWidth,
      borderRadius: chrome.borderRadius,
    },
    z,
    rotation,
  } as TextElement;
}

/** Fill + stroke chrome shared by both shape kinds (radius differs). */
function shapeChrome(
  data: ShapeWidgetParams,
  style: ElementStyle | undefined,
  borderRadius: number | undefined,
): ShapeChrome {
  return {
    backgroundColor: data.fill,
    borderColor: data.strokeColor ? data.strokeColor : style?.borderColor,
    borderWidth: data.strokeWidth ? data.strokeWidth : style?.borderWidth,
    borderRadius,
  };
}

export const shapeRectEntry: WidgetKindEntry<"shape-rect"> = {
  create: (id, position) =>
    widgetOf(id, "shape-rect", { ...position, width: 0.3, height: 0.3 }, {
      kind: "shape-rect",
      data: { fill: "#0ea5e9", strokeColor: "#ffffff", strokeWidth: 0, cornerRadius: 8 },
    }),
  toText: noText,
  toScriptElement: (data, ctx) =>
    shapeAsTextElement(ctx, shapeChrome(data, ctx.style, data.cornerRadius)),
};

export const shapeCircleEntry: WidgetKindEntry<"shape-circle"> = {
  create: (id, position) =>
    widgetOf(id, "shape-circle", { ...position, width: 0.25, height: 0.25 }, {
      kind: "shape-circle",
      data: { fill: "#22c55e", strokeColor: "#ffffff", strokeWidth: 0, cornerRadius: 0 },
    }),
  toText: noText,
  toScriptElement: (data, ctx) =>
    shapeAsTextElement(ctx, shapeChrome(data, ctx.style, Math.max(ctx.box.w, ctx.box.h) * 5)),
};

export const dividerEntry: WidgetKindEntry<"divider"> = {
  create: (id, position) =>
    widgetOf(id, "divider", { ...position, width: 0.6, height: 0.02 }, {
      kind: "divider",
      data: { color: "#ffffff", thickness: 2 },
    }),
  toText: noText,
  toScriptElement: (data, ctx) =>
    shapeAsTextElement(ctx, {
      backgroundColor: data.color,
      borderColor: ctx.style?.borderColor,
      borderWidth: ctx.style?.borderWidth,
      borderRadius: ctx.style?.borderRadius,
    }),
};
