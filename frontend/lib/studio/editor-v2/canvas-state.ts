/**
 * v2 Studio editor working format.
 *
 * The video is modelled as a list of scenes. Each scene is a contiguous
 * time slice with a background and a set of overlay widgets (text,
 * image, shape, chart) positioned on the canvas. Widgets are stored as
 * percentage offsets (0..1) so the canvas is resolution-independent —
 * the same scene renders at 1080p preview AND 4K export.
 *
 * Persistence: the editor serializes this shape to
 * `studio_projects.timelineSpec` via `canvas-state-to-timeline.ts` on
 * save. Reads round-trip through `timeline-to-canvas-state.ts`. The
 * Timeline JSON spec remains the single render input — this format is
 * an authoring convenience.
 *
 * Naming: "scene" here is a v2-editor concept (a slide-like unit on
 * the canvas), not the legacy `kind='scene'` storyboard. The legacy
 * scene editor is untouched.
 */

import {
  resolveLinkedContentColors,
  stampLinkedContentColors,
} from "./linked-content";

export const CANVAS_STATE_VERSION = 1;

export type WidgetKind =
  | "text"
  | "heading"
  | "image"
  | "video"
  | "shape-rect"
  | "shape-circle"
  | "divider"
  | "chart"
  | "webcam"
  | "chips"
  | "cta"
  | "linked-content"
  // Comic-native widgets (mediaKind === "comic"). They're available to
  // every kind in principle (a video can drop a speech bubble on a
  // talking head), but the picker surfaces them only when the active
  // project is a comic so the palette doesn't bloat for the video flow.
  | "speech-bubble"
  | "caption-box"
  | "sfx-burst"
  // AI presenter avatar — viseme-driven 2D talking head painted client-side
  // via the lib/studio/avatar painter. Animated in preview via the active
  // TTS engine's `onBoundary` callback; baked into the exported MP4 at
  // render time from the same painter + the caption-cue timeline. Closes
  // the Synthesia / HeyGen avatar gap (#1557).
  | "avatar";

export interface WidgetPosition {
  /** Left edge as a fraction of canvas width (0..1). */
  x: number;
  /** Top edge as a fraction of canvas height (0..1). */
  y: number;
  /** Width as a fraction of canvas width (0..1). */
  width: number;
  /** Height as a fraction of canvas height (0..1). */
  height: number;
  /** Z-index within the scene; higher draws on top. */
  z: number;
  /** Rotation in degrees, clockwise, around the widget's centre. 0 means
   *  axis-aligned. Authoring + render apply the same centre-origin rotation
   *  so the editor preview matches the exported frame. */
  rotation: number;
}

export interface TextWidgetParams {
  text: string;
  fontPx: number;
  color: string;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
  background: string | null;
}

export interface ImageWidgetParams {
  /** MediaSource id from the Timeline media-source table, OR a remote URL
   *  for newly-dropped uploads that haven't been ingested yet. The save
   *  path resolves either to a stable sourceId before persistence. */
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  fit: "cover" | "contain" | "stretch";
  /** Alternative text for screen readers — WCAG 2.2 SC 1.1.1
   *  (Non-text Content). Read by the StudioAccessibilityPanel audit;
   *  read by the published-page renderer to populate `<img alt>` on
   *  the public viewer. Optional for back-compat with pre-#1556 widgets;
   *  the audit flags any image whose alt is empty / missing. */
  altText?: string;
}

export interface VideoWidgetParams {
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  muted: boolean;
  /** Chroma-key (green-screen) parameters. When set, the editor preview
   *  and the render pipeline both knock matching pixels out so the
   *  widget's video composites against whatever sits behind it.
   *  `null` / undefined means no keying. Single source of truth for the
   *  key math lives in `lib/studio/chroma-key.ts` so the editor preview
   *  and the canvas-v2 video applier produce identical pixels. */
  chromaKey?: ChromaKeyParams | null;
}

/** Chroma-key configuration. `keyColor` is the colour to knock out
 *  (RGB hex, e.g. `#00ff00` for a green screen). `threshold` is the
 *  normalized chrominance distance (0..1) under which a pixel becomes
 *  fully transparent. `softness` widens the falloff above `threshold`
 *  for edge feathering — pixels in `(threshold, threshold+softness]`
 *  ramp linearly back to opaque. `spillSuppression` (0..1) desaturates
 *  retained pixels' chroma toward neutral whenever they lean toward
 *  the key colour, reducing the green halo around foreground subjects.
 *  Mirrors the params accepted by the registered `chroma-key` effect
 *  so widget-level data round-trips cleanly into the render pass. */
