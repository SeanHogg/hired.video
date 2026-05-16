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

import { useCallback, useRef, useState } from "react";
import { ImageIcon, Loader2, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import StockMediaPanel from "@/components/studio/StockMediaPanel";
import { uploadImage, uploadVideo } from "@/lib/services/upload-service";
import { studioService } from "@/lib/services/studio-service";

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
}

const STOCK_HIDDEN_FOR: MediaAccept[] = []; // stock library covers all accept modes

export default function MediaPicker({
  accept = "image",
  onPick,
  trigger,
  triggerLabel,
  disabled,
  title,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"upload" | "stock" | "ai">("upload");

  const handlePick = useCallback(
    (asset: PickedMedia) => {
      onPick(asset);
      setOpen(false);
    },
    [onPick],
  );

  const showStock = !STOCK_HIDDEN_FOR.includes(accept);
  const showAI = accept !== "video"; // AI image gen produces images only

  const dialogTitle = title ?? (accept === "video" ? "Choose video" : "Choose media");

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

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-2">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${1 + (showStock ? 1 : 0) + (showAI ? 1 : 0)}, minmax(0, 1fr))` }}>
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
            </TabsTrigger>
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
}

export function MediaIconPicker({ accept = "image", onPick, label, disabled }: MediaIconPickerProps) {
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
      trigger={
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
      const res = await studioService.generateImage(prompt.trim());
      const url = res.data?.imageUrl;
      if (url) onPick({ url, mediaType: "image", source: "ai" });
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
