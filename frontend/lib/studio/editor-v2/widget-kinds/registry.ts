/**
 * Widget-kind registry — one pure entry per `WidgetKind` (defaults, text
 * extraction, v1 emit). The mapped type makes a missing kind a compile
 * error; consumers look entries up by kind instead of switching.
 */
import type { SceneElement } from "@/types/video-script";
import type { Widget, WidgetKind, WidgetParams, WidgetPosition } from "../canvas-model/widget-types";
import type { ScriptElementContext, WidgetDataFor, WidgetKindRegistry } from "./types";
import { chipsEntry, ctaEntry, headingEntry, textEntry } from "./text-kinds";
import { chartEntry, imageEntry, videoEntry, webcamEntry } from "./media-kinds";
import { dividerEntry, shapeCircleEntry, shapeRectEntry } from "./shape-kinds";
import { captionBoxEntry, sfxBurstEntry, speechBubbleEntry } from "./comic-kinds";
import { avatarEntry, brandKitEntry, engagementAssetEntry, linkedContentEntry } from "./embed-kinds";

export const WIDGET_KIND_REGISTRY: WidgetKindRegistry = {
  text: textEntry,
  heading: headingEntry,
  image: imageEntry,
  video: videoEntry,
  "shape-rect": shapeRectEntry,
  "shape-circle": shapeCircleEntry,
  divider: dividerEntry,
  chart: chartEntry,
  webcam: webcamEntry,
  chips: chipsEntry,
  cta: ctaEntry,
  "linked-content": linkedContentEntry,
  "speech-bubble": speechBubbleEntry,
  "caption-box": captionBoxEntry,
  "sfx-burst": sfxBurstEntry,
  avatar: avatarEntry,
  "engagement-asset": engagementAssetEntry,
  "brand-kit": brandKitEntry,
};

/** A fresh widget of `kind` built from the shared default pose. */
export function createWidgetOfKind(kind: WidgetKind, id: string, base: WidgetPosition): Widget {
  return WIDGET_KIND_REGISTRY[kind].create(id, base);
}

function textFor<K extends WidgetKind>(kind: K, data: WidgetDataFor<K>): string {
  return WIDGET_KIND_REGISTRY[kind].toText(data);
}

function scriptElementFor<K extends WidgetKind>(
  kind: K,
  data: WidgetDataFor<K>,
  ctx: ScriptElementContext,
): SceneElement | null {
  return WIDGET_KIND_REGISTRY[kind].toScriptElement(data, ctx);
}

/** Authored plain text a widget's params carry ("" when none). */
export function widgetParamsToText(params: WidgetParams): string {
  return textFor(params.kind, params.data);
}

/** The v1 `SceneElement` body for a widget's params (null = dropped). */
export function widgetParamsToScriptElement(
  params: WidgetParams,
  ctx: ScriptElementContext,
): SceneElement | null {
  return scriptElementFor(params.kind, params.data, ctx);
}
