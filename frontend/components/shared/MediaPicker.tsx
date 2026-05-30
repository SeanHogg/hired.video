"use client";

/**
 * MediaPicker — the one image/video picker used everywhere across the app.
 *
 * Three tabs in a single dialog: Upload, Stock (Unsplash/Pexels/Pixabay),
 * AI Image. Every consumer (avatar, article cover, company logo, feed post,
 * job hero, studio scene background, …) drops this in instead of rolling
 * its own file input. The picker resolves to a CDN URL regardless of which
 * tab the user used; consumers don't need to know.
 *
 * Visibility / entitlement: per the project's DRY rule, the picker
 * self-gates. Today every authenticated user can use all three tabs — AI
 * Image is metered through the existing token budget (free 50K / Pro 1M),
 * so the upsell happens organically through the 429 path, not by drilling
 * an `isPro` boolean into every consumer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, ImageIcon, Loader2, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import StockMediaPanel from "@/components/studio/StockMediaPanel";
import {
  listMyImages,
  uploadImage,
  uploadVideo,
  type MyImageEntry,
} from "@/lib/services/upload-service";
import { generateImage } from "@/lib/services/image-gen-engine";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";

export interface PickedMedia {
  url: string;
  mediaType: "image" | "video";
  width?: number;
  height?: number;
  source: "upload" | "stock" | "ai";
  attribution?: {
    provider?: string;
    author?: string | null;
    authorUrl?: string | null;
    licence?: string | null;
    sourceUrl?: string | null;
  };
}

export type MediaAccept = "image" | "video" | "image+video";

export interface MediaPickerProps {
  /** Allow image, video, or both. Default "image". */
  accept?: MediaAccept;
  /** Called with the resolved CDN URL when the user finalises a pick. */
  onPick: (asset: PickedMedia) => void;
  /** Custom trigger element. Defaults to a standard Button. Forwarded via DialogTrigger asChild. */
  trigger?: React.ReactNode;
  /** Trigger label when no custom trigger is supplied. Defaults to "Choose image". */
  triggerLabel?: string;
  /** Disables the picker entirely. */
  disabled?: boolean;
  /** Title shown at the top of the dialog. */
  title?: string;
  /** Tab to pre-select on open (#586). Useful for "Regenerate with AI"
   *  callers that want to skip Upload + Stock and land on a specific tab. */
  defaultTab?: "upload" | "library" | "stock" | "ai";
}

const STOCK_HIDDEN_FOR: MediaAccept[] = []; // stock library covers all accept modes

