/**
 * Inspector schema types. Each kind of selection (widget, scene, none)
 * resolves to a list of `InspectorSection`s; the right panel renders
 * them as a collapsible accordion. New widget kinds plug in by adding
 * one entry to the widget registry in `widget-sections.tsx` — the panel
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
import type { VisualTheme, BgPreset } from "@/lib/studio/visual-themes";
import type { MusicTrack } from "@/lib/studio/music-catalog";
import type { VideoFormat } from "@/lib/studio/video-formats";
import type { CodecPreset } from "@/lib/studio/codec-presets";
import type {
  MotionPreset,
  TransitionPreset,
} from "@/lib/studio/motion-presets";
import type { VideoFilters } from "@/lib/studio/video-filters";
import type { FontPreset } from "@/lib/studio/font-catalog";
import type { ColorPalette } from "@/components/studio/shared/ColorPalettePicker";

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

/** Mutators surfaced to canvas-level (project-wide) section renderers. */
export interface CanvasSectionCallbacks {
  onSelectTheme: (theme: VisualTheme) => void;
  onSelectBackground: (preset: BgPreset) => void;
  onSelectMusic: (track: MusicTrack) => void;
  onSelectFormat: (format: VideoFormat) => void;
  onSelectCodec: (preset: CodecPreset) => void;
  onSelectMotion: (preset: MotionPreset) => void;
  onSelectTransition: (preset: TransitionPreset) => void;
  onSelectFont: (preset: FontPreset) => void;
  onChangePalette: (palette: ColorPalette) => void;
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
  title: string;
  /** Whether the section is open by default. Falsy = closed. */
  defaultOpen?: boolean;
  /** Optional gate. Omit = always visible for this selection kind. */
  visible?: (ctx: Ctx) => boolean;
  render: (ctx: Ctx) => React.ReactNode;
}

export type WidgetInspectorSection = InspectorSection<WidgetSectionCtx>;
export type SceneInspectorSection = InspectorSection<SceneSectionCtx>;
export type CanvasInspectorSection = InspectorSection<CanvasSectionCtx>;
