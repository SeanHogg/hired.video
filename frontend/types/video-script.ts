// Video Script DSL — the AI-generated program that drives the video compiler.
// Matches the JSON schema the LLM returns from POST /api/studio/storyboard.

import type { StudioPurpose } from "@shared/studio-purposes";
// #1430 — re-export the canonical SceneType from shared so any new scene
// type added there flows into the frontend TS types automatically.
import type { SceneType } from "@shared/scene-types";
export type { SceneType };

export type VideoResolution = "720p" | "1080p" | "4k";
export type VideoAspect = "16:9" | "9:16" | "1:1" | "4:3";
export type MotionStyle = "minimal" | "moderate" | "cinematic";
export type TransitionStyle = "cut" | "fade" | "slide" | "cinematic-fade";
export type BackgroundStyle = "gradient" | "dark-tech-grid" | "particles" | "solid";
export type ImagePosition =
  | "full"
  | "half-left" | "half-right"
  | "small-left" | "small-right"
  | "corner-tl"  | "corner-tr"
  | "corner-bl"  | "corner-br";
export type TextAlign = "left" | "center" | "right";
export type ContentPosition = "top" | "center" | "bottom";
export type ImageAnimation = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type AnimationType = "fadeIn" | "slideUp" | "slideIn" | "scaleIn" | "typewriter" | "none";
export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
export type EffectType = "particles" | "blur" | "glow" | "vignette";

export interface VideoTheme {
  colorPalette: string[];       // 3–5 hex colours
  fontFamily: string;
  motion: MotionStyle;
  transition: TransitionStyle;
  background: BackgroundStyle;
  /** URL for a user-uploaded background that applies to ALL scenes (image or video). */
  customBackground?: string;
  /** Type of customBackground media — defaults to "image" for backwards compatibility. */
  customBackgroundType?: "image" | "video";
  /** Visual filter / colour grading applied to the canvas output (gap #125). */
  filters?: VideoFilters;
}

/**
 * CSS filter values applied to the canvas at render time. All fields are
 * optional; the renderer composes a `filter:` string only from the present
 * values, so an empty object is equivalent to "no filter".
 */
export interface VideoFilters {
  brightness?: number;   // 0..2 (1 = no change)
  contrast?: number;     // 0..2 (1 = no change)
  saturation?: number;   // 0..2 (1 = no change)
  hueRotate?: number;    // degrees, -180..180
  blur?: number;         // px, 0..20
  /** "warmth" maps to a sepia + hue rotation combo (-100..100). */
  warmth?: number;
}

/**
 * Build a CSS `filter` string from VideoFilters. Returns "none" when no
 * adjustments are present so callers can apply unconditionally.
 */
