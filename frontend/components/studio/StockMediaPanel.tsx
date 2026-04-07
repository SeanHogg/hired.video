"use client";

/**
 * StockMediaPanel — searchable, deduplicated stock media browser (gap #128).
 *
 * Search results stream live from Unsplash / Pexels / Pixabay via the
 * `/api/studio/stock/search` aggregator. Nothing is downloaded to R2 until
 * the user clicks "Use" — at which point the backend hashes the bytes and
 * either returns an existing R2 object (dedup hit) or PUTs a new one.
 *
 * The panel shows a green "deduped" badge when a pick reused an existing
 * asset, surfacing storage savings to the user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, ImageIcon, Film, Check, Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  searchStockMedia,
  pickStockMedia,
  getRecentStockMedia,
  type StockSearchResult,
  type StockMediaType,
  type StockPickResult,
  type StockRecentItem,
} from "@/lib/services/studio-features-service";

interface StockMediaPanelProps {
  projectId?: string;
  sceneId?: string;
  /** Called once a pick is finalised — receives the CDN URL ready to drop into a scene. */
  onPick?: (result: StockPickResult) => void;
}

const TYPE_OPTIONS: Array<{ value: StockMediaType; label: string; icon: typeof ImageIcon }> = [
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "video", label: "Video",  icon: Film },
];

export default function StockMediaPanel({ projectId, sceneId, onPick }: StockMediaPanelProps) {
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<StockMediaType>("image");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [recent, setRecent] = useState<StockRecentItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<StockPickResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recently-used assets on mount.
  useEffect(() => {
    getRecentStockMedia(12).then(setRecent).catch(() => {});
  }, []);

  const runSearch = useCallback(async (q: string, type: StockMediaType) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const res = await searchStockMedia({ q, type, perPage: 24 });
      setResults(res.results);
    } catch (err: any) {
      setError(err?.message ?? "Search failed");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on query / type change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, mediaType), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mediaType, runSearch]);

  const handlePick = useCallback(async (item: StockSearchResult) => {
    const key = `${item.provider}:${item.providerAssetId}`;
    setPickingKey(key);
    setError(null);
    try {
      const result = await pickStockMedia({ ...item, projectId, sceneId });
      setLastPick(result);
      onPick?.(result);
      // Refresh recents so the just-picked asset shows up immediately.
      getRecentStockMedia(12).then(setRecent).catch(() => {});
    } catch (err: any) {
      setError(err?.message ?? "Failed to add asset");
    } finally {
      setPickingKey(null);
    }
  }, [projectId, sceneId, onPick]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Unsplash, Pexels, Pixabay…"
          className="h-8 text-xs pl-7"
        />
      </div>

      {/* Media type toggle */}
      <div className="flex gap-1">
        {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mediaType === value ? "default" : "outline"}
            className="h-7 text-[11px] flex-1"
            onClick={() => setMediaType(value)}
          >
            <Icon className="w-3 h-3 mr-1" /> {label}
          </Button>
        ))}
      </div>

      {/* Last pick feedback */}
      {lastPick && (
        <div className="rounded-md border border-green-500/40 bg-green-500/5 px-2 py-1.5 text-[11px] flex items-center gap-1.5">
          <Check className="w-3 h-3 text-green-600" />
          <span className="font-medium">Added.</span>
          {lastPick.dedup !== "fresh" && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-green-500/40 text-green-700">
              <Recycle className="w-2.5 h-2.5" />
              deduped · saved {(lastPick.storageBytesSaved / 1024).toFixed(0)} KB
            </Badge>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {/* Search results grid */}
      <div className="min-h-[80px]">
        {isSearching ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            {results.map((item) => {
              const key = `${item.provider}:${item.providerAssetId}`;
              const isPicking = pickingKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPicking}
                  onClick={() => handlePick(item)}
                  title={`${item.title ?? ""} · ${item.author ?? ""} (${item.licence})`}
                  className="group relative aspect-square rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title ?? ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {item.mediaType === "video" && (
                    <Film className="absolute top-1 right-1 w-3 h-3 text-white drop-shadow" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    {isPicking ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-white font-medium">
                        Use
                      </span>
                    )}
                  </div>
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] text-white/90 bg-black/50 px-1 leading-tight truncate">
                    {item.provider}
                  </span>
                </button>
              );
            })}
          </div>
        ) : query.trim() ? (
          <div className="text-[11px] text-muted-foreground text-center py-4">
            No results.
          </div>
        ) : null}
      </div>

      {/* Recently used */}
      {!query.trim() && recent.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
            Recently used
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {recent.map((r) => (
              <div
                key={r.hash}
                title={`${r.title ?? ""} · ${r.author ?? ""} (${r.licence ?? ""})`}
                className="relative aspect-square rounded-md overflow-hidden border border-border"
              >
                {r.cdnUrl && (
                  <img src={r.cdnUrl} alt={r.title ?? ""} className="w-full h-full object-cover" loading="lazy" />
                )}
                {r.mediaType === "video" && (
                  <Film className="absolute top-1 right-1 w-3 h-3 text-white drop-shadow" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
