/**
 * AiSelectionChip — floating "AI prompt" button that hovers over the
 * canvas viewport on every studio kind. Self-gates: returns null when
 * neither a selection nor a fallback availability flag is provided, so
 * each canvas can mount it unconditionally and rely on the chip to
 * decide its own visibility (per the standing DRY rule — shared
 * components own their entitlement).
 *
 * Anchored in two modes:
 *   • If the host passes `bbox` (an in-canvas rect for the selected
 *     element — game sprite, timeline widget), the chip floats just
 *     above its top-right corner. Click to open the prompt for that
 *     element with img→img pre-populated.
 *   • Otherwise (drawing layer / animation frame — the "selection" IS
 *     the canvas), the chip sits in the viewport's top-right corner.
 *     Same prompt component opens in either case.
 *
 * The prompt itself is the shared `MediaAiPromptPanel` in compact mode
 * — same hook, same button, same submit semantics as the right-rail
 * panel. The chip is just a popover trigger.
 */

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import MediaAiPromptPanel, {
  type MediaAiPromptPanelProps,
} from "@/components/studio/ai/MediaAiPromptPanel";

export interface AiSelectionChipProps
  extends Pick<
    MediaAiPromptPanelProps,
    "onGenerated"
    | "sourceImageUrl"
    | "sourceImageDataUrl"
    | "kindNoun"
    | "selectionLabel"
    | "placeholder"
    | "history"
  > {
  /** Bounding box of the selected element (in viewport pixels, relative
   *  to the canvas viewport — same coordinate space as
   *  `getBoundingClientRect` on the canvas wrapper). When omitted, the
   *  chip pins to the top-right corner of its container. */
  bbox?: { x: number; y: number; width: number; height: number };
  /** When true, the chip is rendered even with no selection. The chip
   *  still self-gates on its other props; this just bypasses the
   *  "needs selection" condition. Used by the drawing/animation
   *  surfaces where "selection" is implicit. */
  alwaysVisible?: boolean;
}

export default function AiSelectionChip({
  bbox,
  alwaysVisible,
  ...promptProps
}: AiSelectionChipProps) {
  if (!bbox && !alwaysVisible) return null;

  // Anchor: when a bbox is given, sit just above its top-right corner;
  // otherwise pin to the container's top-right with a small inset.
  const style: React.CSSProperties = bbox
    ? {
        position: "absolute",
        top: Math.max(0, bbox.y - 32),
        left: bbox.x + bbox.width - 32,
        zIndex: 30,
      }
    : {
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 30,
      };

  return (
    <div style={style} className="pointer-events-auto">
      <Popover>
        <PopoverTrigger asChild>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="default"
                className="h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                aria-label="AI prompt"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {promptProps.sourceImageUrl || promptProps.sourceImageDataUrl
                ? `Update with AI${promptProps.selectionLabel ? ` · ${promptProps.selectionLabel}` : ""}`
                : "Generate with AI"}
            </TooltipContent>
          </Tooltip>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-80 p-0"
        >
          <MediaAiPromptPanel {...promptProps} compact />
        </PopoverContent>
      </Popover>
    </div>
  );
}
