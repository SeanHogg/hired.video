/**
 * The studio editor's canvas region: the zoomable stage (the audio-only
 * hint above the format's canvas surface, picked by CanvasRouter) plus the
 * canvas chrome — clipboard + shortcuts (Advanced, Timeline kinds) and
 * zoom. Lifted out of StudioEditorV2.
 */
import type { RefObject } from "react";
import type { MediaKind } from "@shared/media-kinds";
import CanvasRouter, { type CanvasRuntimeSurfaces } from "@/components/studio/v2/CanvasRouter";
import AudioEmptyHint from "@/components/studio/v2/AudioEmptyHint";
import CanvasEditToolbar from "@/components/studio/v2/CanvasEditToolbar";
import ZoomControl from "@/components/studio/v2/ZoomControl";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { CanvasClipboard } from "@/lib/studio/editor-v2/use-canvas-clipboard";

export interface StudioCanvasStageProps {
  /** The scroll container the zoom fits to. */
  containerRef: RefObject<HTMLDivElement>;
  /** A click on the stage opens the inspector. */
  onStageClick: () => void;
  mediaKind: MediaKind;
  state: CanvasState;
  onRecordVoiceover: () => void;
  surfaces: CanvasRuntimeSurfaces;
  /** The clipboard toolbar's actions; null hides it. */
  clipboard: CanvasClipboard | null;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
}

export default function StudioCanvasStage({
  containerRef,
  onStageClick,
  mediaKind,
  state,
  onRecordVoiceover,
  surfaces,
  clipboard,
  zoom,
  onZoomChange,
  onFit,
}: StudioCanvasStageProps) {
  return (
    <div className="relative h-full min-h-[320px] w-full">
      {/* The stage scrolls inside a fixed box so zooming never pushes
          the frame's regions out of the viewport. */}
      <div ref={containerRef} className="absolute inset-0 overflow-auto p-6" onClickCapture={onStageClick}>
        {/* Audio-only hint: self-gates on kind + voiceover count. */}
        <AudioEmptyHint
          mediaKind={mediaKind}
          state={state}
          onRecordVoiceover={onRecordVoiceover}
          className="mb-3"
        />
        <div className="flex min-h-full min-w-min items-center justify-center">
          <CanvasRouter mediaKind={mediaKind} surfaces={surfaces} />
        </div>
      </div>
      {/* Canvas chrome: clipboard + shortcuts (Advanced) and zoom. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-end justify-between gap-2">
        {clipboard ? <CanvasEditToolbar clipboard={clipboard} /> : <span />}
        <ZoomControl zoom={zoom} onChange={onZoomChange} onFit={onFit} />
      </div>
    </div>
  );
}
