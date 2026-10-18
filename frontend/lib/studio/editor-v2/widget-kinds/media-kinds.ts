/** Widget-kind entries: image, video, webcam, chart. */
import type { ChartElement, ImageAnimation, ImageElement, VideoElement, WebcamElement } from "@/types/video-script";
import type { Widget } from "../canvas-model/widget-types";
import type { WidgetKindEntry } from "./types";
import { noText, widgetOf } from "./shared";

/** Reverse of `ken_burnsToEffects` in `script-to-canvas.ts`: when a V2
 *  widget carries a V1-compatible `animate-zoom-*` / `animate-pan-*`
 *  effect, surface it back as the V1 `imageAnimation` field. Other
 *  modern animate kinds (fade, pulse, shake) have no V1 equivalent so
 *  they're written only on the effects array — V1 ignores them.
 *  Round-trip is lossless for the four kinds V1 knows about. */
function effectsToImageAnimation(
  effects: Widget["effects"],
): ImageAnimation | undefined {
  if (!effects) return "none";
  const known: ReadonlySet<string> = new Set([
    "animate-zoom-in",
    "animate-zoom-out",
    "animate-pan-left",
    "animate-pan-right",
  ]);
  for (const e of effects) {
    if (known.has(e.kind)) {
      return e.kind.slice("animate-".length) as ImageAnimation;
    }
  }
  return "none";
}

export const imageEntry: WidgetKindEntry<"image"> = {
  create: (id, position) =>
    widgetOf(id, "image", { ...position, width: 0.35, height: 0.45 }, {
      kind: "image",
      data: { source: { kind: "url", url: "" }, fit: "cover" },
    }),
  toText: noText,
  toScriptElement: (data, { widget, box, style, z, rotation }) => {
    const im: ImageElement = {
      id: widget.id,
      kind: "image",
      url: data.source.kind === "url" ? data.source.url : "",
      box,
      fit: data.fit === "stretch" ? "fill" : data.fit,
      animation: effectsToImageAnimation(widget.effects),
      style,
      z,
      rotation,
    };
    return im;
  },
};

export const videoEntry: WidgetKindEntry<"video"> = {
  create: (id, position) =>
    widgetOf(id, "video", { ...position, width: 0.5, height: 0.5 }, {
      kind: "video",
      data: { source: { kind: "url", url: "" }, muted: false },
    }),
  toText: noText,
  toScriptElement: (data, { widget, box, style, z, rotation }) => {
    const v: VideoElement = {
      id: widget.id,
      kind: "video",
      url: data.source.kind === "url" ? data.source.url : "",
      box,
      muted: data.muted,
      style,
      z,
      rotation,
    };
    return v;
  },
};

export const webcamEntry: WidgetKindEntry<"webcam"> = {
  create: (id, position) =>
    widgetOf(id, "webcam", { ...position, width: 0.4, height: 0.5 }, {
      kind: "webcam",
      data: { recordingUrl: null, mirror: true, muted: false },
    }),
  toText: noText,
  toScriptElement: (data, { widget, box, style, z, rotation }) => {
    const w: WebcamElement = {
      id: widget.id,
      kind: "webcam",
      recordingUrl: data.recordingUrl ?? null,
      mirror: data.mirror,
      muted: data.muted,
      box,
      style,
      z,
      rotation,
    };
    return w;
  },
};

export const chartEntry: WidgetKindEntry<"chart"> = {
  create: (id, position) =>
    widgetOf(id, "chart", { ...position, width: 0.6, height: 0.5 }, {
      kind: "chart",
      data: {
        chartType: "bar",
        data: "category,value\nQ1,42\nQ2,65\nQ3,58\nQ4,81",
        format: "csv",
        title: "Quarterly results",
      },
    }),
  toText: noText,
  toScriptElement: (data, { widget, box, style, z, rotation }) => {
    const c: ChartElement = {
      id: widget.id,
      kind: "chart",
      chartType: data.chartType,
      data: data.data,
      format: data.format,
      title: data.title,
      takeaway: data.takeaway,
      colors: data.colors,
      box,
      style,
      z,
      rotation,
    };
    return c;
  },
};