export interface ChromaKeyParams {
  keyColor: string;
  threshold: number;
  softness: number;
  spillSuppression?: number;
}

export interface ShapeWidgetParams {
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface DividerWidgetParams {
  color: string;
  thickness: number;
}

/** Chart widget — wraps the shared `<ChartRenderer>` so v2 reads
 *  CSV/TSV/JSON data the same way v1's chart elements do. Mirrors
 *  `ChartElement` from `types/video-script`. */
export interface ChartWidgetParams {
  chartType: "bar" | "line" | "pie" | "scatter";
  /** Raw user-supplied data — CSV / TSV / JSON. */
  data: string;
  format?: "csv" | "tsv" | "json";
  title?: string;
  takeaway?: string;
  colors?: string[];
}

/** Webcam widget — interactive renders ask `getUserMedia` for a live
 *  preview; once recorded the URL points at the captured clip. Mirrors
 *  `WebcamElement`. */
export interface WebcamWidgetParams {
  /** Recorded clip URL (blob: in memory, R2 cdn after upload). When
   *  `null`/`undefined` the renderer can request a live stream. */
  recordingUrl?: string | null;
  mirror?: boolean;
  muted?: boolean;
}

/** Chips widget — a row / column of pill-shaped labels. Mirrors v1's
 *  `ChipsElement` so a v1 project's chips survive import without
 *  collapsing into joined text (gap #611). */
export interface ChipsWidgetParams {
  chips: string[];
  fontPx: number;
  fontFamily?: string;
  chipColor: string;
  textColor: string;
  direction: "row" | "column";
}

/** CTA widget — end-card with primary text + a tappable call-to-action
 *  button that opens `ctaUrl` in a new tab. Mirrors v1's per-scene
 *  `ctaText` / `ctaUrl` so v1 "cta" scenes can upgrade losslessly into
 *  a CTA widget on the final scene (gap #616). */
export interface CtaWidgetParams {
  /** Headline shown above the button. */
  headline: string;
  /** Secondary copy shown under the headline. Optional. */
  subheadline?: string;
  /** Button label. */
  ctaText: string;
  /** Destination URL. Opens in a new tab. */
  ctaUrl: string;
  /** Card background colour. */
  bgColor: string;
  /** Headline + subheadline text colour. */
  textColor: string;
  /** Button background colour. */
  accentColor: string;
  /** Button text colour. */
  accentTextColor: string;
  /** Headline font size in px. Subheadline derives from this (~55%).
   *  Optional for backwards compatibility with CTAs authored before
   *  this field existed; `resolveCtaFontSizes` supplies the fallback. */
  cardFontPx?: number;
  /** Button label font size in px. Optional for back-compat — see above. */
  ctaFontPx?: number;
}

/** Resolve the headline / subheadline / button font sizes for a CTA
 *  widget. Single source of truth shared by the DOM preview
 *  (`CanvasStage.CtaBody`) and the canvas-pixel renderer
 *  (`canvas-v2:cta`) so both surfaces honour the same defaults +
 *  subheadline-derivation ratio. */
export function resolveCtaFontSizes(
  cardFontPx: number | undefined,
  ctaFontPx: number | undefined,
): { headline: number; subheadline: number; button: number } {
  const headline = typeof cardFontPx === "number" && cardFontPx > 0 ? cardFontPx : 24;
  const button = typeof ctaFontPx === "number" && ctaFontPx > 0 ? ctaFontPx : 14;
  const subheadline = Math.max(11, Math.round(headline * 0.55));
  return { headline, subheadline, button };
}

/** Linked-content widget — embeds a card preview of a user-owned entity
 *  (resume / job / profile / …) at a fractional position on the canvas.
 *  The widget stores only the entity reference; the preview body
 *  self-fetches via `LINKED_CONTENT_REGISTRY[entityKind].InlineBody`
 *  so the canvas, the inspector, and any future render-side applier all
 *  read the same projection. Adding a new entity kind = one row in the
 *  registry; no `WidgetKind` or `WidgetParams` change.
 *
 *  See `lib/studio/editor-v2/linked-content.ts` for the registry. */
export interface LinkedContentWidgetParams {
  entityKind: import("./linked-content").LinkedContentKind;
  /** Stable id of the linked entity (resume id, job id, …). Empty
   *  string means the widget hasn't been bound yet — the body renders
   *  an empty state prompting the user to pick from the inspector. */
  entityId: string;
  /** Card colours — stamped at insert time from the active theme /
   *  colour palette so a resume dropped onto a "Director Pitch"
   *  template adopts that template's look. Mirrors the CTA widget's
   *  per-widget colour pattern so `applyThemeToState` can re-stamp
   *  the chrome when the user picks a new theme. Single source of
   *  truth: `resolveLinkedContentColors()` in `linked-content.ts`. */
  bgColor?: string;
  textColor?: string;
  /** Subtitle / body / chip-text colour (lower-emphasis text). */
  mutedColor?: string;
  /** CTA button background + icon-chip accent. */
  accentColor?: string;
  /** CTA button text (computed for contrast against accent). */
  accentTextColor?: string;
  /** CTA pill text override. When set, replaces the kind-default label
   *  (`"View resume"` / `"Read article"` / etc) baked into
   *  `LINKED_CONTENT_REGISTRY[kind].ctaLabel`. Single seam: both the
   *  DOM `<CtaPill>` in `LinkedContentBody.tsx` AND the canvas-2D
   *  `canvas-v2:linked-content` applier read the override through the
   *  shared `resolveLinkedContentCtaLabel(kind, data)` helper, so the
   *  edit / playback / export surfaces never drift on what the button
   *  says. Empty / undefined falls back to the kind default. */
  ctaText?: string;
  /** Explicit CTA font size in canvas pixels. The canvas-2D applier
   *  used to size the pill purely from the widget's bounding box
   *  (`min(w,h) * 0.06`) — fine on large cards, illegible on tall
   *  narrow ones. When this field is set, both the DOM pill and the
   *  canvas painter use the explicit size; otherwise the canvas falls
   *  back to its bounding-box heuristic and the DOM pill uses its
   *  inherited Tailwind `text-xs` size. */
  ctaFontPx?: number;
  /** CTA font weight. `"bold"` matches the historical default; the
   *  toggle exists so a designer can dial the pill back to a normal-
   *  weight token when the card already carries plenty of bold copy. */
  ctaFontWeight?: "normal" | "bold";
  /** Font family stack for the CTA pill. Passed verbatim to canvas
   *  context.font + CSS font-family. Defaults to the surface's sans
   *  stack on both renderers when unset. */
  ctaFontFamily?: string;
}

/** Speech-bubble widget — the dialogue / thought balloon. The bubble
 *  body is rendered by both the DOM stage and the (future) canvas-2D
 *  applier from a single `shape` enum so the editor preview and the
 *  exported pixels can't drift. `tail` carries the pointer direction
 *  and anchor — at render time the tail draws as a small triangle out
 *  of the bubble toward the anchor point. Anchor coordinates are
 *  fractional within the canvas (same convention as `WidgetPosition`),
 *  not relative to the bubble — so dragging the speaker doesn't break
 *  the tail. */
export interface SpeechBubbleWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  color: string;
  /** Bubble fill colour. */
  bgColor: string;
  /** Bubble border colour — the comic "ink". */
  strokeColor: string;
  /** Bubble border width in canvas pixels. */
  strokeWidth: number;
  /** "speech": rounded ovoid with a triangular tail (dialogue).
   *  "thought": cloud-shaped with circle puffs trailing to the speaker.
   *  "shout": jagged starburst (yelling).
   *  "whisper": dashed outline (whisper). */
  shape: "speech" | "thought" | "shout" | "whisper";
  /** Pointer tail. Null = no tail (a free-floating caption-style
   *  balloon, useful for narration set above a panel). */
  tail: {
    /** Fractional canvas coordinates of the tail tip — usually the
     *  speaker's mouth. Stored as a separate point so the bubble can
     *  move without losing its anchor. */
    anchorX: number;
    anchorY: number;
  } | null;
}

