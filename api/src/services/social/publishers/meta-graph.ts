/**
 * Shared Meta Graph API plumbing for the Instagram and Facebook adapters:
 * the versioned base URL, the batch GET used by their view readers, and the
 * lifetime-insight parser both platforms' insight edges share.
 */
import { readJson, type FetchLike } from "./http.js";

export const GRAPH = "https://graph.facebook.com/v21.0";
const BATCH_MAX = 50;

/**
 * GET many relative URLs in one Graph batch call per 50. Each item answers on
 * its own, so one deleted post fails alone instead of failing the whole read.
 * Returns the parsed body per URL, or null for an item that failed.
 */
export async function graphBatchGet<T>(http: FetchLike, accessToken: string, relativeUrls: string[]): Promise<Array<T | null>> {
  const out: Array<T | null> = [];
  for (let i = 0; i < relativeUrls.length; i += BATCH_MAX) {
    const slice = relativeUrls.slice(i, i + BATCH_MAX);
    const form = new URLSearchParams({
      access_token: accessToken,
      batch: JSON.stringify(slice.map((relative_url) => ({ method: "GET", relative_url }))),
    });
    const items = await readJson<Array<{ code?: number; body?: string } | null>>(
      await http(`${GRAPH}/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }),
      "Graph batch",
    );
    slice.forEach((_, j) => {
      const item = items[j];
      if (!item || item.code !== 200 || !item.body) return void out.push(null);
      try {
        out.push(JSON.parse(item.body) as T);
      } catch {
        out.push(null);
      }
    });
  }
  return out;
}

export interface GraphInsights {
  data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
}

/** The lifetime value of `metric` from an insights edge, or null if absent. */
export function lifetimeInsight(body: GraphInsights | null, metric: string): number | null {
  const value = body?.data?.find((d) => d.name === metric)?.values?.[0]?.value;
  return typeof value === "number" ? value : null;
}

/** Batch-read one lifetime insight for many objects into an id → value map. */
export async function readLifetimeInsight(
  http: FetchLike,
  accessToken: string,
  ids: string[],
  edge: (id: string) => string,
  metric: string,
): Promise<Map<string, number>> {
  const bodies = await graphBatchGet<GraphInsights>(http, accessToken, ids.map(edge));
  const views = new Map<string, number>();
  ids.forEach((id, i) => {
    const value = lifetimeInsight(bodies[i], metric);
    if (value !== null) views.set(id, value);
  });
  return views;
}
