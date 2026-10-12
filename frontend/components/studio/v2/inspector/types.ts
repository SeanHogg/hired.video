/**
 * Inspector schema types. Each kind of selection (widget, scene, none)
 * resolves to a list of `InspectorSection`s; the right panel renders
 * them as rows that open in place (section-drills; the rail's Design tool
 * still lists its canvas-wide ones as an accordion). New widget kinds plug in by adding
 * one entry to the widget registry in `widget-sections/` — the panel
 * picks the new sections up automatically, no PropertiesPanel changes.
 *
 * The render-context split (Widget vs Scene+Canvas) keeps section
 * components honest about what data they're allowed to mutate: a Widget
 * section can't reach into scene state, and vice-versa, without the
 * shell explicitly handing it the callback.
 */
import type {
  CanvasState,
  Scene,
  Widget,
  WidgetParams,
  WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import type { VideoFilters } from "@/lib/studio/video-filters";
import type { CanvasSectionCallbacks } from "@/lib/studio/editor-v2/use-canvas-section-callbacks";

/** Mutators surfaced to widget-section renderers. */
export interface WidgetSectionCallbacks {
  onUpdateWidgetPosition: (position: WidgetPosition) => void;
  onUpdateWidgetParams: (params: WidgetParams) => void;
  onUpdateWidget: (patch: Partial<Widget>) => void;
  onDeleteWidget: () => void;
}

export interface WidgetSectionCtx extends WidgetSectionCallbacks {
  widget: Widget;
  scene: Scene;
}

/** Mutators surfaced to scene-section renderers. */
export interface SceneSectionCallbacks {
  onUpdateScene: (patch: Partial<Scene>) => void;
  onChangeFilters: (filters: VideoFilters) => void;
}

export interface SceneSectionCtx extends SceneSectionCallbacks {
  scene: Scene;
  state: CanvasState;
}

export interface CanvasSectionCtx extends CanvasSectionCallbacks {
  state: CanvasState;
  scene: Scene;
}

/** A renderable section in the inspector. Sections self-gate visibility
 *  via the optional `visible(ctx)` predicate — a section that doesn't
 *  apply to a given widget kind simply returns `false` and the panel
 *  skips it without the caller needing per-kind branching. */
export interface InspectorSection<Ctx> {
  id: string;
  /** i18n key of the section's title (accordion header, drill row, slot
   *  header) — translated at render via t(). */
  titleKey: string;
  /** Whether the section is open by default in an accordion
   *  (InspectorSectionList). Falsy = closed. */
  defaultOpen?: boolean;
  /** Optional gate. Omit = always visible for this selection kind. */
  visible?: (ctx: Ctx) => boolean;
  render: (ctx: Ctx) => React.ReactNode;
}

export type WidgetInspectorSection = InspectorSection<WidgetSectionCtx>;
export type SceneInspectorSection = InspectorSection<SceneSectionCtx>;
export type CanvasInspectorSection = InspectorSection<CanvasSectionCtx>;
