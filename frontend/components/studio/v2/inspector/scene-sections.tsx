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
import SafeZoneToggle from "@/components/studio/shared/SafeZoneToggle";
import CodecPicker from "@/components/studio/shared/CodecPicker";
import MotionTransitionPicker from "@/components/studio/shared/MotionTransitionPicker";
import FiltersPicker from "@/components/studio/shared/FiltersPicker";
import FontPicker from "@/components/studio/shared/FontPicker";
import ColorPalettePicker from "@/components/studio/shared/ColorPalettePicker";
import RemoveBrandingToggle from "@/components/studio/shared/RemoveBrandingToggle";
import { findFormatByDimensions } from "@/lib/studio/video-formats";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea, ColorInput, Field } from "./fields";
import TransitionInPicker from "@/components/studio/shared/TransitionInPicker";
import { scenePatchFromBgPreset } from "@/lib/studio/visual-themes";
import EffectStackEditor from "@/components/studio/effects/EffectStackEditor";
import { musicLayers } from "@/lib/studio/editor-v2/canvas-state";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import i18n from "@/lib/i18n/i18n";
import type {
  SceneInspectorSection,
  CanvasInspectorSection,
} from "./types";

/** Active stock-music track id from the unified audioLayers model — the
 *  first music layer backed by a stock catalog track. Drives the
 *  MusicPicker's highlighted row. Custom (composed/uploaded) music
 *  doesn't match a catalog id, so it stays unhighlighted (same as the
 *  pre-audioLayers behaviour). */
function activeStockMusicTrackId(
  state: import("@/lib/studio/editor-v2/canvas-state").CanvasState,
): string | null {
  for (const layer of musicLayers(state)) {
    if (layer.source.kind === "stock") return layer.source.trackId;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Per-scene sections — mutate state.scenes[active] only.
// ───────────────────────────────────────────────────────────────────────────

export const SCENE_SECTIONS: SceneInspectorSection[] = [
  {
    id: "scene-basics",
    titleKey: "studio.inspector.scene",
    defaultOpen: true,
    render: ({ scene, onUpdateScene }) => (
      <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
        <Field label={i18n.t("studio.inspector.label")}>
          <Input
            value={scene.label}
            onChange={(e) => onUpdateScene({ label: e.target.value })}
          />
        </Field>
        <Field label={i18n.t("studio.inspector.durationSeconds")}>
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
    titleKey: "studio.timeline.background",
    defaultOpen: true,
    render: ({ scene, onUpdateScene }) => (
      <div className="space-y-3">
        <BackgroundPicker
          activeBgValue={scene.backgroundEffect ?? `solid:${scene.backgroundColor}`}
          activeHex={scene.backgroundColor}
          onSelect={(preset) => onUpdateScene(scenePatchFromBgPreset(preset))}
        />
        <Field label={i18n.t("studio.inspector.backgroundColour")}>
          <ColorInput
            value={scene.backgroundColor}
            onChange={(backgroundColor) => onUpdateScene({ backgroundColor })}
          />
        </Field>
      </div>
    ),
  },
  {
    id: "scene-filters",
    titleKey: "studio.sidebar.filters",
    render: ({ scene, onChangeFilters }) => (
      <FiltersPicker filters={scene.filters} onChange={onChangeFilters} />
    ),
  },
  {
    id: "scene-effects",
    titleKey: "build.sceneInspector.effects",
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
    titleKey: "build.sceneInspector.drill.notes",
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
          placeholder={i18n.t("studio.inspector.directorNotesPlaceholder")}
          ariaLabel={i18n.t("studio.inspector.directorNotesAria")}
        />
        <p className="text-[10px] text-muted-foreground">
          {i18n.t("studio.inspector.directorNotesHelp")}
        </p>
      </div>
    ),
  },
  {
    id: "scene-transition",
    titleKey: "studio.inspector.transitionIn",
    // Per-scene override for the project-wide `defaultTransition` (gap
    // #616). `null` / "inherit" means "use the canvas default", any
    // other value pins the scene boundary. Mirrors v1's
    // `scene.transitionIn` so v1 → v2 → v1 round-trip is lossless.
    render: ({ scene, onUpdateScene }) => (
      <TransitionInPicker
        value={scene.transitionIn ?? null}
        onChange={(transitionIn) => onUpdateScene({ transitionIn })}
      />
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
    titleKey: "studio.inspector.section.format",
    render: ({ state, onSelectFormat }) => (
      <div className="space-y-3">
        <VideoFormatPicker
          activeFormatId={findFormatByDimensions(state.width, state.height)?.id ?? null}
          onSelect={onSelectFormat}
        />
        {/* #855 — let the user hide the safe-zone guides; self-gates when
            the active format has no zones. */}
        <SafeZoneToggle width={state.width} height={state.height} />
      </div>
    ),
  },
  {
    id: "canvas-themes",
    titleKey: "studio.inspector.section.visualThemes",
    render: ({ state, onSelectTheme }) => (
      <VisualThemePicker activeThemeId={state.themeId} onSelect={onSelectTheme} />
    ),
  },
  {
    id: "canvas-palette",
    titleKey: "studio.inspector.section.palette",
    render: ({ state, onChangePalette }) => (
      <ColorPalettePicker palette={state.colorPalette} onChange={onChangePalette} />
    ),
  },
  {
    id: "canvas-fonts",
    titleKey: "studio.inspector.section.fonts",
    render: ({ state, onSelectFont }) => (
      <FontPicker activeFontId={state.fontFamily} onSelect={onSelectFont} />
    ),
  },
  {
    id: "canvas-motion",
    titleKey: "studio.inspector.section.motionTransitions",
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
    titleKey: "studio.sidebar.music",
    // Click selects (onSelectMusic) AND each row is draggable onto the
    // timeline / canvas to add a music LAYER — both paths resolve the
    // track by id, so they can't disagree on what's available.
    render: ({ state, onSelectMusic }) => (
      <MusicPicker
        activeSelectionId={activeStockMusicTrackId(state)}
        onSelect={onSelectMusic}
        trackDraggable
        trackDragLabel={i18n.t("studio.music.dragToAdd")}
        onTrackDragStart={(track, e) =>
          writeDragPayload(e.dataTransfer, { kind: "music", data: track.id })
        }
      />
    ),
  },
  {
    id: "canvas-export",
    titleKey: "studio.inspector.section.export",
    render: ({ state, onSelectCodec }) => (
      <CodecPicker activeCodecId={state.codec} onSelect={onSelectCodec} />
    ),
  },
  {
    id: "canvas-branding",
    titleKey: "studio.inspector.section.branding",
    // The toggle self-gates Pro internally — free users see it disabled
    // with an upgrade hint, Pro users can flip it on. The branding
    // policy reads the same value from `useRemoveBrandingFlag()` so the
    // preview watermark + export pipeline + this control all stay in
    // lockstep without prop-drilling (#615).
    render: () => <RemoveBrandingToggle />,
  },
];
