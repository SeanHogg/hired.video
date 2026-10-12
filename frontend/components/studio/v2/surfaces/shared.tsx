/**
 * Surface pieces more than one studio format shares: the drawing Tools tab
 * (image + animation), the default AI generator — an image dropped onto
 * the active scene (Timeline kinds and every format without its own) — and
 * the floating AI selection chip every canvas surface mounts.
 */
import { PenTool } from "lucide-react";
import DrawingToolPalette from "@/components/studio/drawing/DrawingToolPalette";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import AiSelectionChip from "@/components/studio/ai/AiSelectionChip";
import type { AiChipSource } from "@/lib/studio/editor-v2/use-ai-chip-source";
import type { FocusLeftTab } from "@/lib/studio/use-focus-left-panel";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";
import type { ImageSurfaceCtx, StudioFormatCtx } from "./types";

/** The drawing tools (brush, colours) as a format's Tools tab. */
export function drawingToolsTab(ctx: ImageSurfaceCtx): FocusLeftTab {
  const { imageTool, setImageTool, imageBrush, setImageBrush, imageRecentColors } = ctx.image;
  const drawingPalette = (
    <DrawingToolPalette
      tool={imageTool}
      onToolChange={setImageTool}
      brush={imageBrush}
      onBrushChange={setImageBrush}
      recentColors={imageRecentColors}
    />
  );
  return { id: "widgets", label: ctx.t("studio.editor.panelTools"), icon: PenTool, content: drawingPalette };
}

/** Timeline kinds: drop the image onto the active scene via the SAME
 *  `addMediaWidget` path the MediaPicker uses. */
export function sceneImageGenerator(ctx: StudioFormatCtx) {
  const { addMediaWidget } = ctx;
  return (
    <MediaAiPromptPanel
      kindNoun="image"
      placeholder={ctx.t("studio.editorV2.aiPromptPlaceholderImage")}
      onGenerated={async (result) => addMediaWidget("image", await persistGeneratedImage(result), 0)}
    />
  );
}

/** The floating AI selection chip for the current selection. The chip
 *  self-gates on `aiChipSource` being non-null so each surface mount can
 *  include it unconditionally without a per-kind canX check (per the
 *  shared-component visibility rule). */
export function aiSelectionChip(aiChipSource: AiChipSource | null) {
  return aiChipSource ? (
    <AiSelectionChip
      alwaysVisible
      kindNoun={aiChipSource.kindNoun}
      selectionLabel={aiChipSource.label}
      sourceImageUrl={aiChipSource.url}
      sourceImageDataUrl={aiChipSource.dataUrl}
      placeholder={aiChipSource.placeholder}
      bbox={aiChipSource.bbox}
      onGenerated={aiChipSource.onGenerated}
    />
  ) : null;
}
