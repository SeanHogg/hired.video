/**
 * Engagement-asset plugin — a lead form, chapter marker, thumbnail stamp or
 * review pin bound to the project. The DOM mounts the live card
 * (EngagementAssetBody, an `embed` op); the export paints the same card's
 * chrome: colours, a hairline ring, an accent strip, the kind's localized
 * label and the bound asset's title (preloaded — see
 * lib/timeline/effects/engagement-asset.ts).
 */
import type { EngagementAssetWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_ENGAGEMENT_ASSET_COLORS, getEngagementAssetMeta } from "@/lib/studio/editor-v2/engagement-assets";
import {
  ENGAGEMENT_ASSET_EFFECT,
  boundEngagementAsset,
  emitEngagementAssetParams,
  parseEngagementAssetParams,
} from "../engagement-asset-params";
import type { Box } from "../frame";
import { registerPlugin } from "../plugin";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, type TextStyle } from "../text-layout";
import { fitOneLine } from "./shared";

type EngagementParams = Extract<WidgetParams, { data: EngagementAssetWidgetParams }>;

/** The hairline ring's opacity over the text colour. */
const RING_ALPHA = 0.25;
const CARD_FONT = "system-ui, sans-serif";

export function engagementCardOps(data: EngagementAssetWidgetParams, content: Box, env: DrawEnv): DrawOp[] {
  const { x, y, w, h } = content;
  const bg = data.bgColor || DEFAULT_ENGAGEMENT_ASSET_COLORS.bgColor;
  const fg = data.textColor || DEFAULT_ENGAGEMENT_ASSET_COLORS.textColor;
  const accent = data.accentColor || DEFAULT_ENGAGEMENT_ASSET_COLORS.accentColor;
  const radius = Math.min(8, w / 8, h / 8);
  const pad = Math.max(8, Math.min(w, h) * 0.08);
  const labelPx = Math.max(10, Math.min(16, h * 0.1));
  const labelFont: TextStyle = { fontPx: labelPx, fontWeight: 600, fontFamily: CARD_FONT };
  const label = env.t(getEngagementAssetMeta(data.assetKind).labelKey);
  const ops: DrawOp[] = [
    { op: "rect", box: content, radius, fill: bg },
    { op: "rect", box: content, radius, stroke: { color: fg, width: 1 }, alpha: RING_ALPHA },
    { op: "rect", box: { x, y, w, h: Math.max(3, h * 0.04) }, fill: accent },
    {
      op: "text",
      text: fitOneLine(label, w - pad * 2, env.measure(fontShorthand(labelFont))),
      x: x + pad,
      y: y + pad + 4 + labelPx / 2,
      font: labelFont,
      color: fg,
      align: "left",
    },
  ];
  const title = data.assetId ? env.lookups.engagementTitle(data.assetKind, data.assetId) : "";
  if (title) {
    const titlePx = Math.max(11, Math.min(22, h * 0.14));
    const titleFont: TextStyle = { fontPx: titlePx, fontWeight: "bold", fontFamily: CARD_FONT };
    ops.push({
      op: "text",
      text: fitOneLine(title, w - pad * 2, env.measure(fontShorthand(titleFont))),
      x: x + pad,
      y: y + pad + 4 + labelPx * 1.6 + titlePx / 2,
      font: titleFont,
      color: fg,
      align: "left",
    });
  }
  return ops;
}

export const engagementAssetPlugin = registerPlugin<EngagementParams>({
  effectKind: ENGAGEMENT_ASSET_EFFECT,
  widgetKinds: ["engagement-asset"],
  meta: {
    labelKey: "studio.effects.kind.engagementAsset",
    category: "title",
    defaults: { x: 0.1, y: 0.1, width: 0.4, height: 0.3, assetKind: "video-form", assetId: "" },
  },
  emit: (p) => emitEngagementAssetParams(p.data),
  parse: (raw) => ({ kind: "engagement-asset", data: parseEngagementAssetParams(raw) }),
  draw: ({ data }, content, env) => [
    { op: "embed", embed: "engagement-asset", box: content, fallback: engagementCardOps(data, content, env) },
  ],
  interactions: (clip) => {
    const bound = boundEngagementAsset(clip);
    return bound ? [{ kind: "engagement", ...bound }] : [];
  },
});
