/**
 * Engagement-asset titles for the export painter. An engagement-asset widget
 * (a lead form, chapter marker, thumbnail stamp or review pin bound to the
 * project) is painted by its plugin (lib/studio/widgets/plugins/
 * engagement-asset.ts), which reads the bound asset's title synchronously
 * through `cachedEngagementTitle`.
 *
 * Titles are project data: `preloadEngagementTitles` fetches them before
 * painting. It is part of the render prep of BOTH export paths — the document
 * rasterizer (rasterize-overlays.ts) and every canvas video render
 * (publish-render.ts `renderCanvasToBlob`) — and refreshes each referenced
 * asset on every call, so a renamed (or deleted) asset repaints correctly.
 */
import type { Timeline } from "@shared/timeline";
import { ENGAGEMENT_ASSET_EFFECT } from "@/lib/studio/widgets/engagement-asset-params";
import {
  getEngagementAssetMeta,
  isEngagementAssetKind,
  type EngagementAssetKind,
} from "@/lib/studio/editor-v2/engagement-assets";

export { ENGAGEMENT_ASSET_EFFECT };

/** Asset titles by `kind:id` (asset ids are globally unique). */
const titles = new Map<string, string>();
const titleKey = (kind: string, id: string) => `${kind}:${id}`;

/** The bound engagement assets a timeline paints (kind → ids). */
export function engagementAssetRefs(timeline: Timeline): Map<EngagementAssetKind, Set<string>> {
  const refs = new Map<EngagementAssetKind, Set<string>>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects ?? []) {
        if (effect.kind !== ENGAGEMENT_ASSET_EFFECT) continue;
        const kind = effect.params.assetKind;
        const id = effect.params.assetId;
        if (typeof kind !== "string" || !isEngagementAssetKind(kind) || typeof id !== "string" || !id) continue;
        const ids = refs.get(kind) ?? new Set<string>();
        ids.add(id);
        refs.set(kind, ids);
      }
    }
  }
  return refs;
}

/** Fetch the titles of the project's assets the timeline binds (best
 *  effort). Every referenced asset's entry is replaced — set from the fresh
 *  listing, dropped when the asset is gone — so renames repaint. A kind
 *  whose listing fails keeps what it had. */
export async function preloadEngagementTitles(projectId: string | null | undefined, timeline: Timeline): Promise<void> {
  if (!projectId) return;
  const refs = engagementAssetRefs(timeline);
  await Promise.all(
    [...refs].map(async ([kind, ids]) => {
      let rows: Array<{ id: string; title: string }>;
      try {
        rows = await getEngagementAssetMeta(kind).listForProject(projectId);
      } catch {
        return;
      }
      const fresh = new Map(rows.map((r) => [r.id, r.title]));
      for (const id of ids) {
        const title = fresh.get(id);
        if (title) titles.set(titleKey(kind, id), title);
        else titles.delete(titleKey(kind, id));
      }
    }),
  );
}

/** A bound asset's preloaded title ("" until preloaded / when gone). */
export function cachedEngagementTitle(kind: EngagementAssetKind, id: string): string {
  return titles.get(titleKey(kind, id)) ?? "";
}
