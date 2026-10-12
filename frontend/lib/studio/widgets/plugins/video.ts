/**
 * Video + webcam widget plugins. Both are a playing video fitted into the
 * content box; the export seeks it to the clip-local time
 * (lib/timeline/effects/widget-plugins.ts), the DOM syncs the element to
 * the editor playhead (components/studio/widgets/MediaOpView.tsx).
 *
 * Chroma key is a video-widget property, but the keying itself runs through
 * the one registered `chroma-key` effect in the export's pixel pass
 * (`pixelEffects`); the DOM keys with the same math on a canvas.
 */
import type { ChromaKeyParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { filtersToCss } from "@/lib/studio/video-filters";
import type { EffectEntry } from "../frame";
import { stringOr } from "../frame";
import { registerPlugin } from "../plugin";
import { emitMediaSource, mediaUrl, parseFilters, parseMediaSource } from "./image";
import { mediaPlaceholderOps } from "./media-placeholder";
import { optionalNumber, when } from "./shared";

// Narrow on `kind`: every WebcamWidgetParams field is optional, so a
// data-shaped Extract would also match the video variant.
type VideoParams = Extract<WidgetParams, { kind: "video" }>;
type WebcamParams = Extract<WidgetParams, { kind: "webcam" }>;

/** A saved `chromaKey` blob, or null when missing / malformed. `keyColor`
 *  is required; the rest fall back to the standard defaults. */
export function parseChromaKey(value: unknown): ChromaKeyParams | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.keyColor !== "string") return null;
  return {
    keyColor: v.keyColor,
    threshold: optionalNumber(v.threshold) ?? 0.4,
    softness: optionalNumber(v.softness) ?? 0.1,
    ...when("spillSuppression", optionalNumber(v.spillSuppression)),
  };
}

/** The `chroma-key` pixel effect a configured key stands for. */
export function chromaKeyEffects(ck: ChromaKeyParams | null | undefined): EffectEntry[] {
  if (!ck) return [];
  return [
    {
      kind: "chroma-key",
      params: {
        keyColor: ck.keyColor,
        threshold: ck.threshold,
        softness: ck.softness,
        spillSuppression: ck.spillSuppression ?? 0.5,
      },
    },
  ];
}

export const videoPlugin = registerPlugin<VideoParams>({
  effectKind: "canvas-v2:video",
  widgetKinds: ["video"],
  playsVideo: true,
  meta: {
    labelKey: "studio.effects.kind.videoWidget",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.5, height: 0.5, url: "", muted: false },
  },
  emit: (p) => ({
    ...emitMediaSource(p.data.source),
    muted: p.data.muted,
    ...when("chromaKey", p.data.chromaKey),
    ...when("filters", p.data.filters),
  }),
  parse: (raw) => ({
    kind: "video",
    data: {
      source: parseMediaSource(raw),
      muted: raw.muted === true,
      ...when("chromaKey", parseChromaKey(raw.chromaKey)),
      ...when("filters", parseFilters(raw.filters)),
    },
  }),
  draw({ data }, content, env) {
    const url = mediaUrl(data.source);
    if (!url) return mediaPlaceholderOps(content, env, "studio.widgetBody.videoPlaceholder", true);
    const filter = filtersToCss(data.filters);
    return [
      {
        op: "media",
        media: "video",
        url,
        box: content,
        fit: "cover",
        muted: data.muted,
        chromaKey: data.chromaKey ?? null,
        ...when("filter", filter || undefined),
      },
    ];
  },
  assets: (p) => {
    const url = mediaUrl(p.data.source);
    return url ? { videos: [url] } : {};
  },
  pixelEffects: (p) => chromaKeyEffects(p.data.chromaKey),
});

export const webcamPlugin = registerPlugin<WebcamParams>({
  effectKind: "canvas-v2:webcam",
  widgetKinds: ["webcam"],
  playsVideo: true,
  meta: {
    labelKey: "studio.effects.kind.webcam",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.4, height: 0.4, recordingUrl: "", mirror: true, muted: true },
  },
  emit: (p) => ({ recordingUrl: p.data.recordingUrl ?? "", mirror: !!p.data.mirror, muted: !!p.data.muted }),
  parse: (raw) => ({
    kind: "webcam",
    data: { recordingUrl: stringOr(raw.recordingUrl, "") || null, mirror: raw.mirror !== false, muted: raw.muted === true },
  }),
  draw({ data }, content, env) {
    const url = data.recordingUrl ?? "";
    // No recording yet: the card stays in the export too, so the layout
    // still shows where the webcam will land.
    if (!url) return mediaPlaceholderOps(content, env, "studio.widgetBody.webcamPlaceholder", false);
    return [{ op: "media", media: "video", url, box: content, fit: "cover", mirror: !!data.mirror, muted: !!data.muted }];
  },
  assets: (p) => (p.data.recordingUrl ? { videos: [p.data.recordingUrl] } : {}),
});
