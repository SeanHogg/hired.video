/**
 * The engagement-asset widget's clip-effect params (pure) — ONE shape the
 * timeline emitter writes, the reader parses back and the export painter
 * (lib/timeline/effects/engagement-asset.ts) reads. React-free.
 */
import type { EngagementAssetWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { isEngagementAssetKind, type EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";

export const ENGAGEMENT_ASSET_EFFECT = "canvas-v2:engagement-asset";

/** Widget data → the effect's own params (the rect rides beside them). */
export function emitEngagementAssetParams(data: EngagementAssetWidgetParams): Record<string, unknown> {
  return {
    assetKind: data.assetKind,
    assetId: data.assetId,
    ...(data.bgColor !== undefined ? { bgColor: data.bgColor } : {}),
    ...(data.textColor !== undefined ? { textColor: data.textColor } : {}),
    ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
    ...(data.accentTextColor !== undefined ? { accentTextColor: data.accentTextColor } : {}),
  };
}

/** Effect params → widget data (a malformed blob reads as an unbound form). */
export function parseEngagementAssetParams(params: Record<string, unknown>): EngagementAssetWidgetParams {
  const kind = typeof params.assetKind === "string" && isEngagementAssetKind(params.assetKind) ? params.assetKind : "video-form";
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    assetKind: kind,
    assetId: str(params.assetId) ?? "",
    ...(str(params.bgColor) !== undefined ? { bgColor: str(params.bgColor) } : {}),
    ...(str(params.textColor) !== undefined ? { textColor: str(params.textColor) } : {}),
    ...(str(params.accentColor) !== undefined ? { accentColor: str(params.accentColor) } : {}),
    ...(str(params.accentTextColor) !== undefined ? { accentTextColor: str(params.accentTextColor) } : {}),
  };
}

/** The asset an engagement effect is bound to, or null when it is unbound
 *  (`assetId === ""`) or names an unknown kind — such a widget has nothing
 *  to interact with during playback. Strict, unlike `parse…` (which reads a
 *  malformed blob as an unbound form so the editor can still open it). */
export function boundEngagementAsset(
  params: Record<string, unknown>,
): { assetKind: EngagementAssetKind; assetId: string } | null {
  const kind = params.assetKind;
  const assetId = typeof params.assetId === "string" ? params.assetId : "";
  if (typeof kind !== "string" || !isEngagementAssetKind(kind) || !assetId) return null;
  return { assetKind: kind, assetId };
}
