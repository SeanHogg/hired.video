/**
 * Widget plugin registry (#2312). EVERY widget kind is one plugin: emitted,
 * parsed, drawn and painted by it, and rendered on the DOM by the generic
 * plugin body (components/studio/widgets/PluginWidgetBody). A `Record` over
 * `WidgetKind`, so a new kind without a plugin fails to compile — there is
 * no per-kind switch left in the editor stage, the emitter or the export.
 */
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import { fontFamilyFor } from "@/lib/studio/font-catalog";
import { stringOr } from "./frame";
import type { RegisteredWidgetPlugin, RenderContext } from "./plugin";
import { avatarPlugin } from "./plugins/avatar";
import { brandKitPlugin } from "./plugins/brand-kit";
import { captionBoxPlugin } from "./plugins/caption-box";
import { chartPlugin } from "./plugins/chart";
import { chipsPlugin } from "./plugins/chips";
import { ctaPlugin } from "./plugins/cta";
import { dividerPlugin } from "./plugins/divider";
import { engagementAssetPlugin } from "./plugins/engagement-asset";
import { imagePlugin } from "./plugins/image";
import { linkedContentPlugin } from "./plugins/linked-content";
import { shapeCirclePlugin, shapeRectPlugin } from "./plugins/shape";
import { sfxBurstPlugin } from "./plugins/sfx-burst";
import { speechBubblePlugin } from "./plugins/speech-bubble";
import { textPlugin } from "./plugins/text";
import { videoPlugin, webcamPlugin } from "./plugins/video";

export const WIDGET_PLUGINS: Record<WidgetKind, RegisteredWidgetPlugin> = {
  text: textPlugin,
  heading: textPlugin,
  "shape-rect": shapeRectPlugin,
  "shape-circle": shapeCirclePlugin,
  divider: dividerPlugin,
  image: imagePlugin,
  video: videoPlugin,
  webcam: webcamPlugin,
  chart: chartPlugin,
  chips: chipsPlugin,
  cta: ctaPlugin,
  "linked-content": linkedContentPlugin,
  "engagement-asset": engagementAssetPlugin,
  "speech-bubble": speechBubblePlugin,
  "caption-box": captionBoxPlugin,
  "sfx-burst": sfxBurstPlugin,
  avatar: avatarPlugin,
  "brand-kit": brandKitPlugin,
};

export function pluginForWidgetKind(kind: WidgetKind): RegisteredWidgetPlugin {
  return WIDGET_PLUGINS[kind];
}

/** Each plugin once (text + heading share one). */
export const UNIQUE_WIDGET_PLUGINS: ReadonlyArray<RegisteredWidgetPlugin> = [...new Set(Object.values(WIDGET_PLUGINS))];

const BY_EFFECT_KIND = new Map(UNIQUE_WIDGET_PLUGINS.map((p) => [p.effectKind, p]));

export function pluginForEffectKind(effectKind: string): RegisteredWidgetPlugin | null {
  return BY_EFFECT_KIND.get(effectKind) ?? null;
}

/** Clip param carrying the project font for the export painter. */
export const PROJECT_FONT_PARAM = "projectFont";

/** Clip param an export stamps on every widget clip (`withExportTarget`).
 *  Absent = interactive, so a saved Timeline never carries it. */
export const RENDER_TARGET_PARAM = "renderTarget";

/** The render context a `canvas-v2:*` clip carries (project font + target). */
export function renderContextFromParams(params: Record<string, unknown>): RenderContext {
  return {
    fontFamily: stringOr(params[PROJECT_FONT_PARAM], "") || fontFamilyFor(null),
    target: params[RENDER_TARGET_PARAM] === "export" ? "export" : "interactive",
  };
}
