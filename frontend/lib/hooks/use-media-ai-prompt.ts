/**
 * useMediaAiPrompt — single state hook every AI-prompt surface uses.
 *
 * Per the cross-studio first-class image-AI rollout: the AI prompt is no
 * longer a drawing-only feature. The DrawingStage right rail, the
 * floating selection chip on every canvas (drawing/game/animation/
 * timeline), and the CHRO Brain quick-action all wire through THIS
 * hook. No surface re-implements busy/error/progress/history; per the
 * standing DRY rule the prompt UI is dumb and this hook owns state.
 *
 * The hook does NOT know what to do with the generated image — the
 * caller's `onGenerated` handler decides (drawing → append/replace
 * layer, game → mint sprite asset, animation → replace frame, timeline
 * → insert image widget, Brain → image already saved to library, just
 * surface URL). One generator, many sinks.
 *
 * `sourceImageUrl` switches the underlying engine from text→img to
 * img→img. When the caller passes a selected element's CDN URL, the
 * model rewrites it under the prompt; when omitted, fresh generation.
 * Same prompt UX both ways.
 */

import { useState, useCallback } from "react";
import {
  generateImage,
  type ImageGenInput,
  type ImageGenResult,
} from "@/lib/services/image-gen-engine";

export interface UseMediaAiPromptOptions {
  /** Called when generation finishes. Receives the result + the prompt
   *  the user typed. Caller decides what to do with the bytes (append
   *  layer, mint sprite, save to library, …). */
  onGenerated: (result: ImageGenResult, prompt: string) => void | Promise<void>;
  /** Optional post-processor — useful for the drawing surface's
   *  transparent-background step. Runs between the engine returning and
   *  `onGenerated` firing. Caller is responsible for revoking the
   *  original previewUrl if it returns a fresh blob. */
  postProcess?: (
    result: ImageGenResult,
    onProgress: (p: number) => void,
  ) => Promise<ImageGenResult>;
}

export interface UseMediaAiPromptApi {
  prompt: string;
  setPrompt: (next: string) => void;
  busy: boolean;
  error: string | null;
  progress: number;
  /** Fire generation with the current prompt and the supplied extra
   *  input (typically `sourceImageUrl` from a selection). No-ops if the
   *  prompt is empty / too short / a request is already in flight. */
  submit: (extra?: Omit<ImageGenInput, "prompt">) => Promise<void>;
  /** Manually reset error state — useful when the user starts typing
   *  again after a failed run. */
  clearError: () => void;
}

const MIN_PROMPT_LENGTH = 3;

export function useMediaAiPrompt(opts: UseMediaAiPromptOptions): UseMediaAiPromptApi {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const submit = useCallback(
    async (extra?: Omit<ImageGenInput, "prompt">) => {
      const trimmed = prompt.trim();
      if (trimmed.length < MIN_PROMPT_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      setProgress(0);
      try {
        // Reserve the last 40% of the progress bar for any post-process
        // step (e.g. background segmentation on the drawing surface).
        const reserveForPostProcess = opts.postProcess ? 0.6 : 1;
        const result = await generateImage(
          { prompt: trimmed, ...(extra ?? {}) },
          (p) => setProgress(p * reserveForPostProcess),
        );
        let finalResult = result;
        if (opts.postProcess) {
          finalResult = await opts.postProcess(result, (p) => {
            setProgress(0.6 + p * 0.4);
          });
        }
        await opts.onGenerated(finalResult, trimmed);
        setPrompt("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setBusy(false);
        setProgress(0);
      }
    },
    [prompt, busy, opts],
  );

  const clearError = useCallback(() => setError(null), []);

  return { prompt, setPrompt, busy, error, progress, submit, clearError };
}
