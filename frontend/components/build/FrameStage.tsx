/**
 * The kit video frame — the studio's OWN CanvasStage, the same one the
 * studio editor, its preview and the public watch page render with. While it
 * plays it is a player (`mode="playback"`; a click pauses); paused, it is the
 * editor (`mode="edit"`): click an element to select it, drag / resize /
 * rotate it, click the selected text again to retype it on the frame
 * (OnFrameTextEditor), Delete removes it; palette tiles, stock media and
 * screenshots dropped on it become new elements. Every edit goes through the frame
 * editor (useFrameEditor) into the page's one history.
 *
 * It fits the stage into its box (like CanvasStatePreview) so the on-frame
 * editor can be laid over the stage in the same percentage space.
 */
import { useEffect, useRef, useState } from "react";
import CanvasStage from "@/components/studio/v2/CanvasStage";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { FrameEditor } from "@/lib/build/use-frame-editor";
import { sceneTextFieldOfWidget } from "@/lib/build/scene-text";
import OnFrameTextEditor from "./OnFrameTextEditor";

/** Longest wording the plan stores: a scene field (ScenePlanSchema) or a
 *  widget's own wording (WidgetOverrideSchema). */
const SCENE_TEXT_MAX = 160;
const WIDGET_TEXT_MAX = 400;

interface FrameStageProps {
  canvas: CanvasState;
  playback: PreviewPlayback;
  frame: FrameEditor;
}

export default function FrameStage({ canvas, playback, frame }: FrameStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scene = canvas.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ?? canvas.scenes[0];
  const zoom = box.w > 0 && box.h > 0 ? Math.max(0.05, Math.min(box.w / canvas.width, box.h / canvas.height)) : 0.05;
  const playing = playback.isPlaying;
  const editing = !playing ? frame.editing : null;

  return (
    <div
      ref={boxRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      // A click on the playing video pauses it, so the next click can edit.
      onClick={playing ? playback.pause : undefined}
      onKeyDown={(e) => {
        if (playing || editing || !frame.selected) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          frame.remove(frame.selected.widget.id);
        }
      }}
    >
      {scene && (
        <div className="relative">
          <CanvasStage
            scene={scene}
            canvasWidth={canvas.width}
            canvasHeight={canvas.height}
            zoom={zoom}
            mode={playing ? "playback" : "edit"}
            currentTimeSec={playing ? playback.activeSceneElapsed : undefined}
            selection={playing ? { kind: "scene", sceneId: scene.id } : frame.selection}
            onSelect={playing ? undefined : frame.select}
            onWidgetMove={playing ? undefined : frame.move}
            onWidgetDrop={playing ? undefined : frame.insert}
            onLinkedContentDrop={playing ? undefined : frame.insertLinked}
            onMediaDrop={playing ? undefined : (url, mediaType, at) => frame.insertMedia(mediaType, url, at)}
            onScreenshotDrop={playing ? undefined : frame.captureScreenshot}
            defaultFontId={canvas.fontFamily}
          />
          {editing && (
            <OnFrameTextEditor
              key={editing.id}
              widget={editing}
              zoom={zoom}
              maxLength={sceneTextFieldOfWidget(editing.id) ? SCENE_TEXT_MAX : WIDGET_TEXT_MAX}
              onChange={(text) => frame.retype(editing.id, text)}
              onClose={frame.closeEditor}
            />
          )}
          <BrandWatermark size="md" className="pointer-events-none absolute bottom-3 right-3 z-10" />
        </div>
      )}
    </div>
  );
}
