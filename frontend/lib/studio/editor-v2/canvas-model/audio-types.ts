/**
 * Audio model — layer shapes, mixer state + defaults, and the editable
 * patch subset. Part of the canvas-state model; re-exported by
 * `../canvas-state`.
 */

/** Kinds of audio layer. `music` is a background bed (one OR MORE per
 *  composition since the multi-track rebuild), `voiceover` is narration
 *  (recorded or TTS-synthesised), `sfx` is a one-shot sound effect. The
 *  kind drives the mixer lane (see `audioLaneForKind`) + the timeline
 *  row accent — NOT a separate data shape per kind. */
export type AudioLayerKind = "music" | "voiceover" | "sfx";

/** Playable source for an audio layer. `stock` references a procedural
 *  catalog track by id (resolved lazily — see music-catalog.ts);
 *  `custom` carries a concrete blob:/cdn URL (recorder output, upload,
 *  Original Music Composer render). A `custom` layer with an empty url +
 *  a `text` script is a pending-synthesis voiceover placeholder. */
export type AudioLayerSource =
  | { kind: "stock"; trackId: string }
  | { kind: "custom"; url: string };

/** A single audio layer on the composition timeline. The unified shape
 *  the multi-track audio rebuild is built on — music, voiceover, and
 *  sfx are all `AudioLayer`s of a tagged `kind`, so the timeline can
 *  render N stacked rows, the user can drag music in to add another
 *  layer, and every layer supports the same trim / fade / split / gain
 *  operations. Replaces the old single `musicSource` + `voiceovers[]`
 *  split (legacy drafts migrate via `buildAudioLayers`).
 *
 *  All timing fields are in seconds and non-optional here (the
 *  constructors + migration always fill them) so consumers don't
 *  re-derive defaults at every read site. */
export interface AudioLayer {
  id: string;
  kind: AudioLayerKind;
  source: AudioLayerSource;
  /** Display label surfaced on the timeline bar + in the mixer. */
  label: string;
  /** Source-file length in seconds. For stock procedural music this is
   *  the catalog duration; the bar can still trim/extend within it. */
  durationSeconds: number;
  /** When set, the layer starts at that scene's beginning; `null` means
   *  composition 0. Voiceover/sfx commonly anchor to a scene; music is
   *  conventionally `null` (absolute timeline position). */
  anchorSceneId: string | null;
  /** Manual start-offset in seconds, added to the anchor's start (or
   *  composition 0 when no anchor). Drag-to-move on the bar writes this. */
  startOffsetSec: number;
  /** Trim — start playback this many seconds INTO the source file. */
  trimStartSec: number;
  /** Trim — stop this many seconds BEFORE the end of the source file. */
  trimEndSec: number;
  /** Fade-in duration in seconds (gain ramps 0 → effective). */
  fadeInSec: number;
  /** Fade-out duration in seconds (gain ramps effective → 0). */
  fadeOutSec: number;
  /** Per-layer gain in 0..1 (1 = unity). Composes with the lane + master
   *  gains in `audioMix`. */
  gain: number;
  /** Per-layer mute. */
  muted: boolean;
  /** Narration script that produced (or will produce) a voiceover layer's
   *  audio. Optional — recorded/uploaded/music layers have none. A layer
   *  with `text` but an empty source url is a pending-synthesis
   *  placeholder. */
  text?: string;
}

/** Canvas-level audio mix state — master gain + per-lane gain / mute.
 *  Single source of truth for v2's audio mixer (#645). The render
 *  facade reads these alongside `musicSource` + `voiceovers[]` so a
 *  user's mix carries through preview and export.
 *
 *  All gains are 0..1 (1 = unity, 0 = silence). The mixer UI clamps
 *  on input; the render path multiplies master × lane × clip. */
export interface CanvasAudioMix {
  masterGain: number;
  musicGain: number;
  musicMuted: boolean;
  voiceoverGain: number;
  voiceoverMuted: boolean;
  /** Auto-duck music under voiceover so dialogue stays intelligible
   *  without the user hand-sculpting per-segment gain. When true, the
   *  music lane's effective gain drops to `musicGain * duckAmount` for
   *  any time slice covered by a non-muted voiceover clip; when false
   *  music plays at its full lane gain throughout. Optional for back-
   *  compat — absence is read as `false`. */
  duckMusicUnderVoiceover?: boolean;
  /** Ducked music volume as a fraction of un-ducked (0..1). 0 = music
   *  silent under voiceover, 1 = no actual ducking. Optional — absence
   *  is read as 0.3 (the broadcast convention of -10dB ≈ 0.316). */
  duckAmount?: number;
}

export const DEFAULT_AUDIO_MIX: CanvasAudioMix = {
  masterGain: 1,
  musicGain: 0.6,
  musicMuted: false,
  voiceoverGain: 1,
  voiceoverMuted: false,
  duckMusicUnderVoiceover: false,
  duckAmount: 0.3,
};

/** Default ducked-music multiplier when `duckAmount` is unset. -10dB ≈
 *  0.316; we round to 0.3 so the slider lands on a clean tick. Exported
 *  so consumers that need the fallback don't redefine the constant. */
export const DEFAULT_DUCK_AMOUNT = 0.3;

/** The subset of an `AudioLayer`'s fields a timeline drag / mixer edit
 *  can patch. `kind` / `source` / `durationSeconds` are immutable post-
 *  creation, so they're excluded. */
export type AudioLayerPatch = Partial<
  Pick<
    AudioLayer,
    | "startOffsetSec"
    | "trimStartSec"
    | "trimEndSec"
    | "fadeInSec"
    | "fadeOutSec"
    | "gain"
    | "muted"
    | "anchorSceneId"
    | "label"
  >
>;
