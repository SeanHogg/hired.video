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
  | "divider";

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

export type WidgetParams =
  | { kind: "text" | "heading"; data: TextWidgetParams }
  | { kind: "image"; data: ImageWidgetParams }
  | { kind: "video"; data: VideoWidgetParams }
  | { kind: "shape-rect" | "shape-circle"; data: ShapeWidgetParams }
  | { kind: "divider"; data: DividerWidgetParams };

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
}

export interface Scene {
  id: string;
  label: string;
  /** Duration in seconds. */
  durationSeconds: number;
  backgroundColor: string;
  widgets: Widget[];
}

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
  /** Stock music track id last applied (see `lib/studio/music-catalog.ts`).
   *  The render facade reads this and lays the track on the timeline's
   *  A1 audio track at render time. `null` means no music. */
  musicTrackId: string | null;
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
    musicTrackId: null,
  };
}

export function emptyScene(label: string): Scene {
  return {
    id: makeId("scene"),
    label,
    durationSeconds: 5,
    backgroundColor: "#0f172a",
    widgets: [],
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
      };
    case "image":
      return {
        id,
        kind,
        position: { ...position, width: 0.35, height: 0.45 },
        params: { kind: "image", data: { source: { kind: "url", url: "" }, fit: "cover" } },
        visibleFrom: null,
        visibleTo: null,
      };
    case "video":
      return {
        id,
        kind,
        position: { ...position, width: 0.5, height: 0.5 },
        params: { kind: "video", data: { source: { kind: "url", url: "" }, muted: false } },
        visibleFrom: null,
        visibleTo: null,
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
      };
    case "divider":
      return {
        id,
        kind,
        position: { ...position, width: 0.6, height: 0.02 },
        params: { kind: "divider", data: { color: "#ffffff", thickness: 2 } },
        visibleFrom: null,
        visibleTo: null,
      };
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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
  const [primary, accent, surface] = theme.colors;
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

