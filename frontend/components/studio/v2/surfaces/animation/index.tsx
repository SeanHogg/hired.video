/**
 * The animation format's surface (#1003): Frames + drawing Tools tabs, the
 * AI frame generator, header Play / Pause, the animation history and the
 * `<AnimationStage>` canvas.
 */
import { Film } from "lucide-react";
import AnimationStage from "@/components/studio/animation/AnimationStage";
import FramesRail from "@/components/studio/animation/FramesRail";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import type { AnimationSurfaceCtx, StudioFormatSurface } from "../types";
import { drawingToolsTab } from "../shared";

export const animationSurface: StudioFormatSurface<AnimationSurfaceCtx> = {
  leftTabs: (ctx) => {
    const { animationState, commitAnimationState, selectAnimationFrame } = ctx.animation;
    return [
      {
        id: "scenes",
        label: ctx.t("studio.editor.panelFrames"),
        icon: Film,
        content: (
          <FramesRail state={animationState} onChange={commitAnimationState} onSelect={selectAnimationFrame} />
        ),
      },
      drawingToolsTab(ctx),
    ];
  },
  aiGenerator: (ctx) => {
    const { handleAnimationAiGenerated } = ctx.animation;
    return (
      <MediaAiPromptPanel
        kindNoun="frame"
        placeholder={ctx.t("studio.editorV2.aiPromptPlaceholderFrame")}
        onGenerated={(result) => void handleAnimationAiGenerated(result)}
      />
    );
  },
  preview: (ctx) => {
    const { animationPlaying, setAnimationPlaying } = ctx.animation;
    return {
      label: animationPlaying ? ctx.t("narrator.pause") : ctx.t("narrator.play"),
      onClick: () => setAnimationPlaying((p) => !p),
      pressed: animationPlaying,
    };
  },
  history: (ctx) => {
    const { animationUndo, animationRedo, animationCanUndo, animationCanRedo } = ctx.animation;
    return { undo: animationUndo, redo: animationRedo, canUndo: animationCanUndo, canRedo: animationCanRedo };
  },
};

export function animationCanvas(ctx: AnimationSurfaceCtx) {
  const { animationState, setAnimationState, animationCommit, animationPlaying } = ctx.animation;
  const { imageTool, imageBrush, setImageBrush, pushImageRecentColor } = ctx.image;
  return (
    <div className="relative">
      <AnimationStage
        state={animationState}
        setState={setAnimationState}
        commit={animationCommit}
        zoom={ctx.zoom}
        tool={imageTool}
        brush={imageBrush}
        onBrushChange={setImageBrush}
        onRecentColor={pushImageRecentColor}
        isPlaying={animationPlaying}
      />
      {ctx.aiChipNode}
    </div>
  );
}
