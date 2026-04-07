/**
 * Stock Media Service — gap #128.
 *
 * Three-provider search aggregator with content-addressed, deduplicated
 * R2 caching. Search results stream live from provider APIs (no R2 hit).
 * Only when a user actually picks an asset is the file downloaded once,
 * hashed, and stored at `stock/<sha256>.<ext>`. Subsequent picks of the
 * same asset (by anyone) reuse the existing R2 object — see
 * `stockMediaAssets` (hash PK) + `userStockMediaUsage` (per-user join).
 */

export type StockProvider = "unsplash" | "pexels" | "pixabay";
export type StockMediaType = "image" | "video" | "audio";

export interface StockSearchResult {
  provider: StockProvider;
  providerAssetId: string;
  mediaType: StockMediaType;
  thumbnailUrl: string;
  previewUrl: string;          // medium-quality preview shown in the picker
  downloadUrl: string;         // high-res URL we will fetch on pick
  width?: number;
  height?: number;
  durationMs?: number;
  title?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  licence: string;
  tags?: string[];
}

export interface StockSearchParams {
  query: string;
  mediaType?: StockMediaType;
  page?: number;
  perPage?: number;
}

export interface StockSearchResponse {
  results: StockSearchResult[];
  page: number;
  perPage: number;
  totalHits?: number;
}

interface ProviderKeys {
  unsplash?: string;
  pexels?: string;
  pixabay?: string;
}

// ─── Provider: Unsplash (images) ────────────────────────────────────────────
async function searchUnsplash(
  apiKey: string,
  params: StockSearchParams,
): Promise<StockSearchResult[]> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", params.query);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("per_page", String(params.perPage ?? 20));
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${apiKey}`, "Accept-Version": "v1" },
  });
  if (!res.ok) throw new Error(`Unsplash search failed: ${res.status}`);
  const json = (await res.json()) as { results: any[] };

  return (json.results ?? []).map((r): StockSearchResult => ({
    provider: "unsplash",
    providerAssetId: String(r.id),
    mediaType: "image",
    thumbnailUrl: r.urls?.thumb ?? r.urls?.small,
    previewUrl: r.urls?.small ?? r.urls?.regular,
    downloadUrl: r.urls?.full ?? r.urls?.regular,
    width: r.width,
    height: r.height,
    title: r.description ?? r.alt_description ?? undefined,
    description: r.alt_description ?? undefined,
    author: r.user?.name,
    authorUrl: r.user?.links?.html,
    licence: "Unsplash",
    tags: (r.tags ?? []).map((t: any) => t.title).filter(Boolean),
  }));
}

// ─── Provider: Pexels (images + video) ──────────────────────────────────────
async function searchPexels(
  apiKey: string,
  params: StockSearchParams,
): Promise<StockSearchResult[]> {
  const isVideo = params.mediaType === "video";
  const endpoint = isVideo
    ? "https://api.pexels.com/videos/search"
    : "https://api.pexels.com/v1/search";
  const url = new URL(endpoint);
  url.searchParams.set("query", params.query);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("per_page", String(params.perPage ?? 20));

  const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status}`);
  const json = (await res.json()) as any;

  if (isVideo) {
    return (json.videos ?? []).map((v: any): StockSearchResult => {
      const hd = (v.video_files ?? []).find((f: any) => f.quality === "hd")
        ?? (v.video_files ?? [])[0];
      return {
        provider: "pexels",
        providerAssetId: String(v.id),
        mediaType: "video",
        thumbnailUrl: v.image,
        previewUrl: v.image,
        downloadUrl: hd?.link ?? v.url,
        width: v.width,
        height: v.height,
        durationMs: v.duration ? v.duration * 1000 : undefined,
        author: v.user?.name,
        authorUrl: v.user?.url,
        licence: "Pexels",
      };
    });
  }

  return (json.photos ?? []).map((p: any): StockSearchResult => ({
    provider: "pexels",
    providerAssetId: String(p.id),
    mediaType: "image",
    thumbnailUrl: p.src?.tiny ?? p.src?.small,
    previewUrl: p.src?.medium ?? p.src?.large,
    downloadUrl: p.src?.original ?? p.src?.large2x ?? p.src?.large,
    width: p.width,
    height: p.height,
    title: p.alt,
    author: p.photographer,
    authorUrl: p.photographer_url,
    licence: "Pexels",
  }));
}