export default function MediaPicker({
  accept = "image",
  onPick,
  trigger,
  triggerLabel,
  disabled,
  title,
  defaultTab,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  // `defaultTab` only sets the initial value — once the user clicks a
  // different tab inside the dialog their choice wins. Re-opens reseed
  // from defaultTab so a caller that targets "ai" never reopens on
  // "upload" without explicit user action.
  const [tab, setTab] = useState<"upload" | "library" | "stock" | "ai">(defaultTab ?? "upload");
  useEffect(() => {
    if (open) setTab(defaultTab ?? "upload");
  }, [open, defaultTab]);

  const handlePick = useCallback(
    (asset: PickedMedia) => {
      onPick(asset);
      setOpen(false);
    },
    [onPick],
  );

  // #585 — Drag-from-result onto canvas. Captures `dragstart` from any
  // child element carrying `data-media-url` (set by per-tab thumb code as
  // it lands), stamps the studio drag-protocol payload, and closes the
  // dialog on `dragend` so the user can see the canvas drop in real time.
  // Per-tab thumbnails opt in by attaching the attribute — no other
  // changes needed in StockMediaPanel / LibraryTab.
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const el = dialogContentRef.current;
    if (!el) return;
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      const node = target?.closest?.("[data-media-url]") as HTMLElement | null;
      if (!node || !e.dataTransfer) return;
      const url = node.getAttribute("data-media-url");
      if (!url) return;
      const mediaType = (node.getAttribute("data-media-type") === "video"
        ? "video"
        : "image") as "image" | "video";
      writeDragPayload(e.dataTransfer, { kind: "media-url", data: url, mediaType });
      e.dataTransfer.effectAllowed = "copy";
    };
    const handleDragEnd = () => {
      // The canvas drop handler in CanvasDropOverlay processes the drop
      // by the time `dragend` fires, so closing here lands the user back
      // on the canvas with the new widget visible.
      setOpen(false);
    };
    el.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("dragend", handleDragEnd, true);
    return () => {
      el.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("dragend", handleDragEnd, true);
    };
  }, [open]);

  const showStock = !STOCK_HIDDEN_FOR.includes(accept);
  const showAI = accept !== "video"; // AI image gen produces images only
  // Library = user's prior R2 image uploads — surfaced for accept modes
  // that accept images (so the Drawing studio's "Save to library" output,
  // and any other prior upload, can be re-picked in Video / Game / Comic
  // projects without manual re-upload). Closed-loop interop (#933).
  const showLibrary = accept !== "video";

  const dialogTitle = title ?? (accept === "video" ? "Choose video" : "Choose media");
  const visibleTabCount =
    1 + (showLibrary ? 1 : 0) + (showStock ? 1 : 0) + (showAI ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <ImageIcon className="h-4 w-4 mr-2" />
            {triggerLabel ?? "Choose image"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl" ref={dialogContentRef}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-2">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleTabCount}, minmax(0, 1fr))` }}>
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
            </TabsTrigger>
            {showLibrary && (
              <TabsTrigger value="library">
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library
              </TabsTrigger>
            )}
            {showStock && (
              <TabsTrigger value="stock">
                <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Stock
              </TabsTrigger>
            )}
            {showAI && (
              <TabsTrigger value="ai">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Image
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="upload" className="mt-3">
            <UploadTab accept={accept} onPick={handlePick} />
          </TabsContent>

          {showLibrary && (
            <TabsContent value="library" className="mt-3 max-h-[60vh] overflow-y-auto">
              <LibraryTab active={tab === "library"} onPick={handlePick} />
            </TabsContent>
          )}

          {showStock && (
            <TabsContent value="stock" className="mt-3 max-h-[60vh] overflow-y-auto">
              <StockMediaPanel
                onPick={(r) => {
                  if (!r.cdnUrl) return;
                  handlePick({
                    url: r.cdnUrl,
                    mediaType: (r.mediaType === "video" ? "video" : "image"),
                    width: r.width ?? undefined,
                    height: r.height ?? undefined,
                    source: "stock",
                    attribution: (r.attribution as PickedMedia["attribution"]) ?? undefined,
                  });
                }}
                onPickRecent={(r) => {
                  if (!r.cdnUrl) return;
                  handlePick({
                    url: r.cdnUrl,
                    mediaType: (r.mediaType === "video" ? "video" : "image"),
                    width: r.width ?? undefined,
                    height: r.height ?? undefined,
                    source: "stock",
                  });
                }}
              />
            </TabsContent>
          )}

          {showAI && (
            <TabsContent value="ai" className="mt-3">
              <AITab onPick={handlePick} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Icon trigger variant ──────────────────────────────────────────────────
//
// Sister component for UrlPickerInput — same picker, square icon button
// trigger so it lines up next to a URL Input. Lives here so the icon
// trigger styling stays paired with the picker it opens.

export interface MediaIconPickerProps {
  accept?: MediaAccept;
  onPick: (url: string, asset: PickedMedia) => void;
  /** Tooltip / aria-label. Defaults match the accept mode. */
  label?: string;
  disabled?: boolean;
  /** Tab to pre-select on open. Passes through to MediaPicker (#586). */
  defaultTab?: "upload" | "library" | "stock" | "ai";
  /** Custom trigger override — bypass the default square Image button.
   *  Useful for inline "Regenerate with AI" affordances (#586). */
  trigger?: React.ReactNode;
}

export function MediaIconPicker({ accept = "image", onPick, label, disabled, defaultTab, trigger }: MediaIconPickerProps) {
  const fallbackLabel =
    accept === "video" ? "Choose video" :
    accept === "image+video" ? "Choose image or video" :
    "Choose image";
  const tooltip = label ?? fallbackLabel;
  return (
    <MediaPicker
      accept={accept}
      onPick={(asset) => onPick(asset.url, asset)}
      disabled={disabled}
      title={tooltip}
      defaultTab={defaultTab}
      trigger={
        trigger ?? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label={tooltip}
            title={tooltip}
            disabled={disabled}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </Button>
        )
      }
    />
  );
}

// ─── Upload tab ─────────────────────────────────────────────────────────────

function UploadTab({ accept, onPick }: { accept: MediaAccept; onPick: (a: PickedMedia) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptAttr =
    accept === "video" ? "video/*" :
    accept === "image+video" ? "image/*,video/*" :
    "image/*";

  const helpText =
    accept === "video" ? "MP4, WebM, MOV" :
    accept === "image+video" ? "Image or video" :
    "PNG, JPG, GIF, WebP";

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (file.type.startsWith("video/")) {
        const r = await uploadVideo(file);
        onPick({ url: r.url, mediaType: "video", source: "upload" });
      } else {
        const url = await uploadImage(file);
        onPick({ url, mediaType: "image", source: "upload" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-4">
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/40 transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Click to choose a file</p>
            <p className="text-xs text-muted-foreground mt-1">{helpText}</p>
          </>
        )}
      </button>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

// ─── Library tab ────────────────────────────────────────────────────────────
//
// Lists the authenticated user's prior R2 image uploads — every drawing
// saved via the DrawingStage "Save to library" action, plus every prior
// MediaPicker upload, shows up here automatically. Closed-loop interop
// per Gap Register #933.
//
// Per the standing DRY rule the panel self-fetches when activated; the
// host doesn't pass anything except the active flag (so we lazy-load
// only when the user clicks the tab — avoids hammering the list
// endpoint on every picker mount).

function LibraryTab({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (a: PickedMedia) => void;
}) {
  const [items, setItems] = useState<MyImageEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || items !== null || busy) return;
    setBusy(true);
    setError(null);
    listMyImages()
      .then((rows) => setItems(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load library"))
      .finally(() => setBusy(false));
  }, [active, items, busy]);

  if (busy && items === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  }
  if (!items || items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <p>No saved images yet.</p>
        <p className="mt-1 text-xs">
          Save a drawing or upload an image; it lands here for re-use across
          every studio kind.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
      {items.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition hover:border-primary"
          onClick={() =>
            onPick({
              url: entry.url,
              mediaType: "image",
              source: "upload",
            })
          }
          title={`${new Date(entry.uploadedAt).toLocaleString()} · ${Math.round(entry.sizeBytes / 1024)}KB`}
        >
          <img
            src={entry.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

// ─── AI Image tab ───────────────────────────────────────────────────────────

function AITab({ onPick }: { onPick: (a: PickedMedia) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      // Routes through the pluggable image-gen engine facade — WebGPU
      // client-side primary (when available), server fallback today.
      // The server engine returns a durable CDN URL (`resultUrl`); the
      // WebGPU engine returns a Blob (no URL — caller would need to
      // upload to R2 if persistence is required). For the MediaPicker
      // the URL is required (it's persisted in Timeline JSONB scenes),
      // so we surface a clear error when only a Blob came back.
      const result = await generateImage({ prompt });
      if (result.resultUrl) {
        onPick({ url: result.resultUrl, mediaType: "image", source: "ai" });
      } else {
        throw new Error("Generated image has no durable URL — upload to R2 not yet wired.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-2 space-y-3">
      <p className="text-xs text-muted-foreground">
        Describe the image and AI will generate it. Each generation deducts ~10K tokens from your budget.
      </p>
      <Input
        autoFocus
        placeholder="A vibrant abstract background with soft purple gradients…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void handleGenerate(); }}
        disabled={busy}
      />
      <Button onClick={handleGenerate} disabled={busy || prompt.trim().length < 3} className="w-full">
        {busy ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
        ) : (
          <><Sparkles className="h-4 w-4 mr-2" /> Generate image</>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
