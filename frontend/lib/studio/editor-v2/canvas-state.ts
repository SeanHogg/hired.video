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
  | "cta";

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
}

export interface VideoWidgetParams {
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  muted: boolean;
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
  | { kind: "cta"; data: CtaWidgetParams };

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
}

export const DEFAULT_AUDIO_MIX: CanvasAudioMix = {
  masterGain: 1,
  musicGain: 0.6,
  musicMuted: false,
  voiceoverGain: 1,
  voiceoverMuted: false,
};

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
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
      };
  }
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
  return {
    ...state,
    themeId: theme.id,
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
        return w;
      }),
    })),
  };
}

