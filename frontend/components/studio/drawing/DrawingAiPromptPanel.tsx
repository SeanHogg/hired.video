/**
 * DrawingStage AI prompt panel — prompt-in, image-out. Routes through
 * the pluggable `generateImage()` facade (image-gen-engine.ts) which
 * picks the best available engine (WebGPU primary when available,
 * server fallback today). The panel doesn't know about engines — per
 * the standing DRY rule it just submits the prompt and renders the
 * result.
 *
 * On success the result is appended as a NEW layer (not destructive
 * to the user's existing paint work) — they can delete it, move it
 * down, drop its opacity, or paint on top. The panel also pushes one
 * entry onto `state.aiPromptHistory` so previous prompts can be
 * re-used without retyping.
 */

import { useState } from "react";
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

interface DrawingAiPromptPanelProps {
  history: ReadonlyArray<AiPromptHistoryEntry>;
  onGenerated: (result: ImageGenResult, prompt: string) => void;
}

export default function DrawingAiPromptPanel({
  history,
  onGenerated,
}: DrawingAiPromptPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const result = await generateImage({ prompt: trimmed }, (p) =>
        setProgress(p),
      );
      onGenerated(result, trimmed);
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
      {error && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          ⌘/Ctrl+Enter · adds as new layer · ~10K tokens
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
