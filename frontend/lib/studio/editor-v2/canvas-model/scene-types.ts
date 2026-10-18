/**
 * Scene + composition model — `Scene`, captions, palette and the root
 * `CanvasState`. Part of the canvas-state model; re-exported by
 * `../canvas-state`.
 */

import type { AudioLayer, CanvasAudioMix } from "./audio-types";
import type { Widget } from "./widget-types";

// v2: unified `audioLayers[]` replaces the single `musicSource` +
// `voiceovers[]` split (multi-track audio rebuild). Legacy drafts are
// migrated forward by `normalizeCanvasState` / `buildAudioLayers`.
export const CANVAS_STATE_VERSION = 2;

/** Enter animation specs preserved from v1's `scene.animation` so the
 *  v1 render path can replay the same title / subtitle / body fade-ins
 *  when a v1 project is opened, edited, and saved through v2. V2 doesn't
 *  use these natively — `Widget.motion` is the v2-native enter / exit
 *  affordance — but the v1 renderer reads them and the migration must
 *  be lossless (gap #611). */
export interface SceneEnterAnimations {
  titleEnter?: import("@/types/video-script").AnimationSpec;
  subtitleEnter?: import("@/types/video-script").AnimationSpec;
  textEnter?: import("@/types/video-script").AnimationSpec;
}

export interface Scene {
  id: string;
  label: string;
  /** Duration in seconds. */
  durationSeconds: number;
  backgroundColor: string;
  /** Encoded background-preset value when the scene picked something
   *  richer than a flat colour — e.g. `gradient:#7c3aed:#2563eb`,
   *  `dark-tech-grid:#7c3aed`, `particles:#7c3aed`. Mirrors v1's
   *  `theme.background` string. `null` / `undefined` means flat solid;
   *  consumers fall through to `backgroundColor`. Single source of
   *  truth: never reconstruct from `backgroundColor` alone (multiple
   *  presets share the same solid fallback). */
  backgroundEffect?: string | null;
  widgets: Widget[];
  /** Per-scene colour-grading filters. `null` means identity (no
   *  filters applied). Same shape as v1's `script.video.theme.filters`
   *  so the render pipeline reads either editor's output uniformly. */
  filters: import("@/lib/studio/video-filters").VideoFilters | null;
  /** v1 `scene.type` enum preserved on import so the AI script rewriter
   *  + scene-type-aware features keep working after a v1→v2 migration
   *  (gap #611). Defaults to undefined for v2-native projects; the
   *  stopgap canvas-to-script emit falls back to an index heuristic. */
  sourceSceneType?: import("@/types/video-script").SceneType;
  /** v1 `scene.animation` enter-animation block preserved on import for
   *  the same reason as `sourceSceneType`. */
  sourceEnterAnimations?: SceneEnterAnimations;
  /** v1 `scene.effects[]` — per-scene visual effects (particles / blur /
   *  glow / vignette). Stored at scene scope here so the import →
   *  edit → save round-trip preserves them even when the v2 inspector
   *  hasn't surfaced per-scene effect editing yet (gap #611). */
  effects?: import("@/types/video-script").SceneEffect[];
  /** Per-boundary transition into THIS scene. Overrides the canvas-level
   *  `defaultTransition` when set; `null`/`undefined` means inherit the
   *  default. Mirrors v1's `scene.transitionIn` so the import →
   *  edit → save round-trip is lossless (gap #616). */
  transitionIn?: import("@/lib/studio/motion-presets").TransitionKind | null;
  /** Director's notes — free-form text the director (or whoever is
   *  shooting / supervising / reviewing) attaches to the scene: shot
   *  intent, blocking, dailies feedback, talent direction, todos. Not
   *  rendered into the final video; visible only in the editor. `null` /
   *  undefined / empty means "no notes" — the ScenesRail badge + the
   *  inspector section self-gate on emptiness so they cost nothing for
   *  scenes without notes. */
  directorNotes?: string | null;
}

/** Caption cue. Structurally compatible with the v1 CaptionEditor's
 *  internal CaptionCue type so the dialog can mount unchanged. */
export interface CanvasCaptionCue {
  start: number;
  end: number;
  text: string;
}

export type CaptionStyle = "standard" | "bold-pop" | "word-by-word" | "lower-thirds";

export interface CanvasCaptions {
  cues: CanvasCaptionCue[];
  style: CaptionStyle;
  enabled: boolean;
}

/** A 4-chip colour palette: primary, accent, surface, contrast. Edited by
 *  `<ColorPalettePicker>`. */
export type ColorPalette = [string, string, string, string];

export interface CanvasState {
  schemaVersion: number;
  /** Output frame width (matches Timeline.width on emit). */
  width: number;
  height: number;
  /** Frames per second on emit. */
  fps: number;
  scenes: Scene[];
  /** Visual theme id last applied (see `lib/studio/visual-themes.ts`).
   *  Persisted so the Design panel re-highlights the active theme on
   *  re-open. `null` means no theme has been applied. */
  themeId: string | null;
  /** Audio layers — the unified multi-track audio model. Music beds,
   *  voiceovers, and sfx are all `AudioLayer`s tagged by `kind`. There
   *  can be MANY music layers (drag a track in → append another). The
   *  timeline renders one row per layer; the scheduler + render emit
   *  iterate the whole array. Replaces the old single `musicSource` +
   *  `voiceovers[]` fields (legacy drafts migrate via `buildAudioLayers`
   *  in `normalizeCanvasState`). */
  audioLayers: AudioLayer[];
  /** Caption cues + style. `null` means captions haven't been authored
   *  yet — the CaptionEditor dialog still mounts to start them. */
  captions: CanvasCaptions | null;
  /** Audio mix — master gain + per-lane gain / mute. `null` means
   *  defaults (DEFAULT_AUDIO_MIX). Optional so legacy rows without
   *  the field parse without migration. */
  audioMix?: CanvasAudioMix | null;
  /** Export codec id (see `lib/studio/codec-presets.ts`). Used by the
   *  render facade at export time. `null` defaults to h264. */
  codec: import("@/lib/studio/codec-presets").Codec | null;
  /** Global animation intensity. Applied uniformly to widget enter/exit
   *  + transition durations. */
  motion: import("@/lib/studio/motion-presets").MotionStyle | null;
  /** Default scene-to-scene transition. */
  defaultTransition: import("@/lib/studio/motion-presets").TransitionKind | null;
  /** Global font family for text widgets that don't override their own.
   *  Stored as a font-catalog id, resolved via `fontFamilyFor()`. */
  fontFamily: string | null;
  /** 4-chip colour palette used by the theme + applied as a starting
   *  point when the user adds shape / text widgets. */
  colorPalette: ColorPalette | null;
}
