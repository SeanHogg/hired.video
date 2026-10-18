// Stock media search / pick (gap #128) — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";
import type {
  StockMediaType,
  StockPickResult,
  StockRecentItem,
  StockSearchResponse,
  StockSearchResult,
} from "./engagement-types";

export async function searchStockMedia(params: {
  q: string;
  type?: StockMediaType;
  page?: number;
  perPage?: number;
}): Promise<StockSearchResponse> {
  const qs = new URLSearchParams({ q: params.q });
  if (params.type) qs.set("type", params.type);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("perPage", String(params.perPage));
  const res = await apiClient.get<StockSearchResponse>(`/api/studio/stock/search?${qs.toString()}`);
  return res.data;
}

export async function pickStockMedia(item: StockSearchResult & {
  projectId?: string;
  sceneId?: string;
}): Promise<StockPickResult> {
  const res = await apiClient.post<StockPickResult>("/api/studio/stock/pick", {
    provider: item.provider,
    providerAssetId: item.providerAssetId,
    downloadUrl: item.downloadUrl,
    mediaType: item.mediaType,
    title: item.title,
    description: item.description,
    author: item.author,
    authorUrl: item.authorUrl,
    licence: item.licence,
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    tags: item.tags,
    projectId: item.projectId,
    sceneId: item.sceneId,
  });
  return res.data;
}

export async function getRecentStockMedia(limit = 20): Promise<StockRecentItem[]> {
  const res = await apiClient.get<{ recent: StockRecentItem[] }>(`/api/studio/stock/recent?limit=${limit}`);
  return res.data.recent;
}

export async function getStockMediaStats(): Promise<{
  totalPicks: number;
  uniqueAssetCount: number;
  actualBytes: number;
  naiveBytes: number;
  bytesSaved: number;
}> {
  const res = await apiClient.get<{
    totalPicks: number;
    uniqueAssetCount: number;
    actualBytes: number;
    naiveBytes: number;
    bytesSaved: number;
  }>("/api/studio/stock/stats");
  return res.data;
}
