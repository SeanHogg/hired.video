/**
 * Media stored by library id (`source: { kind: "sourceId" }` on an image or
 * video element) → its URL, from the studio media library the editor's bin
 * reads (GET /api/nle/sources). One lookup for every id an export needs.
 */
import type { Widget } from "@/lib/studio/editor-v2/canvas-state";
import { nleApi } from "@/lib/timeline/api";

/** The library ids the widgets' media reference. */
export function mediaSourceIds(widgets: readonly Widget[]): string[] {
  const ids = new Set<string>();
  for (const w of widgets) {
    const p = w.params;
    if ((p.kind === "image" || p.kind === "video") && p.data.source.kind === "sourceId" && p.data.source.id) ids.add(p.data.source.id);
  }
  return [...ids];
}

/** The widgets with every library id they could resolve swapped for a URL. */
export function withMediaUrls(widgets: readonly Widget[], urls: ReadonlyMap<string, string>): Widget[] {
  return widgets.map((w) => {
    const p = w.params;
    if ((p.kind !== "image" && p.kind !== "video") || p.data.source.kind !== "sourceId") return w;
    const url = urls.get(p.data.source.id);
    if (!url) return w;
    const source = { kind: "url" as const, url };
    return p.kind === "image"
      ? { ...w, params: { ...p, data: { ...p.data, source } } }
      : { ...w, params: { ...p, data: { ...p.data, source } } };
  });
}

/** Resolve the widgets' library media to URLs (unknown ids stay as they are). */
export async function resolveMediaSources(widgets: readonly Widget[]): Promise<Widget[]> {
  const ids = mediaSourceIds(widgets);
  if (ids.length === 0) return [...widgets];
  const res = await nleApi.listSources().catch(() => null);
  const wanted = new Set(ids);
  const urls = new Map<string, string>();
  for (const s of res?.sources ?? []) if (wanted.has(s.id) && s.url) urls.set(s.id, s.url);
  return withMediaUrls(widgets, urls);
}
