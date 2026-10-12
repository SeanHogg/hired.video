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
 * `inspector/widget-sections/` and once at module scope in
 * `inspector/scene-sections.tsx`. Adding a new widget kind = one
 * `WIDGET_INSPECTOR` entry; this component never branches on kind.
 *
 * Depth (Simple | Advanced): `depth` picks the sections
 * (lib/workspace/inspector-depth.ts) — Simple shows the plain ones, Advanced
 * appends the rest and the canvas-wide group after them. Every section is
 * a row of the workspace's ONE drill list (components/workspace/inspector,
 * via section-drills) that opens in place; the HOST owns which one is open
 * (`drill`, useSectionDrill) and puts ‹ back in the right slot's header.
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
import { useTranslation } from "react-i18next";
import type { Selection } from "@/lib/studio/editor-v2/editor-types";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import InspectorBody from "@/components/workspace/inspector/InspectorBody";
import type { SectionDrill } from "@/components/workspace/inspector/use-section-drill";
import { sectionDrills } from "./inspector/section-drills";
import SceneActionButtons from "./SceneActionButtons";
import {
  getWidgetSections,
  WIDGET_TITLE_KEYS,
} from "./inspector/widget-sections";
import {
  SCENE_SECTIONS,
  CANVAS_SECTIONS,
} from "./inspector/scene-sections";
import type { CanvasSectionCallbacks } from "@/lib/studio/editor-v2/use-canvas-section-callbacks";
import type {
  CanvasSectionCtx,
  InspectorSection,
  SceneSectionCallbacks,
  SceneSectionCtx,
} from "./inspector/types";
import type { WorkspaceDepth } from "@/lib/workspace/workspace-depth";
import { inspectorCanvasSectionsAt, sceneSectionsAt, widgetSectionsAt } from "@/lib/workspace/inspector-depth";

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
  /** Workspace depth; Advanced (default) shows every section. */
  depth?: WorkspaceDepth;
  /** The section open in place (the host's ‹ back closes it). */
  drill: SectionDrill;
}

/** The selection's name — a widget's kind title or a scene's label — for
 *  the slot header's kicker over an open section ("Who I am" › "Background").
 *  Null when the selection is gone. Pure. */
export function inspectorSelectionTitle(state: CanvasState, selection: Selection, t: TFunction): string | null {
  if (selection.kind === "widget") {
    const found = findWidget(state, selection.widgetId);
    return found ? t(WIDGET_TITLE_KEYS[found.widget.kind]) : null;
  }
  return findScene(state, selection.sceneId)?.label ?? null;
}

/** The header + rows, or the open section in their place. While a section
 *  is open the body's own title/delete header hides — the slot header
 *  carries the selection's name, the section title and ‹ back. */
function SectionRows<Ctx extends object>({
  plain,
  more,
  ctx,
  drill,
  label,
  header,
}: {
  plain: InspectorSection<Ctx>[];
  more: InspectorSection<Ctx>[];
  ctx: Ctx;
  drill: SectionDrill;
  label: string;
  header: React.ReactNode;
}) {
  const registry = sectionDrills(plain, more, ctx);
  const open = drill.id && drill.id in registry.drills ? drill.id : null;
  return (
    <div className="flex h-full flex-col">
      {!open && header}
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <div className={open ? undefined : "p-3"}>
          <InspectorBody
            registry={registry}
            ctx={ctx}
            advanced={more.length > 0}
            drill={open}
            onOpen={(id) => drill.open(id, registry.drills[id].labelKey)}
            label={label}
          />
        </div>
      </div>
    </div>
  );
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
  const { t } = useTranslation();
  return (
    <div className="p-4 text-[13px] text-muted-foreground">
      {t("studio.inspector.emptyHint")}
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
  depth = "advanced",
  drill,
}: { widget: Widget; scene: Scene } & PropertiesPanelProps) {
  const { t } = useTranslation();
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
    <SectionRows
      key={widget.id}
      {...widgetSectionsAt(getWidgetSections(ctx), depth)}
      ctx={ctx}
      drill={drill}
      label={t(WIDGET_TITLE_KEYS[widget.kind])}
      header={
        <Header
          title={t(WIDGET_TITLE_KEYS[widget.kind])}
          subtitle={t("studio.inspector.widget")}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeleteWidget(widget.id)}
              className="h-8 gap-1 rounded-lg px-2 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("actions.delete")}
            </Button>
          }
        />
      }
    />
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
  depth = "advanced",
  drill,
}: { scene: Scene } & PropertiesPanelProps) {
  const { t } = useTranslation();
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
  const sceneAtDepth = sceneSectionsAt(SCENE_SECTIONS, depth);
  // Scene + canvas-wide sections share one drill list; the context
  // carries both (each section reads only its own half).
  const more: InspectorSection<SceneSectionCtx & CanvasSectionCtx>[] = [
    ...sceneAtDepth.more,
    ...inspectorCanvasSectionsAt(CANVAS_SECTIONS, depth),
  ];
  return (
    <SectionRows
      key={scene.id}
      plain={sceneAtDepth.plain}
      more={more}
      ctx={{ ...sceneCtx, ...canvasCtx }}
      drill={drill}
      label={scene.label}
      header={
        <Header
          title={scene.label}
          subtitle={t("studio.inspector.scene")}
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
      }
    />
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
    <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {subtitle}
        </span>
        <strong className="truncate text-sm font-semibold leading-tight text-foreground">{title}</strong>
      </div>
      {action}
    </div>
  );
}
