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
import RemoveBrandingToggle from "@/components/studio/shared/RemoveBrandingToggle";
import { resolveMusic } from "@/lib/studio/music-catalog";
import { findFormatByDimensions } from "@/lib/studio/video-formats";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea, ColorInput, Field } from "./fields";
import { TRANSITION_PRESETS } from "@/lib/studio/motion-presets";
import { scenePatchFromBgPreset } from "@/lib/studio/visual-themes";
import EffectStackEditor from "@/components/studio/effects/EffectStackEditor";
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
          activeBgValue={scene.backgroundEffect ?? `solid:${scene.backgroundColor}`}
          onSelect={(preset) => onUpdateScene(scenePatchFromBgPreset(preset))}
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
  {
    id: "scene-effects",
    title: "Effects",
    // Scene-level visual effect chain (blur / glow / vignette / film-
    // grain / etc). Same `EffectStackEditor` the widget-effects panel
    // uses — single component, single seam. Title-category effects are
    // hidden because they belong on widgets, not on the whole scene.
    render: ({ scene, onUpdateScene }) => (
      <EffectStackEditor
        effects={scene.effects ?? []}
        onChange={(next) =>
          onUpdateScene({ effects: next.length === 0 ? undefined : next })
        }
        allowedCategories={["color", "stylize", "transform", "key"]}
        compact
      />
    ),
  },
  {
    id: "scene-director-notes",
    title: "Director's notes",
    // Free-form text the director attaches to the scene — shot intent,
    // blocking, dailies feedback, talent direction, todos. Not
    // rendered into the final video; the ScenesRail badge surfaces
    // its presence so reviewers can spot scenes with open notes.
    // Stored as `null` when cleared so a "remove all notes" round-
    // trips losslessly without leaving an empty string behind.
    render: ({ scene, onUpdateScene }) => (
      <div className="space-y-2">
        <AutoSizeTextarea
          value={scene.directorNotes ?? ""}
          onChange={(next) =>
            onUpdateScene({ directorNotes: next.length === 0 ? null : next })
          }
          minRows={4}
          placeholder="Shot intent, blocking, talent direction, dailies feedback…"
          ariaLabel="Director's notes for this scene"
        />
        <p className="text-[10px] text-muted-foreground">
          Visible to editors only — never rendered into the final video.
        </p>
      </div>
    ),
  },
  {
    id: "scene-transition",
    title: "Transition in",
    // Per-scene override for the project-wide `defaultTransition` (gap
    // #616). `null` / "inherit" means "use the canvas default", any
    // other value pins the scene boundary. Mirrors v1's
    // `scene.transitionIn` so v1 → v2 → v1 round-trip is lossless.
    render: ({ scene, onUpdateScene }) => (
      <Field label="Transition in">
        <select
          value={scene.transitionIn ?? ""}
          onChange={(e) =>
            onUpdateScene({
              transitionIn:
                (e.target.value || null) as typeof scene.transitionIn,
            })
          }
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="">Inherit project default</option>
          {TRANSITION_PRESETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.hint}
            </option>
          ))}
        </select>
      </Field>
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
  {
    id: "canvas-branding",
    title: "Branding",
    // The toggle self-gates Pro internally — free users see it disabled
    // with an upgrade hint, Pro users can flip it on. The branding
    // policy reads the same value from `useRemoveBrandingFlag()` so the
    // preview watermark + export pipeline + this control all stay in
    // lockstep without prop-drilling (#615).
    render: () => <RemoveBrandingToggle />,
  },
];
