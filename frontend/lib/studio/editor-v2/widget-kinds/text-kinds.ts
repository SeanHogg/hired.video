/** Widget-kind entries: text, heading, chips, cta. */
import type { ChipsElement, TextElement } from "@/types/video-script";
import type { TextWidgetParams } from "../canvas-model/widget-params-core";
import type { ScriptElementContext, WidgetKindEntry } from "./types";
import { noScriptElement, widgetOf } from "./shared";

function textToElement(data: TextWidgetParams, { widget, box, style, z, rotation }: ScriptElementContext): TextElement {
  const t: TextElement = {
    id: widget.id,
    kind: "text",
    text: data.text,
    box,
    fontSize: data.fontPx,
    fontWeight: data.fontWeight,
    color: data.color,
    align: data.align,
    style,
    z,
    rotation,
  };
  return t;
}

export const textEntry: WidgetKindEntry<"text"> = {
  create: (id, position) =>
    widgetOf(id, "text", position, {
      kind: "text",
      data: {
        text: "Your text here",
        fontPx: 32,
        color: "#ffffff",
        fontWeight: "normal",
        align: "left",
        background: null,
      },
    }),
  toText: (data) => data.text.trim(),
  toScriptElement: textToElement,
};

export const headingEntry: WidgetKindEntry<"heading"> = {
  create: (id, position) =>
    widgetOf(id, "heading", { ...position, width: 0.6, height: 0.18 }, {
      kind: "heading",
      data: {
        text: "Heading",
        fontPx: 72,
        color: "#ffffff",
        fontWeight: "bold",
        align: "left",
        background: null,
      },
    }),
  toText: (data) => data.text.trim(),
  toScriptElement: textToElement,
};

export const chipsEntry: WidgetKindEntry<"chips"> = {
  create: (id, position) =>
    widgetOf(id, "chips", { ...position, width: 0.6, height: 0.1 }, {
      kind: "chips",
      data: {
        chips: ["TypeScript", "React", "Postgres"],
        fontPx: 14,
        chipColor: "#1e293b",
        textColor: "#f1f5f9",
        direction: "row",
      },
    }),
  toText: (data) => data.chips.filter(Boolean).join(", "),
  toScriptElement: (data, { widget, box, style, z, rotation }) => {
    const c: ChipsElement = {
      id: widget.id,
      kind: "chips",
      chips: data.chips,
      fontSize: data.fontPx,
      fontFamily: data.fontFamily,
      chipColor: data.chipColor,
      textColor: data.textColor,
      direction: data.direction,
      box,
      style,
      z,
      rotation,
    };
    return c;
  },
};

export const ctaEntry: WidgetKindEntry<"cta"> = {
  create: (id) =>
    widgetOf(id, "cta", { x: 0.15, y: 0.3, width: 0.7, height: 0.4, z: 10, rotation: 0 }, {
      kind: "cta",
      data: {
        headline: "Ready to get started?",
        subheadline: "Tap below to learn more.",
        ctaText: "Learn more",
        ctaUrl: "",
        bgColor: "#0f172a",
        textColor: "#ffffff",
        accentColor: "#a78bfa",
        accentTextColor: "#0f172a",
        cardFontPx: 24,
        ctaFontPx: 14,
      },
    }),
  toText: (data) => {
    const headline = data.headline?.trim();
    const sub = data.subheadline?.trim();
    const cta = data.ctaText?.trim();
    return [headline, sub, cta].filter(Boolean).join(" · ");
  },
  // The CTA widget's data already rides on the scene envelope
  // (ctaText + ctaUrl + the "cta" scene type) via `sceneToSceneScript`.
  // No matching SceneElement kind, so don't double-emit here — v1's
  // render path picks the CTA up from the scene-level fields.
  toScriptElement: noScriptElement,
};