export function videoFiltersToCss(f: VideoFilters | undefined): string {
  if (!f) return "none";
  const parts: string[] = [];
  if (f.brightness !== undefined && f.brightness !== 1)
    parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== undefined && f.contrast !== 1)
    parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== undefined && f.saturation !== 1)
    parts.push(`saturate(${f.saturation})`);
  if (f.hueRotate !== undefined && f.hueRotate !== 0)
    parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.blur !== undefined && f.blur > 0)
    parts.push(`blur(${f.blur}px)`);
  if (f.warmth !== undefined && f.warmth !== 0) {
    // Positive warmth = warmer (yellow/orange tint), negative = cooler (blue).
    const sepia = Math.min(0.4, Math.abs(f.warmth) / 250);
    const hue = f.warmth > 0 ? 0 : 200;
    parts.push(`sepia(${sepia}) hue-rotate(${hue}deg)`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}

export interface AnimationSpec {
  type: AnimationType;
  start: number;                // seconds within scene
  duration: number;
  easing?: EasingType;
}

/**
 * Per-scene effect entry. Matches the shared effect-registry shape
 * (`frontend/lib/timeline/effects/registry.ts`) so the same registry
 * dispatches effects for scene-based AND timeline-based renders.
 *
 * Legacy data may still carry `{type, intensity}` from before the
 * registry landed; `normaliseSceneEffect()` converts on read so the
 * compiler sees one shape regardless of write age.
 */
export interface SceneEffect {
  kind: string;
  params: Record<string, unknown>;
}

/** Legacy shape — no longer written, still tolerated on read. */
interface LegacySceneEffect {
  type: EffectType;
  intensity: number;
}

/** Normalise a raw effect entry to the canonical `{kind, params}`
 *  shape. Single source of truth for legacy → registry conversion;
 *  the compiler, the editor, and the Zod parser all route through here.
 */
export function normaliseSceneEffect(raw: SceneEffect | LegacySceneEffect): SceneEffect {
  if ("kind" in raw && typeof raw.kind === "string") {
    return { kind: raw.kind, params: raw.params ?? {} };
  }
  const legacy = raw as LegacySceneEffect;
  return {
    kind: legacy.type,
    params: { intensity: legacy.intensity },
  };
}

export interface SceneScript {
  id: string;
  start: number;                // absolute seconds from video start
  duration: number;             // visible duration AFTER trim (= sourceDuration - inPoint - (sourceDuration - outPoint))
  type: SceneType;
  /**
   * NLE trim points (gap #124). When `inPoint` and `outPoint` are set, the
   * scene plays only the slice [inPoint, outPoint) of its full source. When
   * absent the scene plays in full (back-compat with AI-generated scenes).
   * `sourceDuration` is the original untrimmed duration; we keep it so trim
   * handles can be re-extended without losing content.
   */
  inPoint?: number;
  outPoint?: number;
  sourceDuration?: number;
  /** Per-boundary transition into THIS scene (overrides theme default). */
  transitionIn?: TransitionStyle;
  /** The scene's name on the timeline chip and the scenes rail ("Hook",
   *  "Who I am"). Separate from `title`, which places a text element on the
   *  frame. Absent → derived from `title`, then `type` (#2349). */
  label?: string;
  title?: string;
  subtitle?: string;
  text?: string | string[];
  items?: string[];             // bullet list (achievements)
  skills?: string[];
  highlight?: boolean;          // AI edit flag
  animation?: {
    titleEnter?: AnimationSpec;
    subtitleEnter?: AnimationSpec;
    textEnter?: AnimationSpec;
  };
  effects?: SceneEffect[];
  accentColor?: string;
  /** Rich background preset over the solid `accentColor` fill — the v2
   *  scene's `backgroundEffect` (e.g. `gradient:#7c3aed:#2563eb`). */
  backgroundEffect?: string;
  /** Override the default text colour for title/subtitle/body text in this scene. */
  textColor?: string;
  /** Optional semi-transparent card behind the text — accepts any CSS color (with alpha). */
  cardBackgroundColor?: string;
  /** Optional border colour drawn around the text card. */
  cardBorderColor?: string;
  /** URL of the scene's full-screen background media (image or video). */
  backgroundImage?: string;
  /** Type of backgroundImage media — defaults to "image" for backwards compatibility. */
  backgroundMediaType?: "image" | "video";
  /** Legacy: positioning for `backgroundImage` when used as overlay. New code uses `overlayMediaUrl` instead. */
  backgroundImagePosition?: ImagePosition;
  /** URL of an overlay media (image or video) drawn on top of the background. */
  overlayMediaUrl?: string;
  /** Type of overlay media. */
  overlayMediaType?: "image" | "video";
  /** Position of the overlay (full | half-left | half-right | corners). */
  overlayMediaPosition?: ImagePosition;
  /** Optional Ken-Burns animation for image overlays. */
  overlayMediaAnimation?: ImageAnimation;
  sceneAudio?: string;
  sceneAudioLabel?: string;
  textAlign?: TextAlign;
  contentPosition?: ContentPosition;
  imageAnimation?: ImageAnimation;
  /** Free-form element list — replaces fixed slots once populated. Each element
   *  is independently positioned/sized within the canvas (% coordinates). */
  sceneElements?: SceneElement[];
}

// ─── Free-form scene elements ───────────────────────────────────────────────

/** Position + size as percentages of the canvas (0–100). */
export interface ElementBox {
  /** Left edge as % of canvas width. */
  x: number;
  /** Top edge as % of canvas height. */
  y: number;
  /** Width as % of canvas width. */
  w: number;
  /** Height as % of canvas height. */
  h: number;
}

/** Visual styling shared by all element kinds. */
export interface ElementStyle {
  /** Background fill colour (CSS, supports rgba). */
  backgroundColor?: string;
  /** Border colour. */
  borderColor?: string;
  /** Border width in pixels. */
  borderWidth?: number;
  /** Border radius in pixels. */
  borderRadius?: number;
  /** Padding inside the box, in pixels. */
  padding?: number;
}

interface BaseElement {
  id: string;
  /** Bounding box as % of canvas. */
  box: ElementBox;
  /** Visual styling for the element's container. */
  style?: ElementStyle;
  /** Z-order: higher draws on top. */
  z?: number;
  /** Optional rotation in degrees. */
  rotation?: number;
  /** Seconds into the scene when the element appears (default 0) —
   *  maps to the v2 widget's `visibleFrom`, so elements can stagger in. */
  appearAt?: number;
  /** Enter / exit animation — the v2 widget's `motion`, carried verbatim. */
  motion?: import("@/lib/studio/editor-v2/widget-motion").WidgetMotion;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontFamily?: string;
  color?: string;
  align?: TextAlign;
  /** Vertical alignment within the box. */
  verticalAlign?: "top" | "middle" | "bottom";
}

export interface ImageElement extends BaseElement {
  kind: "image";
  url: string;
  /** How the image fits within its box. */
  fit?: "cover" | "contain" | "fill";
  /** Optional Ken-Burns animation. */
  animation?: ImageAnimation;
}

export interface VideoElement extends BaseElement {
  kind: "video";
  url: string;
  fit?: "cover" | "contain" | "fill";
  /** Mute the video (default true so multiple videos don't cacophony). */
  muted?: boolean;
  /** Loop the video (default true). */
  loop?: boolean;
}

export interface AudioElement extends BaseElement {
  kind: "audio";
  url: string;
  label?: string;
  volume?: number;
}

/**
 * A list of short labels rendered as styled chips/pills.
 * Use for skills, tags, tools, technologies, etc. — anything where the
 * "list of small tokens" visual is more useful than running text.
 */
export interface ChipsElement extends BaseElement {
  kind: "chips";
  chips: string[];
  fontSize?: number;
  fontFamily?: string;
  /** Chip background colour (default: rgba(16,185,129,0.20)) */
  chipColor?: string;
  /** Chip text colour (default: #6ee7b7) */
  textColor?: string;
  /** Layout direction — "row" wraps horizontally, "column" stacks vertically. */
  direction?: "row" | "column";
}

/**
 * Webcam capture — distinct from VideoElement because the source isn't a
 * URL but a live `getUserMedia` stream (interactive surfaces) or a
 * recorded blob URL (after capture). Keeping it separate lets the
 * renderer ask for permission lazily and the editor surface a record
 * button instead of a URL field.
 */
export interface WebcamElement extends BaseElement {
  kind: "webcam";
  /** When set, plays back the recorded clip; when null/undefined, the
   *  interactive renderer requests a live stream. */
  recordingUrl?: string | null;
  /** Mirror the video horizontally (default true — matches selfie cam UX). */
  mirror?: boolean;
  /** Mute the recorded audio track on playback. */
  muted?: boolean;
}

/** Chart types the studio's shared <ChartRenderer> can draw. New types
 *  go here ONCE — the intake picker, the storyboard element gallery,
 *  and the renderer all read from this union. */
export type ChartType = "bar" | "line" | "pie" | "scatter";

/**
 * Embedded chart visualisation. Source data is held as the original
 * pasted/uploaded text + a detected format so the same payload powers
 * both the live editor preview and the export-time canvas rasteriser
 * (no double parsing). The optional takeaway is the user's one-line
 * insight, surfaced under the chart and read by the AI voiceover.
 */
export interface ChartElement extends BaseElement {
  kind: "chart";
  chartType: ChartType;
  /** Raw user-supplied data — CSV / TSV / JSON. The renderer parses
   *  this with the format hint; failure renders an empty axis. */
  data: string;
  /** Detected at edit time so the renderer doesn't re-detect on every
   *  frame. Rebuilt automatically when `data` changes. */
  format?: "csv" | "tsv" | "json";
  /** Optional caption shown under the chart and fed to the voiceover. */
  takeaway?: string;
  /** Display title rendered above the chart (defaults to no title). */
  title?: string;
  /** Optional palette override. Falls back to the theme's primary +
   *  brand colours when omitted. */
  colors?: string[];
}

/** Discriminated union of all supported element kinds. The new neutral
 *  alias `RenderableElement` lives in `types/renderable-element.ts` —
 *  same union, broader name to reflect that elements now embed in
 *  resume sub-records, company sections, profile sections, etc., not
 *  just video scenes. `SceneElement` stays for back-compat. */
export type SceneElement =
  | TextElement
  | ImageElement
  | VideoElement
  | AudioElement
  | ChipsElement
  | ChartElement
  | WebcamElement;

export interface VideoAudio {
  /** Preset key or "custom". Legacy single-clip shape — when `clips` is
   *  populated it is the source of truth and these legacy fields are
   *  ignored by playback / export. Kept on the type for back-compat
   *  with saved projects; `normalizeAudioClips` hoists the legacy
   *  shape into a single full-duration clip on read. */
  track: string;
  /** Human-readable label */
  label: string;
  /** 0–1 */
  volume: number;
  /** Multi-track mixer settings (gap #129). Per-lane gain + fade envelopes. */
  mix?: AudioMixConfig;
  /** Layered music clips on the timeline. Each entry plays from
   *  `startSec` to `endSec`; multiple clips may overlap and are summed
   *  by the music lane mixer. Drives the in-app preview
   *  (`VideoPreview`) through the shared clip scheduler. */
  clips?: AudioClip[];
}

export interface AudioClip {
  id: string;
  /** Either a preset key (e.g. "corporate-inspire" — driven by the
   *  procedural `AmbientPlayer`) or a hosted/blob URL of a rendered
   *  audio file (decoded via `AudioBufferSourceNode`). The scheduler
   *  picks the right driver from the string shape. */
  track: string;
  /** Human-readable label shown on the timeline. */
  label: string;
  /** When the clip starts on the project timeline (seconds). */
  startSec: number;
  /** When the clip ends on the project timeline (seconds). For URL
   *  clips this is typically `startSec + rendered duration`; for
   *  preset clips it bounds the otherwise-infinite procedural loop. */
  endSec: number;
  /** Per-clip gain 0–1 (defaults to 1). Multiplied by the music-lane
   *  gain from `AudioMixConfig` at playback / render time. */
  volume?: number;
  /** Fade-in duration in seconds. The scheduler ramps gain from 0 to
   *  `volume` over this window from `startSec`. Default 0 (#567). */
  fadeInSec?: number;
  /** Fade-out duration in seconds. The scheduler ramps gain from
   *  `volume` to 0 over the last `fadeOutSec` of the clip ending at
   *  `endSec`. Default 0 (#567). */
  fadeOutSec?: number;
  /** Trim — start playback this many seconds INTO the source file.
   *  Default 0 (play from the beginning). Used by drag-to-trim on
   *  the timeline bar's left edge (#567). */
  trimStartSec?: number;
}

/**
 * Per-lane audio mix settings. The `ambient-player.ts` exporter consumes
 * these during the final render pass to apply gain + fade-in/out envelopes
 * to each track independently. Lanes are summed to a master output that
 * also has its own master gain.
 */
export interface AudioMixConfig {
  /** Master output gain applied after all lanes are summed (0..2). */
  masterGain?: number;
  music?: AudioLaneConfig;
  voiceover?: AudioLaneConfig;
  recording?: AudioLaneConfig;
}

export interface AudioLaneConfig {
  /** Lane gain 0..2 (1 = unity, >1 = boost). */
  gain?: number;
  /** Fade-in duration in seconds. */
  fadeInSec?: number;
  /** Fade-out duration in seconds. */
  fadeOutSec?: number;
  /** Mute lane entirely without losing settings. */
  muted?: boolean;
}

// ── TTS Voiceover ───────────────────────────────────────────────────────────

export interface VoiceoverConfig {
  enabled: boolean;
  /**
   * TTS engine that synthesizes the voiceover. All four engines run 100%
   * client-side.
   *   - "web-speech" : built-in browser speechSynthesis (free, no download)
   *   - "kokoro"     : Kokoro-82M WebGPU model (~80MB, exportable PCM)
   *   - "piper"      : Piper WebGPU per-voice models (smaller, exportable)
   *   - "vibevoice"  : VibeVoice cloning model — requires a licensed
   *                    voice clone (owned or purchased from the marketplace)
   */
  engine?: "web-speech" | "kokoro" | "piper" | "vibevoice";
  voiceId: string;
  voiceName: string;
  speed: number;           // 0.5 – 2.0
  /** Per-scene audio URLs and word timestamps */
  scenes: Record<string, SceneVoiceover>;
}

export interface SceneVoiceover {
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// ── Captions ────────────────────────────────────────────────────────────────

export type CaptionStyle = "standard" | "bold-pop" | "word-by-word" | "lower-thirds";

export interface CaptionConfig {
  enabled: boolean;
  style: CaptionStyle;
  cues: CaptionCue[];
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

/**
 * Codec id used by the encode pipeline. h264 + aac is the WebCodecs
 * fast path; anything else routes to ffmpeg.wasm. Per the user's
 * "settings live on the project" rule, this lives on `video` (saved
 * by the regular saveDraft round-trip) — no parallel preset registry.
 */
export type VideoCodec = "h264" | "h265" | "prores" | "dnxhd" | "vp9";
export type VideoContainer = "mp4" | "mov" | "webm";
export type AudioCodec = "aac" | "pcm" | "opus";

/** #301 — Voiceover per-scene mapping persisted on the script (lifted
 *  out of the legacy `StudioProjectState.voiceover.scenes` UI-side
 *  bag so the NLE timeline can read it directly and so collaborators
 *  see the same data the local editor sees). Keyed by scene id; the
 *  value carries the audio URL + duration so the timeline renderer
 *  can show a clip on the voiceover lane without re-fetching state. */
export interface ScriptVoiceoverMap {
  scenes: Record<string, { audioUrl: string; durationSec: number; voiceId?: string }>;
}

export interface VideoScript {
  video: {
    duration: number;           // total seconds
    fps: number;                // default 30
    resolution: VideoResolution;
    aspect: VideoAspect;
    theme: VideoTheme;
    audio?: VideoAudio;
    /** #301 — Per-scene voiceover slots lifted onto the script so the
     *  NLE timeline voiceover lane is non-empty + voiceover slot data
     *  persists across collaborators. Empty / undefined keeps existing
     *  behaviour for scripts that never used voiceover. */
    voiceover?: ScriptVoiceoverMap;
    /** Optional purpose stored on AI-generated scripts for backward compat.
     *  Typed as `StudioPurpose` (#493) so unknown values are caught at
     *  compile time across every script consumer. */
    purpose?: StudioPurpose;
    /** Render preset — codec + container chosen by the user. Optional;
     *  defaults to h264/aac/mp4 (the WebCodecs fast path) when absent.
     *  Non-default codecs require ffmpeg.wasm and are Pro-gated by the
     *  picker UI (the renderer itself trusts the value). */
    codec?: VideoCodec;
    container?: VideoContainer;
    audioCodec?: AudioCodec;
    /** Optional target video bitrate in bits/sec. Some codecs (ProRes)
     *  ignore. */
    videoBitrate?: number;
    audioBitrate?: number;
  };
  scenes: SceneScript[];
  /** Internal metadata not rendered by the compiler — persisted with the draft */
  _meta?: {
    model?: string;
    /** Save-pipeline toggles (which steps run on Save) live on the project,
     *  not in localStorage, so a user's "skip render" preference travels
     *  with the project across devices and collaborators. Stores the
     *  DISABLED step ids — defaulting to empty means "all steps run". */
    savePipelineDisabled?: ("generate" | "render" | "upload")[];
    /** Hash of the script content as of the last successful render+upload.
     *  When equal to `computeScriptHash(script)` the project's `videoUrl`
     *  is treated as fresh; otherwise the player falls back to the live
     *  canvas path and Publish actions trigger a re-render. Single source
     *  consulted by `isBakedFresh()` so player/Publish-button can never
     *  disagree about whether a re-render is required. */
    bakedHash?: string;
  };
}