/** Caption box widget — the rectangular narration block at the top or
 *  bottom of a panel ("Meanwhile, across town…"). Distinct from a
 *  speech-bubble so the picker can surface it as a separate primitive
 *  and the scaffolder can place it deterministically (top vs bottom of
 *  the panel) without authoring a bubble shape. */
export interface CaptionBoxWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  color: string;
  bgColor: string;
  strokeColor: string;
  strokeWidth: number;
  /** Italic narration vs straight caption — affects the body font
   *  style only; everything else is shared. */
  italic: boolean;
}

/** Sound-effect widget — the chunky "POW!" / "BAM!" / "DOKI" type that
 *  reads as part of the comic art, not as dialogue. Renders as text
 *  inside a starburst or jagged-outline shape. */
export interface SfxBurstWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  /** Text fill colour. */
  color: string;
  /** Burst fill colour. */
  bgColor: string;
  /** Burst stroke (the heavy outline). */
  strokeColor: string;
  strokeWidth: number;
  /** Burst silhouette. "star": classic 12-point star.
   *  "jagged": jagged irregular polygon. "circle-jagged": rounded
   *  bumpy circle (impact). "lightning": lightning-bolt outline. */
  shape: "star" | "jagged" | "circle-jagged" | "lightning";
}

/** AI presenter avatar — 2D talking head with viseme-driven mouth
 *  shapes. `presenterId` picks from the STOCK_PRESENTERS library in
 *  `lib/studio/avatar/presenters.ts`. `script` is what the avatar should
 *  say; the inspector pipes it through the chosen TTS engine to drive
 *  mouth motion in preview, and the render pass paints visemes against
 *  the caption-cue timeline so the exported MP4 lip-syncs to the same
 *  audio that plays in the timeline (cloned-voice voiceovers ride this
 *  same lane). */
