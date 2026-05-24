/**
 * MediaAiPromptPanel — the single AI-prompt UI for every studio kind
 * (drawing / game / animation / timeline) AND the CHRO Brain.
 *
 * Promoted from the drawing-only `DrawingAiPromptPanel` per the
 * cross-studio first-class image-AI rollout. The panel does NOT know
 * about layers, sprites, frames, scene widgets, or media library — it
 * just collects a prompt, calls the shared `useMediaAiPrompt` hook, and
 * hands the result to `onGenerated`. The host decides what to do with
 * the bytes.
 *
 * Selection-aware UX:
 *   • When `sourceImageUrl` is supplied (the host has a selected
 *     element with an image), the engine runs in img→img mode — the
 *     prompt rewrites that image. The button label changes to "Update"
 *     and the helper line names the selection.
 *   • When omitted, text→img: the button reads "Generate" and the
 *     helper line says "Add new <kindNoun>" so the user knows the
 *     result will land as a fresh element on the canvas.
 *
 * Drawing-specific knobs (replace-active-layer toggle, transparent BG)
 * are NOT in this generic panel — the drawing host wraps this panel and
 * surfaces those on top. Keeps the generic panel slim for every other
 * kind that doesn't need them.
 */

import { Sparkles, Loader2, History, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaAiPrompt } from "@/lib/hooks/use-media-ai-prompt";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";

export interface MediaAiPromptHistoryEntry {
  id: string;
  prompt: string;
}

export interface MediaAiPromptPanelProps {
  /** Recent prompts for one-click re-use. The drawing surface persists
   *  these on `ImageState.aiPromptHistory`; other surfaces can keep an
   *  in-memory list or pass `[]` to hide the history popover. */
  history?: ReadonlyArray<MediaAiPromptHistoryEntry>;
  /** Called when generation finishes — the host inserts the image into
   *  its own state shape (layer / sprite / frame / widget / library). */
  onGenerated: (result: ImageGenResult, prompt: string) => void | Promise<void>;
  /** When set, the engine runs img→img — the prompt rewrites this
   *  image. Caller supplies a public CDN URL. When omitted, text→img. */
  sourceImageUrl?: string;
  /** Alternative source for in-memory rasters (e.g. a drawing layer's
   *  pixelsDataUrl, an animation frame). Used when nothing on the
   *  client side has uploaded the selection to R2 yet. Ignored when
   *  `sourceImageUrl` is also set. */
  sourceImageDataUrl?: string;
  /** Singular noun for the kind of asset created in text→img mode —
   *  e.g. "layer", "sprite", "frame", "widget", "image". Surfaces in
   *  the helper line ("Add new layer"). */
  kindNoun?: string;
  /** Short label naming the selected element when `sourceImageUrl` is
   *  set — e.g. "Layer 2", "Sprite: Hero". Used in the helper line so
   *  the user sees what they're about to update. */
  selectionLabel?: string;
  /** Optional placeholder override. Defaults to a generic prompt
   *  example; the drawing/game/animation hosts can supply kind-flavored
   *  examples. */
  placeholder?: string;
  /** When true, render the panel chrome compact — no top border, no
   *  ALL-CAPS heading. Used by the floating selection chip's popover
   *  and the Brain inline popover, where the wrapping element already
   *  provides chrome. Default false (full chrome — right-rail use). */
  compact?: boolean;
}

const DEFAULT_PLACEHOLDER = "A watercolor sketch of mountains at dawn…";

export default function MediaAiPromptPanel({
  history = [],
  onGenerated,
  sourceImageUrl,
  sourceImageDataUrl,
  kindNoun = "image",
  selectionLabel,
  placeholder = DEFAULT_PLACEHOLDER,
  compact = false,
}: MediaAiPromptPanelProps) {
  const { prompt, setPrompt, busy, error, progress, submit } =
    useMediaAiPrompt({ onGenerated });

  const isEditing = !!(sourceImageUrl || sourceImageDataUrl);
  const submitExtra = sourceImageUrl
    ? { sourceImageUrl }
    : sourceImageDataUrl
      ? { sourceImageDataUrl }
      : undefined;
  const helperText = isEditing
    ? `Update ${selectionLabel ?? `selected ${kindNoun}`}`
    : `Add new ${kindNoun}`;

  return (
    <div
      className={
        compact
          ? "bg-background p-3"
          : "border-t bg-background p-3"
      }
    >
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            AI Prompt
          </p>
          {history.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Recent prompts"
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Recent prompts</TooltipContent>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <p className="mb-1 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recent
                </p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {history.slice(-15).reverse().map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => setPrompt(entry.prompt)}
                      title={entry.prompt}
                    >
                      {entry.prompt}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none text-sm"
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit(submitExtra);
          }
        }}
      />
      {error && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
          {helperText} · ~10K tokens
        </p>
        <Button
          size="sm"
          onClick={() => void submit(submitExtra)}
          disabled={busy || prompt.trim().length < 3}
          className="h-7"
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {progress > 0 ? `${Math.round(progress * 100)}%` : isEditing ? "Updating" : "Generating"}
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {isEditing ? "Update" : "Generate"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
