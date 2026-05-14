/**
 * Scene-level and canvas-level inspector sections — shown in the right
 * panel when no widget is selected. Previously these lived in the
 * left-rail DESIGN tab; consolidating them here matches the design
 * intent that "selecting nothing on the canvas surfaces canvas/scene
 * configuration" while "selecting a widget surfaces widget meta".
 *
 * The split between SCENE_SECTIONS (per-scene state) and CANVAS_SECTIONS
 * (project-wide state) is intentional: scene callbacks mutate the
 * current scene only; canvas callbacks mutate state shared across every
 * scene. Mixing them would re-introduce the same ambiguity DesignPanel
 * had ("does Background affect this scene or all scenes?").
 */
import VisualThemePicker from "@/components/studio/shared/VisualThemePicker";
import BackgroundPicker from "@/components/studio/shared/BackgroundPicker";
import MusicPicker from "@/components/studio/shared/MusicPicker";
import VideoFormatPicker from "@/components/studio/shared/VideoFormatPicker";
import CodecPicker from "@/components/studio/shared/CodecPicker";
import MotionTransitionPicker from "@/components/studio/shared/MotionTransitionPicker";
import FiltersPicker from "@/components/studio/shared/FiltersPicker";
import FontPicker from "@/components/studio/shared/FontPicker";
import ColorPalettePicker from "@/components/studio/shared/ColorPalettePicker";
import { resolveMusic } from "@/lib/studio/music-catalog";
import { findFormatByDimensions } from "@/lib/studio/video-formats";
import { Input } from "@/components/ui/input";
import { ColorInput, Field } from "./fields";
import type {
  SceneInspectorSection,
  CanvasInspectorSection,
} from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Per-scene sections — mutate state.scenes[active] only.
// ───────────────────────────────────────────────────────────────────────────

export const SCENE_SECTIONS: SceneInspectorSection[] = [
  {
    id: "scene-basics",
    title: "Scene",
    defaultOpen: true,
    render: ({ scene, onUpdateScene }) => (
      <div className="space-y-3">
        <Field label="Label">
          <Input
            value={scene.label}
            onChange={(e) => onUpdateScene({ label: e.target.value })}
          />
        </Field>
        <Field label="Duration (seconds)">
          <Input
            type="number"
            min={0.1}
            step={0.1}
            value={scene.durationSeconds}
            onChange={(e) =>
              onUpdateScene({
                durationSeconds: Math.max(0.1, Number(e.target.value) || 0),
              })
            }
          />
        </Field>
      </div>
    ),
  },
  {
    id: "scene-background",
    title: "Background",
    defaultOpen: true,
    render: ({ scene, onUpdateScene }) => (
      <div className="space-y-3">
        <Field label="Background colour">
          <ColorInput
            value={scene.backgroundColor}
            onChange={(backgroundColor) => onUpdateScene({ backgroundColor })}
          />
        </Field>
        <BackgroundPicker
          activeBgValue={scene.backgroundColor}
          onSelect={(preset) => onUpdateScene({ backgroundColor: preset.solidColor })}
        />
      </div>
    ),
  },
  {
    id: "scene-filters",
    title: "Filters",
    render: ({ scene, onChangeFilters }) => (
      <FiltersPicker filters={scene.filters} onChange={onChangeFilters} />
    ),
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Canvas (project-wide) sections — mutate state-level fields shared
// across every scene. Visibility is unconditional — every canvas owns
// these settings.
// ───────────────────────────────────────────────────────────────────────────

export const CANVAS_SECTIONS: CanvasInspectorSection[] = [
  {
    id: "canvas-format",
    title: "Format",
    render: ({ state, onSelectFormat }) => (
      <VideoFormatPicker
        activeFormatId={findFormatByDimensions(state.width, state.height)?.id ?? null}
        onSelect={onSelectFormat}
      />
    ),
  },
  {
    id: "canvas-themes",
    title: "Visual themes",
    render: ({ state, onSelectTheme }) => (
      <VisualThemePicker activeThemeId={state.themeId} onSelect={onSelectTheme} />
    ),
  },
  {
    id: "canvas-palette",
    title: "Palette",
    render: ({ state, onChangePalette }) => (
      <ColorPalettePicker palette={state.colorPalette} onChange={onChangePalette} />
    ),
  },
  {
    id: "canvas-fonts",
    title: "Fonts",
    render: ({ state, onSelectFont }) => (
      <FontPicker activeFontId={state.fontFamily} onSelect={onSelectFont} />
    ),
  },
  {
    id: "canvas-motion",
    title: "Motion & transitions",
    render: ({ state, onSelectMotion, onSelectTransition }) => (
      <MotionTransitionPicker
        activeMotion={state.motion}
        activeTransition={state.defaultTransition}
        onSelectMotion={onSelectMotion}
        onSelectTransition={onSelectTransition}
      />
    ),
  },
  {
    id: "canvas-music",
    title: "Music",
    render: ({ state, onSelectMusic }) => (
      <MusicPicker
        activeSelectionId={resolveMusic(state.musicSource)?.selectionId ?? null}
        onSelect={onSelectMusic}
      />
    ),
  },
  {
    id: "canvas-export",
    title: "Export",
    render: ({ state, onSelectCodec }) => (
      <CodecPicker activeCodecId={state.codec} onSelect={onSelectCodec} />
    ),
  },
];
