/**
 * Per-widget-kind inspector section registry. Each widget kind declares
 * the sections that show up in the right panel when it's selected.
 * Adding a new widget kind is one entry in `WIDGET_INSPECTOR`; the
 * panel picks it up with no PropertiesPanel edits.
 *
 * Shared sections (Layout, Motion, Timing) apply to every widget and
 * live in `SHARED_TAIL`. Kind-specific Content sections come first so
 * the user lands on the field they're most likely to edit (text body,
 * source URL, fill colour).
 *
 * Section builders live one file per widget family alongside this index.
 */
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import type { WidgetInspectorSection, WidgetSectionCtx } from "../types";
import { LAYOUT_SECTION } from "./position";
import { CONTAINER_STYLE_SECTION, EFFECTS_SECTION } from "./container-style";
import { MOTION_SECTION, TIMING_SECTION } from "./motion-timing";
import { textContentSection } from "./text";
import {
  IMAGE_CONTENT_SECTION,
  VIDEO_CONTENT_SECTION,
  VIDEO_CHROMA_SECTION,
  WIDGET_FILTERS_SECTION,
  WEBCAM_CONTENT_SECTION,
} from "./media";
import {
  shapeContentSection,
  CHART_CONTENT_SECTION,
  DIVIDER_CONTENT_SECTION,
  CHIPS_CONTENT_SECTION,
} from "./shapes-chart-chips";
import { CTA_CONTENT_SECTION, LINKED_CONTENT_SECTION } from "./linked-content";
import {
  SPEECH_BUBBLE_CONTENT_SECTION,
  CAPTION_BOX_CONTENT_SECTION,
  SFX_BURST_CONTENT_SECTION,
} from "./comic";
import { AVATAR_CONTENT_SECTION } from "./presenter";
import { BRAND_CONTENT_SECTION } from "./brand";

const SHARED_TAIL: WidgetInspectorSection[] = [
  CONTAINER_STYLE_SECTION,
  EFFECTS_SECTION,
  MOTION_SECTION,
  TIMING_SECTION,
];

// ───────────────────────────────────────────────────────────────────────────
// Registry — one entry per WidgetKind. The right panel reads this map
// directly so adding a kind is one row here + one row in `WIDGET_CATALOG`.
// ───────────────────────────────────────────────────────────────────────────

export const WIDGET_INSPECTOR: Record<WidgetKind, WidgetInspectorSection[]> = {
  text: [LAYOUT_SECTION, textContentSection("text"), ...SHARED_TAIL],
  heading: [LAYOUT_SECTION, textContentSection("heading"), ...SHARED_TAIL],
  image: [LAYOUT_SECTION, IMAGE_CONTENT_SECTION, WIDGET_FILTERS_SECTION, ...SHARED_TAIL],
  video: [LAYOUT_SECTION, VIDEO_CONTENT_SECTION, VIDEO_CHROMA_SECTION, WIDGET_FILTERS_SECTION, ...SHARED_TAIL],
  "shape-rect": [LAYOUT_SECTION, shapeContentSection("shape-rect"), ...SHARED_TAIL],
  "shape-circle": [LAYOUT_SECTION, shapeContentSection("shape-circle"), ...SHARED_TAIL],
  divider: [LAYOUT_SECTION, DIVIDER_CONTENT_SECTION, ...SHARED_TAIL],
  chart: [LAYOUT_SECTION, CHART_CONTENT_SECTION, ...SHARED_TAIL],
  webcam: [LAYOUT_SECTION, WEBCAM_CONTENT_SECTION, ...SHARED_TAIL],
  chips: [LAYOUT_SECTION, CHIPS_CONTENT_SECTION, ...SHARED_TAIL],
  cta: [LAYOUT_SECTION, CTA_CONTENT_SECTION, ...SHARED_TAIL],
  "linked-content": [LAYOUT_SECTION, LINKED_CONTENT_SECTION, ...SHARED_TAIL],
  // Comic widget primitives (#939 Phase 2 — kind-specific Content
  // sections). Each surfaces the kind's data fields (text + shape
  // picker + per-fill colour + italic toggle + tail anchor) so the
  // user no longer has to drop into the generic effects-params panel
  // to tune a balloon's shape or a caption's italic state.
  "speech-bubble": [LAYOUT_SECTION, SPEECH_BUBBLE_CONTENT_SECTION, ...SHARED_TAIL],
  "caption-box":   [LAYOUT_SECTION, CAPTION_BOX_CONTENT_SECTION, ...SHARED_TAIL],
  "sfx-burst":     [LAYOUT_SECTION, SFX_BURST_CONTENT_SECTION, ...SHARED_TAIL],
  avatar:          [LAYOUT_SECTION, AVATAR_CONTENT_SECTION, ...SHARED_TAIL],
  // Engagement assets (#1579) — bound to a per-project authored
  // artifact (form / chapter / thumbnail / review) via the registry
  // at lib/studio/editor-v2/engagement-assets.ts. Kind-specific
  // content section (rebind to a different asset, theme overrides)
  // is deferred to #1587; today the inspector exposes only layout +
  // the shared tail so the widget is still resizeable / animatable.
  "engagement-asset": [LAYOUT_SECTION, ...SHARED_TAIL],
  "brand-kit": [LAYOUT_SECTION, BRAND_CONTENT_SECTION, ...SHARED_TAIL],
};

export function getWidgetSections(ctx: WidgetSectionCtx): WidgetInspectorSection[] {
  return WIDGET_INSPECTOR[ctx.widget.kind];
}

/** i18n key of each widget kind's display title (inspector header, slot
 *  header, layer-row fallback) — translate with t(). */
export const WIDGET_TITLE_KEYS: Record<WidgetKind, string> = {
  text: "studio.element.text",
  heading: "studio.widget.kind.heading",
  image: "studio.element.image",
  video: "studio.element.video",
  "shape-rect": "studio.effects.kind.rectangle",
  "shape-circle": "studio.effects.kind.circle",
  divider: "studio.effects.kind.divider",
  chart: "studio.effects.kind.chart",
  webcam: "studio.element.webcam",
  chips: "studio.effects.kind.chips",
  cta: "studio.effects.kind.ctaCard",
  "linked-content": "studio.inspector.section.linkedContent",
  "speech-bubble": "studio.effects.kind.speechBubble",
  "caption-box": "studio.effects.kind.captionBox",
  "sfx-burst": "studio.effects.kind.sfxBurst",
  avatar: "studio.widget.kind.aiPresenter",
  "engagement-asset": "studio.effects.kind.engagementAsset",
  "brand-kit": "studio.layout.brandKitsTitle",
};