export interface AvatarWidgetParams {
  /** Presenter preset id — one of STOCK_PRESENTERS, or a future
   *  user-uploaded BYO portrait id (BYO uploads tracked in the gap
   *  register). */
  presenterId: string;
  /** Free-text script the avatar speaks. Drives both the audio (via
   *  TTS) and the viseme estimation (via `estimateVisemesForText`). */
  script: string;
  /** TTS engine id (see `frontend/lib/services/tts-engines.ts`). Defaults
   *  to "web-speech" when unset so the avatar speaks immediately even
   *  before a WebGPU engine has been picked. */
  engine?: import("../../services/tts-engines").TtsEngineId;
  /** Voice id within the engine's catalogue. The Voice Cloning library
   *  surfaces user-cloned voices through this same id space, so an
   *  avatar can speak in the user's cloned voice without a separate
   *  field. */
  voiceId?: string;
  /** Speaking rate (1 = natural). Threaded into the TTS engine. */
  speed?: number;
  /** Outfit-accent colour override — lets a brand designer match the
   *  avatar's accent to a campaign palette without forking the stock
   *  preset. `null` / undefined means use the preset's default. */
  accentColor?: string | null;
}

export type WidgetParams =
  | { kind: "text" | "heading"; data: TextWidgetParams }
  | { kind: "image"; data: ImageWidgetParams }
  | { kind: "video"; data: VideoWidgetParams }
  | { kind: "shape-rect" | "shape-circle"; data: ShapeWidgetParams }
  | { kind: "divider"; data: DividerWidgetParams }
  | { kind: "chart"; data: ChartWidgetParams }
  | { kind: "webcam"; data: WebcamWidgetParams }
  | { kind: "chips"; data: ChipsWidgetParams }
  | { kind: "cta"; data: CtaWidgetParams }
  | { kind: "linked-content"; data: LinkedContentWidgetParams }
  | { kind: "speech-bubble"; data: SpeechBubbleWidgetParams }
  | { kind: "caption-box"; data: CaptionBoxWidgetParams }
  | { kind: "sfx-burst"; data: SfxBurstWidgetParams }
  | { kind: "avatar"; data: AvatarWidgetParams };

/**
 * Per-widget container styling — background fill, border colour /
 * width, corner radius, padding. Applies to every widget kind via the
 * CanvasStage outer div so every primitive (text / image / video /
 * shape) can have a uniform container chrome without rewriting each
 * Body component. Mirrors v1's `ElementStyle` so a v1 project's
 * `style: { backgroundColor, borderColor, borderWidth, borderRadius,
 * padding }` round-trips unchanged.
 */
export interface ContainerStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  position: WidgetPosition;
  params: WidgetParams;
  /** When set, the widget only appears within this sub-range of the
   *  scene (in seconds from scene start). `null` means the widget is
   *  visible for the entire scene. */
  visibleFrom: number | null;
  visibleTo: number | null;
  /** Per-widget enter / exit animation. `null` means no motion — the
   *  widget pops in and out at the edges of its visibility window. */
  motion: import("./widget-motion").WidgetMotion | null;
  /** Optional container chrome (bg / border / radius / padding) applied
   *  uniformly across widget kinds. `undefined` means transparent (the
   *  widget body draws directly with no container). */
  containerStyle?: ContainerStyle;
  /** Optional per-widget visual effect chain (drop shadow, glow, blur,
   *  vignette, etc). Same `{kind, params}` shape v1 uses on
   *  `SceneEffect`, so the editor and the renderer route through the
   *  shared effect registry — no parallel effect schema. */
  effects?: Array<{ kind: string; params: Record<string, unknown> }>;
}

