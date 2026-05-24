/**
 * DrawingStage AI prompt panel — prompt-in, image-out. Routes through
 * the pluggable `generateImage()` facade (image-gen-engine.ts) which
 * picks the best available engine (WebGPU primary when available,
 * server fallback today). The panel doesn't know about engines — per
 * the standing DRY rule it just submits the prompt and renders the
 * result.
 *
 * Three options the user can toggle before generating:
 *   - **Replace active layer** vs add as a NEW layer. Default = new
 *     layer (less destructive). When on, the host replaces the active
 *     layer's pixels with the generated image; otherwise it inserts
 *     above. Allows iteration on a single layer ("regenerate this
 *     scene").
 *   - **Transparent background** — when on (auto-detected from the
 *     prompt via `detectTransparentIntent`), the host post-processes
 *     the result through the segmentation pipeline to strip the
 *     background. Toggle remains user-overridable.
 *
 * `aiPromptHistory` is rendered as a recent-prompts popover so the
 * user can re-issue / iterate without retyping.
 */

import { useEffect, useState } from "react";
import { Sparkles, Loader2, History } from "lucide-react";
import type { AiPromptHistoryEntry } from "@shared/image-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  generateImage,
  type ImageGenResult,
} from "@/lib/services/image-gen-engine";
import {
  detectTransparentIntent,
  removeBackground,
} from "@/lib/services/transparent-background";

export interface DrawingAiGenerateOptions {
  /** When true, the host should replace the active layer's pixels
   *  with the generated image; otherwise insert above as a new layer.
   *  Default false (add new layer — safer). */
  replaceActiveLayer: boolean;
  /** When true, the result was already passed through background
   *  removal — the host can flag it as such on the history entry. */
  hadTransparentIntent: boolean;
}

interface DrawingAiPromptPanelProps {
  history: ReadonlyArray<AiPromptHistoryEntry>;
  onGenerated: (
    result: ImageGenResult,
    prompt: string,
    options: DrawingAiGenerateOptions,
  ) => void;
}

export default function DrawingAiPromptPanel({
  history,
  onGenerated,
}: DrawingAiPromptPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [replaceActive, setReplaceActive] = useState(false);
  // Transparent intent is AUTO-DETECTED from the prompt + user-
  // overridable via the toggle. Auto-detection means a user who types
  // "transparent background" doesn't have to also hunt for the
  // checkbox; the manual override means a user can FORCE transparency
  // even when the prompt doesn't include the keywords.
  const [transparent, setTransparent] = useState(false);
  const [userOverrodeTransparent, setUserOverrodeTransparent] = useState(false);
  useEffect(() => {
    if (userOverrodeTransparent) return;
    setTransparent(detectTransparentIntent(prompt));
  }, [prompt, userOverrodeTransparent]);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const result = await generateImage({ prompt: trimmed }, (p) =>
        setProgress(p * (transparent ? 0.6 : 1)),
      );
      // If the user asked for a transparent background, post-process
      // the result through the segmentation pipeline. The remaining
      // 40% of the progress bar covers the segmentation step.
      let finalResult = result;
      if (transparent) {
        setProgress(0.7);
        const transparentBlob = await removeBackground(result.blob);
        URL.revokeObjectURL(result.previewUrl);
        finalResult = {
          ...result,
          blob: transparentBlob,
          previewUrl: URL.createObjectURL(transparentBlob),
        };
        setProgress(1);
      }
      onGenerated(finalResult, trimmed, {
        replaceActiveLayer: replaceActive,
        hadTransparentIntent: transparent,
      });
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="border-t bg-background p-3">
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
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="A watercolor sketch of mountains at dawn…"
        rows={3}
        className="resize-none text-sm"
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="mt-2 space-y-1.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={replaceActive}
            onChange={(e) => setReplaceActive(e.target.checked)}
            disabled={busy}
          />
          <span>Replace active layer</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {replaceActive ? "overwrites" : "adds new"}
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => {
              setUserOverrodeTransparent(true);
              setTransparent(e.target.checked);
            }}
            disabled={busy}
          />
          <span>Transparent background</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {transparent ? "post-processed" : "as generated"}
          </span>
        </label>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          ⌘/Ctrl+Enter · ~10K tokens{transparent ? " + segmentation" : ""}
        </p>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={busy || prompt.trim().length < 3}
          className="h-7"
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {progress > 0 ? `${Math.round(progress * 100)}%` : "Generating"}
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
