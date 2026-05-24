/**
 * DrawingStage AI prompt — wraps the generic `MediaAiPromptPanel` and
 * adds the two drawing-specific knobs (Replace active layer, Transparent
 * background). Per the cross-studio first-class image-AI rollout, the
 * generic panel + `useMediaAiPrompt` hook own all the prompt-state
 * plumbing; this file only contributes drawing semantics on top.
 *
 * Two options:
 *   - **Replace active layer** vs add NEW layer. Default = new layer
 *     (less destructive). Image→image mode (when a layer is selected
 *     AND `sourceImageUrl` is supplied) effectively *requires* replace
 *     to make sense — but the toggle stays user-controlled so they can
 *     also "rewrite this layer into a new layer."
 *   - **Transparent background** — auto-detected from the prompt via
 *     `detectTransparentIntent`, post-processed via the segmentation
 *     pipeline. Toggle remains user-overridable.
 */

import { useEffect, useState } from "react";
import type { AiPromptHistoryEntry } from "@shared/image-state";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";
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
  /** Optional source image URL — when supplied, the engine runs
   *  img→img and rewrites the selected layer instead of generating from
   *  scratch. Supplied by the host when the active layer has a durable
   *  CDN URL (already-uploaded background) or has been uploaded
   *  on-demand. */
  sourceImageUrl?: string;
  /** Alternative img→img source: the active layer's `pixelsDataUrl`.
   *  Drawing layers are in-memory data URLs; passing this avoids an
   *  upload round-trip. Ignored when `sourceImageUrl` is also set. */
  sourceImageDataUrl?: string;
  /** Optional label naming the selected layer — passed through to the
   *  generic panel's helper line ("Update Layer 2"). */
  selectionLabel?: string;
}

export default function DrawingAiPromptPanel({
  history,
  onGenerated,
  sourceImageUrl,
  sourceImageDataUrl,
  selectionLabel,
}: DrawingAiPromptPanelProps) {
  const hasSource = !!(sourceImageUrl || sourceImageDataUrl);
  const [replaceActive, setReplaceActive] = useState(false);
  // Transparent intent is AUTO-DETECTED from prompt + user-overridable.
  // Tracked here (in the wrapper) because the generic panel doesn't
  // know about transparent BG. We snapshot the prompt indirectly by
  // listening to whatever the textarea publishes through the wrapper's
  // own state — but to keep the wrapper-vs-generic seam clean we just
  // expose the toggle and let the user flip it. (The previous
  // auto-detect-from-typed-text UX still works because we can derive
  // intent from the prompt the moment generation fires — see below.)
  const [transparent, setTransparent] = useState(false);
  const [userOverrodeTransparent, setUserOverrodeTransparent] = useState(false);
  // When `sourceImageUrl` is supplied AND the user hasn't manually
  // toggled the "replace" checkbox, default to replace = true since
  // img→img mode implies "update this layer." Keeps the destination
  // intuitive without taking control away.
  useEffect(() => {
    if (!hasSource) return;
    setReplaceActive((prev) => prev || true);
  }, [hasSource]);

  return (
    <div className="border-t bg-background">
      <MediaAiPromptPanel
        history={history.map((h) => ({ id: h.id, prompt: h.prompt }))}
        kindNoun="layer"
        sourceImageUrl={sourceImageUrl}
        sourceImageDataUrl={sourceImageDataUrl}
        selectionLabel={selectionLabel}
        onGenerated={async (result, prompt) => {
          // Auto-detect transparent intent from the prompt if the user
          // hasn't explicitly toggled. Keeps the legacy UX intact: type
          // "transparent background of a fox" → segmentation runs.
          const wantsTransparent = userOverrodeTransparent
            ? transparent
            : detectTransparentIntent(prompt);
          let finalResult = result;
          if (wantsTransparent) {
            const transparentBlob = await removeBackground(result.blob);
            URL.revokeObjectURL(result.previewUrl);
            finalResult = {
              ...result,
              blob: transparentBlob,
              previewUrl: URL.createObjectURL(transparentBlob),
            };
          }
          onGenerated(finalResult, prompt, {
            replaceActiveLayer: replaceActive,
            hadTransparentIntent: wantsTransparent,
          });
        }}
      />
      <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={replaceActive}
            onChange={(e) => setReplaceActive(e.target.checked)}
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
          />
          <span>Transparent background</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {transparent ? "post-processed" : "auto-detect"}
          </span>
        </label>
      </div>
    </div>
  );
}