/** Enter animation specs preserved from v1's `scene.animation` so the
 *  v1 render path can replay the same title / subtitle / body fade-ins
 *  when a v1 project is opened, edited, and saved through v2. V2 doesn't
 *  use these natively — `Widget.motion` is the v2-native enter / exit
 *  affordance — but the v1 renderer reads them and the migration must
 *  be lossless (gap #611). */
export interface SceneEnterAnimations {
  titleEnter?: import("../../../types/video-script").AnimationSpec;
  subtitleEnter?: import("../../../types/video-script").AnimationSpec;
  textEnter?: import("../../../types/video-script").AnimationSpec;
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
  filters: import("../video-filters").VideoFilters | null;
  /** v1 `scene.type` enum preserved on import so the AI script rewriter
   *  + scene-type-aware features keep working after a v1→v2 migration
   *  (gap #611). Defaults to undefined for v2-native projects; the
   *  stopgap canvas-to-script emit falls back to an index heuristic. */
  sourceSceneType?: import("../../../types/video-script").SceneType;
  /** v1 `scene.animation` enter-animation block preserved on import for
   *  the same reason as `sourceSceneType`. */
  sourceEnterAnimations?: SceneEnterAnimations;
  /** v1 `scene.effects[]` — per-scene visual effects (particles / blur /
   *  glow / vignette). Stored at scene scope here so the import →
   *  edit → save round-trip preserves them even when the v2 inspector
   *  hasn't surfaced per-scene effect editing yet (gap #611). */
  effects?: import("../../../types/video-script").SceneEffect[];
  /** Per-boundary transition into THIS scene. Overrides the canvas-level
   *  `defaultTransition` when set; `null`/`undefined` means inherit the
   *  default. Mirrors v1's `scene.transitionIn` so the import →
   *  edit → save round-trip is lossless (gap #616). */
  transitionIn?: import("../motion-presets").TransitionKind | null;
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

/** Voiceover audio attached to the composition. Stored alongside the
 *  scenes so the v2 editor can show it in the timeline + emit it on
 *  save. The url is whatever the recorder produced (blob: in-memory
 *  for unsaved drafts, R2 cdn URL after first save). */
export interface VoiceoverClip {
  id: string;
  url: string;
  durationSeconds: number;
  /** Optional anchor — when set, the voiceover starts at that scene's
   *  beginning. `null` means start at composition 0. */
  anchorSceneId: string | null;
  /** Display label surfaced in the timeline strip. */
  label: string;
  /** Per-clip gain in the 0..1 range (1 = unity). Optional — preview
   *  and render fall back to 1 when absent. Mutated by `<AudioMixerV2>`. */
  gain?: number;
  /** Per-clip mute. Optional — preview / render treat absence as false. */
  muted?: boolean;
  /** Manual start-offset in seconds, added to the anchor scene's start
   *  (or composition 0 when no anchor). Lets the user nudge a
   *  voiceover earlier / later than the scene boundary without
   *  re-anchoring. Default 0 — pre-#567 rows keep current behavior. */
  startOffsetSec?: number;
  /** Fade-in duration in seconds (0..clip-duration). The scheduler
   *  ramps gain from 0 → effective over this window. Default 0. */
  fadeInSec?: number;
  /** Fade-out duration in seconds. Scheduler ramps gain from effective
   *  → 0 over the final `fadeOutSec` of the clip. Default 0. */
  fadeOutSec?: number;
  /** Manual trim — start playback this many seconds INTO the source
   *  file. Default 0 (play from the beginning). Used by drag-to-trim
   *  on the timeline bar's left edge. */
  trimStartSec?: number;
  /** Manual trim — end playback this many seconds BEFORE the end of
   *  the source file. Default 0 (play to the end). Used by drag-to-
   *  trim on the timeline bar's right edge. */
  trimEndSec?: number;
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
  /** Background music selection — single union that covers both stock
   *  catalog picks AND user-supplied custom music (Original Music
   *  Composer, R2 uploads, etc). Resolved to a playable URL via
   *  `resolveMusic()` in `lib/studio/music-catalog.ts` — single source
   *  of truth for "what music plays?" across preview, picker, and
   *  render. */
  musicSource: import("../music-catalog").MusicSource | null;
  /** Caption cues + style. `null` means captions haven't been authored
   *  yet — the CaptionEditor dialog still mounts to start them. */
  captions: CanvasCaptions | null;
  /** Voiceover clips. Appended by the Voiceover dialog; played on A2
   *  during preview + render. */
  voiceovers: VoiceoverClip[];
  /** Audio mix — master gain + per-lane gain / mute. `null` means
   *  defaults (DEFAULT_AUDIO_MIX). Optional so legacy rows without
   *  the field parse without migration. */
  audioMix?: CanvasAudioMix | null;
  /** Export codec id (see `lib/studio/codec-presets.ts`). Used by the
   *  render facade at export time. `null` defaults to h264. */
  codec: import("../codec-presets").Codec | null;
  /** Global animation intensity. Applied uniformly to widget enter/exit
   *  + transition durations. */
  motion: import("../motion-presets").MotionStyle | null;
  /** Default scene-to-scene transition. */
  defaultTransition: import("../motion-presets").TransitionKind | null;
  /** Global font family for text widgets that don't override their own.
   *  Stored as a font-catalog id, resolved via `fontFamilyFor()`. */
  fontFamily: string | null;
  /** 4-chip colour palette used by the theme + applied as a starting
   *  point when the user adds shape / text widgets. */
  colorPalette: import("../../../components/studio/shared/ColorPalettePicker").ColorPalette | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Constructors — single source of truth so the landing chooser, the
// editor's "+ Add scene", and the timeline-to-canvas import path all
// produce identical defaults.
// ───────────────────────────────────────────────────────────────────────────

export function emptyCanvasState(opts: {
  width?: number;
  height?: number;
  fps?: number;
} = {}): CanvasState {
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    fps: opts.fps ?? 30,
    scenes: [emptyScene("Scene 1")],
    themeId: null,
    musicSource: null,
    captions: null,
    voiceovers: [],
    codec: null,
    motion: null,
    defaultTransition: null,
    fontFamily: null,
    colorPalette: null,
  };
}

export function emptyScene(label: string): Scene {
  return {
    id: makeId("scene"),
    label,
    durationSeconds: 5,
    backgroundColor: "#0f172a",
    widgets: [],
    filters: null,
  };
}

/** Default widget bodies. Keeps the palette dispatch in WidgetPalette.tsx
 *  free of per-kind branching — the palette just calls `defaultWidget(kind)`. */
export function defaultWidget(kind: WidgetKind): Widget {
  const id = makeId("w");
  const position: WidgetPosition = {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.15,
    z: 1,
    rotation: 0,
  };
  switch (kind) {
    case "text":
      return {
        id,
        kind,
        position,
        params: {
          kind: "text",
          data: {
            text: "Your text here",
            fontPx: 32,
            color: "#ffffff",
            fontWeight: "normal",
            align: "left",
            background: null,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "heading":
      return {
        id,
        kind,
        position: { ...position, width: 0.6, height: 0.18 },
        params: {
          kind: "heading",
          data: {
            text: "Heading",
            fontPx: 72,
            color: "#ffffff",
            fontWeight: "bold",
            align: "left",
            background: null,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "image":
      return {
        id,
        kind,
        position: { ...position, width: 0.35, height: 0.45 },
        params: { kind: "image", data: { source: { kind: "url", url: "" }, fit: "cover" } },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "video":
      return {
        id,
        kind,
        position: { ...position, width: 0.5, height: 0.5 },
        params: { kind: "video", data: { source: { kind: "url", url: "" }, muted: false } },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "shape-rect":
      return {
        id,
        kind,
        position: { ...position, width: 0.3, height: 0.3 },
        params: {
          kind: "shape-rect",
          data: { fill: "#0ea5e9", strokeColor: "#ffffff", strokeWidth: 0, cornerRadius: 8 },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "shape-circle":
      return {
        id,
        kind,
        position: { ...position, width: 0.25, height: 0.25 },
        params: {
          kind: "shape-circle",
          data: { fill: "#22c55e", strokeColor: "#ffffff", strokeWidth: 0, cornerRadius: 0 },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "divider":
      return {
        id,
        kind,
        position: { ...position, width: 0.6, height: 0.02 },
        params: { kind: "divider", data: { color: "#ffffff", thickness: 2 } },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "chart":
      return {
        id,
        kind,
        position: { ...position, width: 0.6, height: 0.5 },
        params: {
          kind: "chart",
          data: {
            chartType: "bar",
            data: "category,value\nQ1,42\nQ2,65\nQ3,58\nQ4,81",
            format: "csv",
            title: "Quarterly results",
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "webcam":
      return {
        id,
        kind,
        position: { ...position, width: 0.4, height: 0.5 },
        params: {
          kind: "webcam",
          data: { recordingUrl: null, mirror: true, muted: false },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "chips":
      return {
        id,
        kind,
        position: { ...position, width: 0.6, height: 0.1 },
        params: {
          kind: "chips",
          data: {
            chips: ["TypeScript", "React", "Postgres"],
            fontPx: 14,
            chipColor: "#1e293b",
            textColor: "#f1f5f9",
            direction: "row",
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "cta":
      return {
        id,
        kind,
        position: { x: 0.15, y: 0.3, width: 0.7, height: 0.4, z: 10, rotation: 0 },
        params: {
          kind: "cta",
          data: {
            headline: "Ready to get started?",
            subheadline: "Tap below to learn more.",
            ctaText: "Learn more",
            ctaUrl: "",
            bgColor: "#0f172a",
            textColor: "#ffffff",
            accentColor: "#a78bfa",
            accentTextColor: "#0f172a",
            cardFontPx: 24,
            ctaFontPx: 14,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "linked-content":
      return makeLinkedContentWidget({ entityKind: "resume", entityId: "" });
    case "speech-bubble":
      return {
        id,
        kind,
        position: { x: 0.55, y: 0.1, width: 0.4, height: 0.22, z: 5, rotation: 0 },
        params: {
          kind: "speech-bubble",
          data: {
            text: "I knew this case would catch up with me.",
            fontPx: 22,
            color: "#0a0a0a",
            bgColor: "#ffffff",
            strokeColor: "#0a0a0a",
            strokeWidth: 3,
            shape: "speech",
            // Default anchor sits below the bubble pointing down-left
            // at a typical character spot. The user drags the dot in
            // the inspector to retarget.
            tail: { anchorX: 0.4, anchorY: 0.55 },
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "caption-box":
      return {
        id,
        kind,
        position: { x: 0.05, y: 0.05, width: 0.9, height: 0.1, z: 4, rotation: 0 },
        params: {
          kind: "caption-box",
          data: {
            text: "MEANWHILE, ACROSS TOWN…",
            fontPx: 18,
            color: "#1c1917",
            bgColor: "#fef3c7",
            strokeColor: "#1c1917",
            strokeWidth: 2,
            italic: false,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "sfx-burst":
      return {
        id,
        kind,
        position: { x: 0.35, y: 0.3, width: 0.25, height: 0.25, z: 6, rotation: -12 },
        params: {
          kind: "sfx-burst",
          data: {
            text: "POW!",
            fontPx: 48,
            color: "#0a0a0a",
            bgColor: "#facc15",
            strokeColor: "#0a0a0a",
            strokeWidth: 4,
            shape: "star",
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
    case "avatar":
      return {
        id,
        kind,
        position: { x: 0.6, y: 0.1, width: 0.35, height: 0.8, z: 5, rotation: 0 },
        params: {
          kind: "avatar",
          data: {
            presenterId: "presenter-amber",
            script: "",
            engine: "web-speech",
            voiceId: "",
            speed: 1,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
  }
}

/** Build a linked-content widget bound to a specific entity. Used by
 *  the palette's "Your content" section and the drag-drop pipeline so
 *  both surfaces produce identical default geometry / params. */
export function makeLinkedContentWidget(
  params: LinkedContentWidgetParams,
): Widget {
  return {
    id: makeId("w"),
    kind: "linked-content",
    position: { x: 0.1, y: 0.15, width: 0.42, height: 0.55, z: 1, rotation: 0 },
    params: { kind: "linked-content", data: params },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Deep-clone a widget with a freshly-minted id. Used by the editor's
 *  copy/paste flow so the same source widget can be pasted multiple
 *  times without colliding ids. structuredClone keeps nested params
 *  (text/image/shape/etc) decoupled from the source. */
export function cloneWidgetWithNewId(widget: Widget): Widget {
  return { ...structuredClone(widget), id: makeId("w") };
}

/** Deep-clone a scene + all of its widgets with freshly-minted ids.
 *  Used by paste-scene so the duplicated scene's widget ids don't
 *  collide with the original's. */
export function cloneSceneWithNewIds(scene: Scene): Scene {
  const cloned = structuredClone(scene);
  return {
    ...cloned,
    id: makeId("scene"),
    widgets: cloned.widgets.map((w) => ({ ...w, id: makeId("w") })),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Derived helpers — every consumer that asks "what's the total length?"
// or "find a widget by id" calls these instead of hand-rolling the loop.
// ───────────────────────────────────────────────────────────────────────────

export function totalDurationSeconds(state: CanvasState): number {
  return state.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

export function findWidget(
  state: CanvasState,
  widgetId: string,
): { scene: Scene; widget: Widget } | null {
  for (const scene of state.scenes) {
    const widget = scene.widgets.find((w) => w.id === widgetId);
    if (widget) return { scene, widget };
  }
  return null;
}

export function findScene(state: CanvasState, sceneId: string): Scene | null {
  return state.scenes.find((s) => s.id === sceneId) ?? null;
}

// Fold rotation into [-180, 180) so the input stays readable after many
// spins and a user can type -45 directly without snapping to 315. Shared
// by the inspector's degrees field and the canvas rotation-drag handle.
export function normalizeRotationDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Apply a visual theme to the entire canvas state. Recolours every scene
 * background to the theme's primary, and recolours every text/heading
 * widget to the theme's accent for contrast. Single source of truth so
 * the v2 editor's "Pick theme" action and any other consumer (e.g. a
 * future "apply on import" flow) produce identical state.
 */
export function applyThemeToState(
  state: CanvasState,
  theme: { id: string; colors: [string, string, string] },
): CanvasState {
  const [themePrimary, themeAccent, themeSurface] = theme.colors;
  // #582 — `state.colorPalette` (4-chip custom palette
  // [primary, accent, surface, neutral]) is a real override layer. When
  // the user has set one, its entries take precedence over the theme
  // triple so reapplying a theme doesn't clobber the user's palette
  // choices. The triple is only the fallback for unset chip slots.
  const palette = state.colorPalette;
  const primary = palette?.[0] ?? themePrimary;
  const accent = palette?.[1] ?? themeAccent;
  const surface = palette?.[2] ?? themeSurface;
  // Resolve linked-content card colours against the same theme so a
  // resume / job card already on the canvas re-themes when the user
  // picks a new visual theme. Single source of truth lives in
  // `resolveLinkedContentColors` so insert-time stamping and re-theme
  // stamping can't drift.
  const themedState: CanvasState = {
    ...state,
    themeId: theme.id,
  };
  const linkedColors = resolveLinkedContentColors(themedState);
  return {
    ...themedState,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      backgroundColor: primary,
      widgets: scene.widgets.map((w) => {
        if (w.params.kind === "text" || w.params.kind === "heading") {
          return {
            ...w,
            params: {
              kind: w.params.kind,
              data: {
                ...w.params.data,
                color: w.params.kind === "heading" ? accent : surface,
              },
            },
          };
        }
        if (w.params.kind === "linked-content") {
          return {
            ...w,
            params: {
              kind: "linked-content",
              data: stampLinkedContentColors(w.params.data, linkedColors),
            },
          };
        }
        return w;
      }),
    })),
  };
}

// ─── Audio-timeline mutators (#1115) ──────────────────────────────────────
//
// Single seam for the audio-timeline drag UI's per-clip edits. The
// AudioBar component fires `onChange` per drag tick with the next
// timing snapshot; the host translates that into one of these calls.
// Mutators are STRUCTURAL-SHARE pure functions matching the rest of
// the canvas-state mutators — undo/redo participates via the same
// `useCanvasHistory` wrapper.

/** Patch a voiceover clip's timing fields in place. Per-clip fields
 *  on `VoiceoverClip` (`startOffsetSec` / `fadeInSec` / `fadeOutSec` /
 *  `trimStartSec` / `trimEndSec` / `gain` / `muted`) are all optional;
 *  passing `undefined` keeps the existing value, passing `0` writes
 *  it. Unknown ids are no-ops. */
export function updateVoiceoverClip(
  state: CanvasState,
  voiceoverId: string,
  patch: Partial<Pick<VoiceoverClip,
    | "startOffsetSec"
    | "fadeInSec"
    | "fadeOutSec"
    | "trimStartSec"
    | "trimEndSec"
    | "gain"
    | "muted"
    | "anchorSceneId"
  >>,
): CanvasState {
  return {
    ...state,
    voiceovers: state.voiceovers.map((vo) =>
      vo.id === voiceoverId ? { ...vo, ...patch } : vo,
    ),
  };
}

/** Patch the music source's timing controls. No-op when no music
 *  source is set (the audio-timeline bar self-hides in that case).
 *  Both stock + custom sources accept the same `MusicTimingControls`
 *  fields. */
export function updateMusicTiming(
  state: CanvasState,
  patch: {
    startOffsetSec?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
  },
): CanvasState {
  if (!state.musicSource) return state;
  return {
    ...state,
    musicSource: { ...state.musicSource, ...patch },
  };
}