// ─── Provider: Pixabay (images, video, audio) ───────────────────────────────
async function searchPixabay(
  apiKey: string,
  params: StockSearchParams,
): Promise<StockSearchResult[]> {
  const mt = params.mediaType ?? "image";
  // Pixabay endpoints: /api/ for images, /api/videos/ for video.
  // Audio search not in free public API; skip when audio requested.
  if (mt === "audio") return [];
  const endpoint = mt === "video"
    ? "https://pixabay.com/api/videos/"
    : "https://pixabay.com/api/";
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", params.query);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("per_page", String(Math.min(params.perPage ?? 20, 200)));
  url.searchParams.set("safesearch", "true");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pixabay search failed: ${res.status}`);
  const json = (await res.json()) as { hits: any[] };

  return (json.hits ?? []).map((h: any): StockSearchResult => {
    if (mt === "video") {
      const v = h.videos?.medium ?? h.videos?.small ?? h.videos?.large;
      return {
        provider: "pixabay",
        providerAssetId: String(h.id),
        mediaType: "video",
        thumbnailUrl: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`,
        previewUrl: v?.url,
        downloadUrl: (h.videos?.large ?? v)?.url,
        width: v?.width,
        height: v?.height,
        durationMs: h.duration ? h.duration * 1000 : undefined,
        author: h.user,
        licence: "Pixabay",
        tags: (h.tags ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
      };
    }
    return {
      provider: "pixabay",
      providerAssetId: String(h.id),
      mediaType: "image",
      thumbnailUrl: h.previewURL,
      previewUrl: h.webformatURL,
      downloadUrl: h.largeImageURL ?? h.webformatURL,
      width: h.imageWidth,
      height: h.imageHeight,
      author: h.user,
      licence: "Pixabay",
      tags: (h.tags ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    };
  });
}

// ─── Aggregated search ──────────────────────────────────────────────────────
export async function searchStockMedia(
  keys: ProviderKeys,
  params: StockSearchParams,
): Promise<StockSearchResponse> {
  const mediaType = params.mediaType ?? "image";
  const tasks: Array<Promise<StockSearchResult[]>> = [];

  // Unsplash supports images only.
  if (keys.unsplash && mediaType === "image") {
    tasks.push(searchUnsplash(keys.unsplash, params).catch((e) => {
      console.warn("[stockmedia] unsplash error:", e);
      return [];
    }));
  }
  if (keys.pexels && (mediaType === "image" || mediaType === "video")) {
    tasks.push(searchPexels(keys.pexels, params).catch((e) => {
      console.warn("[stockmedia] pexels error:", e);
      return [];
    }));
  }
  if (keys.pixabay && (mediaType === "image" || mediaType === "video")) {
    tasks.push(searchPixabay(keys.pixabay, params).catch((e) => {
      console.warn("[stockmedia] pixabay error:", e);
      return [];
    }));
  }

  const groups = await Promise.all(tasks);
  // Round-robin interleave so no single provider dominates the first page.
  const interleaved: StockSearchResult[] = [];
  let i = 0;
  while (interleaved.length < (params.perPage ?? 20) * groups.length) {
    let added = false;
    for (const g of groups) {
      if (g[i]) {
        interleaved.push(g[i]);
        added = true;
      }
    }
    if (!added) break;
    i++;
  }

  return {
    results: interleaved.slice(0, (params.perPage ?? 20)),
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
  };
}

// ─── Hashing + extension helpers ────────────────────────────────────────────
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  return "bin";
}

export function mediaTypeFromMime(mime: string): StockMediaType {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "image";
}

export interface FetchedAsset {
  bytes: ArrayBuffer;
  hash: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

/**
 * Download an asset from a provider URL, hash it, and return the bytes
 * + storage key. Caller is responsible for upserting `stockMediaAssets`
 * and skipping the R2 PUT when the row already exists.
 */
export async function fetchAssetForHashing(downloadUrl: string): Promise<FetchedAsset> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Asset download failed: ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const ext = extensionForMime(mimeType);
  return {
    bytes,
    hash,
    mimeType,
    sizeBytes: bytes.byteLength,
    storageKey: `stock/${hash}.${ext}`,
  };
}
