/**
 * CAD state spec — the canonical JSON shape for `mediaKind: "cad"`
 * studio projects (2D drafting MVP per #930). Parallel to:
 *   - `shared/timeline.ts` (Timeline runtime)
 *   - `shared/game-state.ts` (Game runtime)
 *   - `shared/image-state.ts` (Image runtime — raster)
 *   - `shared/animation-state.ts` (Animation runtime)
 *
 * Each canvas runtime owns its own state model per PRD §1.2 canvas-
 * runtime extensibility. CAD is the first VECTOR runtime — entities
 * are mathematical shapes (lines, arcs, polylines, circles, dimensions,
 * text) with absolute coordinates in millimetres, not raster pixels.
 *
 * SCOPE (Phase 1 — this scaffold):
 *   - 2D drafting only. 3D modeling (#930's "OR 3D" branch) gets its
 *     own state shape if it ships — likely `shared/cad-3d-state.ts`.
 *   - Six shape primitives: line, polyline, circle, rectangle,
 *     dimension, text. STEP / DXF / 3D-specific shapes deferred.
 *   - Single drawing space (no model/paper layouts yet).
 *   - Snapping + grid declared on state but not rendered until the
 *     stage component grows past the MVP scaffold.
 *
 * DEFERRED (when the editor's CAD surface matures past scaffold):
 *   - Layers (each shape currently has a `layer` string field for the
 *     forward-compat slot).
 *   - Blocks / groups / xrefs.
 *   - Constraints (parametric, geometric).
 *   - STEP / STL / DXF export pipelines (use the cad-export module
 *     when it ships; profile ids already declared in media-kinds.ts).
 */

export const CAD_STATE_SCHEMA_VERSION = 1;

/** Typed layer aggregate (#930 follow-on). Each shape belongs to a
 *  layer by name; the layer controls visibility / lock / colour
 *  defaults. Matches AutoCAD's drawing-layer convention so the DXF
 *  exporter can round-trip layer membership cleanly. */
export interface CadLayer {
  /** Stable name — also the foreign key from each `CadShape.layer`. */
  name: string;
  /** When false the layer is hidden in the editor + skipped on
   *  export. */
  visible: boolean;
  /** When true the layer is read-only (no new shapes; existing
   *  shapes can be selected but not moved or deleted). */
  locked: boolean;
  /** Layer colour (#rrggbb). Shapes without an explicit `color`
   *  inherit this when rendering / exporting. */
  color: string;
}

/** Default layer that every CAD project ships with. Matches AutoCAD's
 *  "0" layer convention — every shape lands here when no layer is
 *  explicitly selected. */
export const DEFAULT_CAD_LAYER: CadLayer = {
  name: "0",
  visible: true,
  locked: false,
  color: "#000000",
};

/** All shapes share a stable id + a layer name (foreign key into
 *  `state.layers`). Coordinates are in millimetres relative to drawing
 *  origin (0,0 = bottom-left). */
export interface CadShapeBase {
  id: string;
  layer: string;
  /** Stroke colour as #rrggbb. Defaults to layer colour when omitted. */
  color?: string;
  /** Stroke weight in millimetres. Defaults to 0.25mm (the AutoCAD
   *  default) when omitted. */
  strokeWidthMm?: number;
}

export type CadShape =
  | CadLine
  | CadPolyline
  | CadCircle
  | CadRect
  | CadDimension
  | CadText;

export interface CadLine extends CadShapeBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CadPolyline extends CadShapeBase {
  kind: "polyline";
  /** Ordered vertices. Polylines are open unless `closed = true`. */
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
}

export interface CadCircle extends CadShapeBase {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
}

export interface CadRect extends CadShapeBase {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional corner radius in mm — non-zero values render rounded
   *  rectangles. Defaults to 0 (sharp corners). */
  cornerRadius?: number;
}

/** Linear dimension — measures the distance between two points. The
 *  drafting-standard dimension carries its own offset + extension
 *  lines, plus the auto-measured label. */
export interface CadDimension extends CadShapeBase {
  kind: "dimension";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Perpendicular offset of the dimension line from the measured
   *  segment, in mm. Positive offsets sit above the segment when
   *  reading left-to-right. */
  offsetMm: number;
  /** Optional label override — when omitted the renderer computes
   *  the actual measured distance + appends the configured unit. */
  label?: string;
}

export interface CadText extends CadShapeBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  /** Text height in mm — drafting convention (NOT a point size). */
  heightMm: number;
  /** Rotation in degrees, counter-clockwise from horizontal. */
  rotation?: number;
}

/** Grid + snap settings — declared now so the stage component can pick
 *  them up incrementally without a state migration. */
export interface CadGridSettings {
  /** Visible grid spacing in mm. */
  visibleSpacingMm: number;
  /** Snap-to-grid increment in mm. The pointer snaps to multiples
   *  of this value while a tool is active. */
  snapSpacingMm: number;
  /** When true the stage paints a grid; when false it shows a blank
   *  white drawing space. */
  showGrid: boolean;
  /** When true the cursor snaps to `snapSpacingMm` increments. */
  snapEnabled: boolean;
}

export const DEFAULT_GRID_SETTINGS: CadGridSettings = {
  visibleSpacingMm: 10,
  snapSpacingMm: 1,
  showGrid: true,
  snapEnabled: true,
};

