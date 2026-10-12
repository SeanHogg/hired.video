/**
 * The image format's surface (#932): drawing Tools tab, its layers in a
 * Simple rail slot, the AI prompt inspector, the image history and the
 * `<DrawingStage>` canvas. The AI prompt lives on the right, not in the
 * AI tab.
 */
import DrawingStage from "@/components/studio/drawing/DrawingStage";
import DrawingLayersPanel from "@/components/studio/drawing/DrawingLayersPanel";
import DrawingAiPromptPanel from "@/components/studio/drawing/DrawingAiPromptPanel";
import type { ImageSurfaceCtx, StudioFormatSurface } from "../types";
import { drawingToolsTab } from "../shared";

export const imageSurface: StudioFormatSurface<ImageSurfaceCtx> = {
  leftTabs: (ctx) => [drawingToolsTab(ctx)],
  // Image keeps its DrawingAiPromptPanel on the right.
  aiGenerator: () => undefined,
  hostTools: (ctx) => {
    const image = ctx.image;
    return {
      // An image is made OF its layers: they sit in a Simple slot.
      sections: {
        label: ctx.t("workspace.tool.layers"),
        content: (
          <DrawingLayersPanel
            state={image.imageState}
            onAddLayer={image.handleImageAddLayer}
            onAddLayerOfKind={image.handleImageAddLayerOfKind}
            onDeleteLayer={image.handleImageDeleteLayer}
            onSelectLayer={image.handleImageSelectLayer}
            onToggleVisible={image.handleImageToggleVisible}
            onRenameLayer={image.handleImageRenameLayer}
            onSetOpacity={image.handleImageSetOpacity}
            onSetBlendMode={image.handleImageSetBlendMode}
            onSetFilters={image.handleImageSetFilters}
            onMoveLayer={image.handleImageMoveLayer}
          />
        ),
      },
    };
  },
  inspector: (ctx) => {
    const { imageState, handleImageAiGenerated } = ctx.image;
    return {
      title: ctx.t("studio.editorV2.panelAiPrompt"),
      content: (
        <DrawingAiPromptPanel
          history={imageState.aiPromptHistory}
          onGenerated={(result, prompt, options) => void handleImageAiGenerated(result, prompt, options)}
        />
      ),
    };
  },
  history: (ctx) => {
    const { imageUndo, imageRedo, imageCanUndo, imageCanRedo } = ctx.image;
    return { undo: imageUndo, redo: imageRedo, canUndo: imageCanUndo, canRedo: imageCanRedo };
  },
};

export function imageCanvas(ctx: ImageSurfaceCtx) {
  const image = ctx.image;
  const { imageMarquee } = image;
  return (
    <div className="relative">
      <DrawingStage
        state={image.imageState}
        setState={image.setImageState}
        commit={image.imageCommit}
        zoom={ctx.zoom}
        tool={image.imageTool}
        brush={image.imageBrush}
        onBrushChange={image.setImageBrush}
        onRecentColor={image.pushImageRecentColor}
        marquee={imageMarquee}
        onMarqueeChange={image.setImageMarquee}
        onMarqueeDelete={
          imageMarquee ? image.handleImageMarqueeDelete : undefined
        }
        onMarqueeFill={
          imageMarquee ? image.handleImageMarqueeFill : undefined
        }
        onMarqueeInpaint={
          imageMarquee ? image.handleImageMarqueeInpaint : undefined
        }
        onLayerTransform={image.handleImageLayerTransform}
        onCanvasReady={image.setImageCanvas}
      />
      {ctx.aiChipNode}
    </div>
  );
}
