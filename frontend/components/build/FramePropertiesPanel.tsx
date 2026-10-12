/**
 * The right rail under Advanced while an element on the frame is selected:
 * the studio's own PropertiesPanel for that widget, wired to the frame editor
 * so its edits land in the page's one history like every other edit.
 *
 * Every edit is kept: position, size, rotation, timing, wording and look
 * (colours, type, motion, container, effects). An element the owner added is
 * stored whole; a résumé-made one keeps its edits as overrides on the video
 * plan, so it still follows the page (useFrameEditor.patchWidget).
 *
 * The kit's document pages reuse it for their free elements (the same
 * widget model), with their own editor. It is always hosted in the right
 * slot, whose header owns the ‹ back control — the panel has none: the host
 * keeps which section is open (`drill`, useSectionDrill) and its ‹ closes
 * that section before it lets go of the element.
 *
 * Only the widget half of PropertiesPanel is mounted here — a scene selection
 * shows the kit's scene inspector (build/video-design/scene/SceneInspector,
 * mounted by useSceneSlotPanel) — so its scene / canvas callbacks are
 * never reached and are inert.
 */
import PropertiesPanel from "@/components/studio/v2/PropertiesPanel";
import type { CanvasState, Widget } from "@/lib/studio/editor-v2/canvas-state";
import type { FrameEditor } from "@/lib/build/use-frame-editor";
import type { SectionDrill } from "@/components/workspace/inspector/use-section-drill";

/** What the panel edits through: the frame editor, or any editor with the
 *  same three seams (a kit document page's free elements). */
export type WidgetEditor = Pick<FrameEditor, "selection" | "patchWidget" | "remove">;

interface FramePropertiesPanelProps {
  canvas: CanvasState;
  frame: WidgetEditor;
  drill: SectionDrill;
}

const INERT = () => undefined;
const SCENE_CALLBACKS = {
  onUpdateScene: INERT,
  onDeleteScene: INERT,
  onDuplicateScene: INERT,
  onSelectTheme: INERT,
  onSelectBackground: INERT,
  onSelectMusic: INERT,
  onSelectFormat: INERT,
  onSelectCodec: INERT,
  onSelectMotion: INERT,
  onSelectTransition: INERT,
  onSelectFont: INERT,
  onChangePalette: INERT,
};

export default function FramePropertiesPanel({ canvas, frame, drill }: FramePropertiesPanelProps) {
  const patch = (widgetId: string, next: Partial<Widget>) => frame.patchWidget(widgetId, next);

  return (
    <div className="-m-4 flex min-h-0 flex-col">
      <PropertiesPanel
        state={canvas}
        selection={frame.selection}
        drill={drill}
        {...SCENE_CALLBACKS}
        onUpdateWidgetPosition={(id, position) => patch(id, { position })}
        onUpdateWidgetParams={(id, params) => patch(id, { params })}
        onUpdateWidget={patch}
        onDeleteWidget={frame.remove}
      />
    </div>
  );
}
