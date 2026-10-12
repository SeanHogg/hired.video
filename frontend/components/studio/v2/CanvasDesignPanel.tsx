/**
 * CanvasDesignPanel — the rail's Design tool for a time-based studio format:
 * the canvas-wide look (format, theme, palette, fonts) at every depth. The
 * same section renderers the inspector uses (CANVAS_SECTIONS), so the two
 * can't drift; the inspector leaves these out (inspector-depth.ts).
 */
import type { CanvasState, Scene } from "@/lib/studio/editor-v2/canvas-state";
import { designCanvasSections } from "@/lib/workspace/inspector-depth";
import InspectorSectionList from "./inspector/InspectorSectionList";
import { CANVAS_SECTIONS } from "./inspector/scene-sections";
import type { CanvasSectionCallbacks } from "@/lib/studio/editor-v2/use-canvas-section-callbacks";

interface CanvasDesignPanelProps {
  state: CanvasState;
  /** The scene on screen (background presets preview against it). */
  scene: Scene;
  callbacks: CanvasSectionCallbacks;
}

const SECTIONS = designCanvasSections(CANVAS_SECTIONS);

export default function CanvasDesignPanel({ state, scene, callbacks }: CanvasDesignPanelProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <InspectorSectionList sections={SECTIONS} ctx={{ ...callbacks, state, scene }} storageKey="studio.v2.rail.design.sections" />
    </div>
  );
}
