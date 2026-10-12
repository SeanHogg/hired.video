/**
 * MediaPicker "Library" tab (#933 / #950) — the signed-in user's own images
 * (uploads, saved drawings, AI generations), newest first.
 *
 * Reads `GET /api/upload/images` a page at a time (`uploaded_assets`, #733)
 * and loads the next page when the sentinel under the grid scrolls into
 * view, so a prolific creator's whole library is reachable. Each tile shows
 * its dimensions, size and upload date, and marks AI images and images made
 * in a studio project.
 *
 * Self-fetching: the host only says whether the tab is active, so the list
 * endpoint is hit only when the user opens the tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyAssetPage } from "@/lib/services/upload-service";
import type { UploadedAssetItem } from "@shared/uploaded-assets";
import type { PickedMedia } from "./MediaPicker";

const PAGE_SIZE = 40;

interface LibraryState {
  items: UploadedAssetItem[];
  nextCursor: string | null;
  /** True once the first page has arrived. */
  loaded: boolean;
  loading: boolean;
  error: boolean;
}

const INITIAL: LibraryState = { items: [], nextCursor: null, loaded: false, loading: false, error: false };

/** Cursor-paged library loader. `loadMore` is a no-op while a page is in
 *  flight or after the last page. */
function useMediaLibrary(active: boolean) {
  const [state, setState] = useState<LibraryState>(INITIAL);
  const inFlight = useRef(false);
  // Latest state for the async loader (setState updaters run later).
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (inFlight.current || (current.loaded && !current.nextCursor)) return;
    const cursor = current.nextCursor;
    setState((s) => ({ ...s, loading: true, error: false }));
    inFlight.current = true;
    try {
      const page = await listMyAssetPage({ cursor, limit: PAGE_SIZE, kind: "images" });
      setState((s) => {
        const seen = new Set(s.items.map((i) => i.id));
        return {
          items: [...s.items, ...page.items.filter((i) => !seen.has(i.id))],
          nextCursor: page.nextCursor,
          loaded: true,
          loading: false,
          error: false,
        };
      });
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (active && !state.loaded && !state.loading && !state.error) void loadMore();
  }, [active, state.loaded, state.loading, state.error, loadMore]);

  return { ...state, hasMore: !state.loaded || state.nextCursor !== null, loadMore };
}

function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value);
}

export default function MediaPickerLibrary({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (a: PickedMedia) => void;
}) {
  const { t, i18n } = useTranslation();
  const { items, loaded, loading, error, hasMore, loadMore } = useMediaLibrary(active);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load the next page as the sentinel nears the bottom of the scroll area.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !active || !loaded || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, loaded, hasMore, loadMore, items.length]);

  if (!loaded && loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t("mediaPicker.library.loading")}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!loaded && error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center text-sm">
        <p className="text-destructive">{t("mediaPicker.library.loadFailed")}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()}>
          {t("mediaPicker.library.retry")}
        </Button>
      </div>
    );
  }
  if (loaded && items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <p>{t("mediaPicker.library.emptyTitle")}</p>
        <p className="mt-1 text-xs">{t("mediaPicker.library.emptyBody")}</p>
      </div>
    );
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  return (
    <div className="py-2">
      <ul className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:grid-cols-4">
        {items.map((asset) => {
          const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;
          const size = formatBytes(asset.sizeBytes, i18n.language);
          const date = dateFormat.format(new Date(asset.uploadedAt));
          const isAi = asset.kind === "ai_image";
          const label = [
            isAi ? t("mediaPicker.library.aiImage") : t("mediaPicker.library.uploadedImage"),
            dims,
            size,
            t("mediaPicker.library.uploadedOn", { date }),
            asset.sourceProjectId ? t("mediaPicker.library.fromProject") : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={asset.id} className="min-w-0">
              <button
                type="button"
                className="group block w-full overflow-hidden rounded-md border border-border bg-muted text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  onPick({
                    url: asset.url,
                    mediaType: "image",
                    source: isAi ? "ai" : "upload",
                    ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
                  })
                }
                aria-label={label}
                title={label}
              >
                <span className="relative block aspect-square">
                  <img src={asset.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {(isAi || asset.sourceProjectId) && (
                    <span className="absolute left-1 top-1 flex gap-1">
                      {isAi && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-background/85 px-1 py-0.5 text-[10px] font-medium text-foreground">
                          <Sparkles className="h-3 w-3" aria-hidden />
                          {t("mediaPicker.library.aiBadge")}
                        </span>
                      )}
                      {asset.sourceProjectId && (
                        <span className="inline-flex items-center rounded bg-background/85 p-0.5 text-foreground">
                          <Clapperboard className="h-3 w-3" aria-hidden />
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="block space-y-0.5 bg-background px-1.5 py-1 text-[11px] leading-tight text-muted-foreground">
                  <span className="block truncate tabular-nums">{dims ? `${dims} · ${size}` : size}</span>
                  <span className="block truncate">{date}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div ref={sentinelRef} className="h-1" aria-hidden />
      {loading && (
        <div className="flex justify-center py-3" role="status" aria-label={t("mediaPicker.library.loadingMore")}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
      {error && loaded && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs">
          <span className="text-destructive">{t("mediaPicker.library.loadMoreFailed")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()}>
            {t("mediaPicker.library.retry")}
          </Button>
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {t("mediaPicker.library.end", { count: items.length })}
        </p>
      )}
    </div>
  );
}
