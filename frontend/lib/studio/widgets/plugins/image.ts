/** Image widget plugin — URL-backed media fitted into the content box, with
 *  the per-widget colour grade (#596/#806/#2393) as a CSS filter (DOM +
 *  `ctx.filter`) and a structured `grade` for the Safari < 18 pixel path. */
import type { ImageWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { filtersToCss, type VideoFilters } from "@/lib/studio/video-filters";
import { stringOr } from "../frame";
import { registerPlugin } from "../plugin";
import { mediaPlaceholderOps } from "./media-placeholder";
import { oneOf, optionalString, when } from "./shared";

type ImageParams = Extract<WidgetParams, { data: ImageWidgetParams }>;

const FITS = ["cover", "contain", "stretch"] as const;

/** Saved media reference → widget source (a sourceId wins over a url). */
export function parseMediaSource(raw: Record<string, unknown>): ImageWidgetParams["source"] {
  const sourceId = stringOr(raw.sourceId, "");
  return sourceId ? { kind: "sourceId", id: sourceId } : { kind: "url", url: stringOr(raw.url, "") };
}

export function emitMediaSource(source: ImageWidgetParams["source"]): Record<string, unknown> {
  return { url: source.kind === "url" ? source.url : "", sourceId: source.kind === "sourceId" ? source.id : "" };
}

export function mediaUrl(source: ImageWidgetParams["source"]): string {
  return source.kind === "url" ? source.url : "";
}

/** Saved colour grade (an object) or undefined. */
export function parseFilters(v: unknown): VideoFilters | undefined {
  return v && typeof v === "object" ? (v as VideoFilters) : undefined;
}

export const imagePlugin = registerPlugin<ImageParams>({
  effectKind: "canvas-v2:image",
  widgetKinds: ["image"],
  meta: {
    labelKey: "studio.effects.kind.imageWidget",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.3, height: 0.3, url: "", fit: "cover" },
    paramHints: {
      fit: {
        type: "select",
        options: [
          { value: "cover", labelKey: "studio.effects.option.fit.cover" },
          { value: "contain", labelKey: "studio.effects.option.fit.contain" },
          { value: "stretch", labelKey: "studio.effects.option.fit.stretch" },
        ],
      },
    },
  },
  emit: (p) => ({
    ...emitMediaSource(p.data.source),
    fit: p.data.fit,
    ...when("altText", p.data.altText),
    ...when("filters", p.data.filters),
  }),
  parse: (raw) => ({
    kind: "image",
    data: {
      source: parseMediaSource(raw),
      fit: oneOf(raw.fit, FITS, "cover"),
      ...when("altText", optionalString(raw.altText)),
      ...when("filters", parseFilters(raw.filters)),
    },
  }),
  draw({ data }, content, env) {
    const url = mediaUrl(data.source);
    if (!url) return mediaPlaceholderOps(content, env, "studio.widgetBody.imagePlaceholder", true);
    const filter = filtersToCss(data.filters);
    return [
      {
        op: "media",
        media: "image",
        url,
        box: content,
        fit: data.fit,
        ...when("alt", data.altText),
        ...when("filter", filter || undefined),
        ...when("grade", filter ? data.filters : undefined),
      },
    ];
  },
  assets: (p) => {
    const url = mediaUrl(p.data.source);
    return url ? { images: [url] } : {};
  },
});
