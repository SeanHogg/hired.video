/**
 * Right-hand inspector panel.
 *
 * Selection drives content:
 *   - Widget selected  → per-widget-kind sections (Layout / Content /
 *                        Motion / Timing) from the widget registry.
 *   - Scene selected   → scene sections (label / background / filters)
 *                        and canvas-wide sections (theme / palette /
 *                        fonts / motion / music / format / export).
 *
 * Section content is declared per widget kind in
 * `inspector/widget-sections.tsx` and once at module scope in
 * `inspector/scene-sections.tsx`. Adding a new widget kind = one
 * `WIDGET_INSPECTOR` entry; this component never branches on kind.
 *
 * Authorization: the shell owns persistence + canActFor checks upstream
 * of the callbacks passed in here. This component just renders.
 */
import {
  findScene,
  findWidget,
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetParams,
  type WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import type { Selection } from "./CanvasStage";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import InspectorSectionList from "./inspector/InspectorSectionList";
import SceneActionButtons from "./SceneActionButtons";
import {
  getWidgetSections,
  WIDGET_TITLES,
} from "./inspector/widget-sections";
import {
  SCENE_SECTIONS,
  CANVAS_SECTIONS,
} from "./inspector/scene-sections";
import type {
  CanvasSectionCallbacks,
  SceneSectionCallbacks,
} from "./inspector/types";

export interface PropertiesPanelProps extends CanvasSectionCallbacks {
  state: CanvasState;
  selection: Selection;
  // Scene mutators
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  // Scene mutators (in addition to onUpdateScene above)
  onDeleteScene: (sceneId: string) => void;
  onDuplicateScene: (sceneId: string) => void;
  // Widget mutators
  onUpdateWidgetPosition: (widgetId: string, position: WidgetPosition) => void;
  onUpdateWidgetParams: (widgetId: string, params: WidgetParams) => void;
  onUpdateWidget: (widgetId: string, patch: Partial<Widget>) => void;
  onDeleteWidget: (widgetId: string) => void;
}

export default function PropertiesPanel(props: PropertiesPanelProps) {
  const { state, selection } = props;

  if (selection.kind === "widget") {
    const result = findWidget(state, selection.widgetId);
    if (!result) return <Empty />;
    return <WidgetInspector widget={result.widget} scene={result.scene} {...props} />;
  }

  const scene = findScene(state, selection.sceneId);
  if (!scene) return <Empty />;
  return <SceneInspector scene={scene} {...props} />;
}

function Empty() {
  return (
    <div className="p-4 text-xs text-muted-foreground">
      Click a widget or empty area of the canvas to edit its settings.
    </div>
  );
}

function WidgetInspector({
  widget,
  scene,
  onUpdateWidgetPosition,
  onUpdateWidgetParams,
  onUpdateWidget,
  onDeleteWidget,
}: { widget: Widget; scene: Scene } & PropertiesPanelProps) {
  const ctx = {
    widget,
    scene,
    onUpdateWidgetPosition: (position: WidgetPosition) =>
      onUpdateWidgetPosition(widget.id, position),
    onUpdateWidgetParams: (params: WidgetParams) =>
      onUpdateWidgetParams(widget.id, params),
    onUpdateWidget: (patch: Partial<Widget>) => onUpdateWidget(widget.id, patch),
    onDeleteWidget: () => onDeleteWidget(widget.id),
  };
  return (
    <div className="flex h-full flex-col">
      <Header
        title={WIDGET_TITLES[widget.kind]}
        subtitle="Widget"
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteWidget(widget.id)}
            className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <InspectorSectionList
          sections={getWidgetSections(ctx)}
          ctx={ctx}
          storageKey="studio.v2.right.widget.sections"
        />
      </div>
    </div>
  );
}

function SceneInspector({
  scene,
  state,
  onUpdateScene,
  onDeleteScene,
  onDuplicateScene,
  onSelectTheme,
  onSelectBackground,
  onSelectMusic,
  onSelectFormat,
  onSelectCodec,
  onSelectMotion,
  onSelectTransition,
  onSelectFont,
  onChangePalette,
}: { scene: Scene } & PropertiesPanelProps) {
  const sceneCtx: SceneSectionCallbacks & { scene: Scene; state: CanvasState } = {
    scene,
    state,
    onUpdateScene: (patch) => onUpdateScene(scene.id, patch),
    onChangeFilters: (filters) => onUpdateScene(scene.id, { filters }),
  };
  const canvasCtx: CanvasSectionCallbacks & {
    scene: Scene;
    state: CanvasState;
  } = {
    scene,
    state,
    onSelectTheme,
    onSelectBackground,
    onSelectMusic,
    onSelectFormat,
    onSelectCodec,
    onSelectMotion,
    onSelectTransition,
    onSelectFont,
    onChangePalette,
  };
  return (
    <div className="flex h-full flex-col">
      <Header
        title={scene.label}
        subtitle="Scene"
        action={
          <SceneActionButtons
            sceneId={scene.id}
            sceneLabel={scene.label}
            sceneCount={state.scenes.length}
            onDelete={onDeleteScene}
            onDuplicate={onDuplicateScene}
            size="normal"
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <InspectorSectionList
          sections={SCENE_SECTIONS}
          ctx={sceneCtx}
          storageKey="studio.v2.right.scene.sections"
        />
        <div className="border-t-2 border-border/80">
          <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Canvas
          </div>
          <InspectorSectionList
            sections={CANVAS_SECTIONS}
            ctx={canvasCtx}
            storageKey="studio.v2.right.canvas.sections"
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {subtitle}
        </p>
        <p className="text-sm font-medium leading-tight">{title}</p>
      </div>
      {action}
    </div>
  );
}