export interface CadState {
  schemaVersion: number;
  /** Drawing extents in millimetres. Defaults to a standard ISO A3
   *  sheet (420×297mm) so a fresh project lands on a sensible canvas. */
  widthMm: number;
  heightMm: number;
  /** Unit suffix for dimension labels. The runtime computes the
   *  numeric distance in mm and converts via `unit` when rendering. */
  unit: "mm" | "cm" | "m" | "in" | "ft";
  /** Shapes in z-order. Index 0 is drawn FIRST (back), last is on
   *  top. Same convention as image layers and game sprites. */
  shapes: CadShape[];
  /** Typed layers (#930 follow-on). When absent, callers fall back to
   *  the implicit "0" layer; the field becomes required at the next
   *  schema bump. Layers control visibility + lock + default colour
   *  for every shape that names them. */
  layers?: CadLayer[];
  /** Which layer the drafting tools write to. Defaults to "0" when
   *  omitted. */
  activeLayerName?: string;
  grid: CadGridSettings;
  /** Selected shape ids — multi-select is the canonical CAD
   *  interaction, so this is an array, not a single id. */
  selectedIds: string[];
}

// ─── Factory + helpers ─────────────────────────────────────────────────────

export const DEFAULT_CAD_WIDTH_MM = 420; // ISO A3 landscape width
export const DEFAULT_CAD_HEIGHT_MM = 297;

/** Build a blank CAD state — used by the StudioEditorV2 hydration path
 *  when a fresh `mediaKind: 'cad'` project loads with `cad_state` null. */
export function createBlankCadState(opts: {
  widthMm?: number;
  heightMm?: number;
  unit?: CadState["unit"];
} = {}): CadState {
  return {
    schemaVersion: CAD_STATE_SCHEMA_VERSION,
    widthMm: opts.widthMm ?? DEFAULT_CAD_WIDTH_MM,
    heightMm: opts.heightMm ?? DEFAULT_CAD_HEIGHT_MM,
    unit: opts.unit ?? "mm",
    shapes: [],
    layers: [{ ...DEFAULT_CAD_LAYER }],
    activeLayerName: DEFAULT_CAD_LAYER.name,
    grid: { ...DEFAULT_GRID_SETTINGS },
    selectedIds: [],
  };
}

/** Append a layer to the state. Names must be unique — duplicate
 *  names return the state unchanged. */
export function addLayer(state: CadState, layer: CadLayer): CadState {
  const existing = state.layers ?? [];
  if (existing.some((l) => l.name === layer.name)) return state;
  return { ...state, layers: [...existing, layer] };
}

/** Remove a layer + every shape that named it. No-op when the layer
 *  doesn't exist or when it's the last remaining layer (a CAD drawing
 *  always has at least one layer). */
export function removeLayer(state: CadState, name: string): CadState {
  const existing = state.layers ?? [];
  if (existing.length <= 1) return state;
  if (!existing.some((l) => l.name === name)) return state;
  const remainingLayers = existing.filter((l) => l.name !== name);
  const remainingShapes = state.shapes.filter((s) => s.layer !== name);
  const nextActive =
    state.activeLayerName === name
      ? remainingLayers[0]?.name
      : state.activeLayerName;
  return {
    ...state,
    layers: remainingLayers,
    shapes: remainingShapes,
    activeLayerName: nextActive,
  };
}

/** Patch a layer's visible / locked / color fields. */
export function updateLayer(
  state: CadState,
  name: string,
  patch: Partial<Omit<CadLayer, "name">>,
): CadState {
  const existing = state.layers ?? [];
  return {
    ...state,
    layers: existing.map((l) => (l.name === name ? { ...l, ...patch } : l)),
  };
}

/** Stable id helper for shape insertion. */
export function makeShapeId(): string {
  return `cad-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve a shape by id. */
export function findShape(state: CadState, id: string): CadShape | null {
  return state.shapes.find((s) => s.id === id) ?? null;
}

/** Append a shape — returns a new state with the shape on top of the
 *  z-stack. Structural-share matches the other runtime mutators. */
export function addShape(state: CadState, shape: CadShape): CadState {
  return { ...state, shapes: [...state.shapes, shape] };
}

/** Remove a shape by id; no-op when the id doesn't resolve. */
export function removeShape(state: CadState, id: string): CadState {
  return {
    ...state,
    shapes: state.shapes.filter((s) => s.id !== id),
    selectedIds: state.selectedIds.filter((s) => s !== id),
  };
}

/** Update a shape in place (matching id). Discriminated-union
 *  arithmetic preserved — callers pass a `Partial<CadShape>` of the
 *  same kind. */
export function updateShape<T extends CadShape>(
  state: CadState,
  id: string,
  patch: Partial<T>,
): CadState {
  return {
    ...state,
    shapes: state.shapes.map((s) =>
      s.id === id ? ({ ...s, ...patch } as CadShape) : s,
    ),
  };
}

/** Replace the selection set. Empty array deselects. */
export function setSelection(state: CadState, ids: string[]): CadState {
  return { ...state, selectedIds: ids };
}

/** Total drawing extents — used for export-pipeline page sizing. */
export function drawingBoundsMm(state: CadState): {
  widthMm: number;
  heightMm: number;
} {
  return { widthMm: state.widthMm, heightMm: state.heightMm };
}
