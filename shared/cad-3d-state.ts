/**
 * CAD 3D state spec (#930 follow-on stub) — 3D modelling runtime
 * track that parallels the 2D drafting state in `shared/cad-state.ts`.
 *
 * RUNTIME TRACK: `mediaKind: "cad_3d"` (not yet registered in
 * `MEDIA_KINDS` — registration ships when the Three.js + replicad /
 * OpenCascade BREP integration is wired so we don't surface a broken
 * kind in the picker. This file defines the JSONB shape so future
 * BREP work can compile against a stable spec).
 *
 * STATE MODEL: each entity is a primitive solid (box / cylinder /
 * sphere / extrude) or a constructive operation (union / difference /
 * intersection) referencing two or more children by id. Materials +
 * units carry forward from the 2D state's conventions.
 *
 * PAIRS WITH:
 *   - `shared/cad-state.ts` (2D drafting — the existing `mediaKind: "cad"`)
 *   - `frontend/lib/studio/cad/cad-stl-encoder.ts` (the 2D encoder
 *      already extrudes shapes to 3D STL — when this runtime ships,
 *      its native STL encoder can subsume that path)
 *
 * INTENTIONAL OMISSIONS (logged): fillets, chamfers, sweeps, lofts —
 * the BREP kernel will expose them; the state shape is forward-compat
 * only for the boolean-op primitives that matter for the v0 ship.
 */

export const CAD_3D_STATE_SCHEMA_VERSION = 1;

/** Three-dimensional point in millimetres. */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion rotation. Stored as [x, y, z, w] so the BREP kernel
 *  (replicad uses gp_Quaternion under the hood) can read straight
 *  through without conversion. */
export type Quat = [number, number, number, number];

/** Material assigned to a solid — drives the renderer + the STL /
 *  STEP exporter's material slot when slicer software supports it. */
export interface CadMaterial {
  id: string;
  label: string;
  color: string;
  /** Density g/cm³ — used by the mass/cost estimator. */
  densityGCm3?: number;
}

export interface PrimitiveBase {
  id: string;
  /** Optional layer / group name — drives visibility + locking. */
  group?: string;
  translate?: V3;
  rotate?: Quat;
  /** Per-primitive scale around its local origin. Defaults to 1,1,1. */
  scale?: V3;
  /** Material id (resolved from `state.materials`). When omitted the
   *  default material is used. */
  materialId?: string;
}

export interface CadBox extends PrimitiveBase {
  kind: "box";
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface CadCylinder3D extends PrimitiveBase {
  kind: "cylinder";
  radiusMm: number;
  heightMm: number;
  segments?: number;
}

export interface CadSphere extends PrimitiveBase {
  kind: "sphere";
  radiusMm: number;
  segments?: number;
}

export interface CadExtrusion extends PrimitiveBase {
  kind: "extrude";
  /** 2D polygon profile in mm (XY plane). Extruded along +Z. */
  profile: Array<{ x: number; y: number }>;
  depthMm: number;
}

export interface CadBooleanOp extends PrimitiveBase {
  kind: "boolean";
  /** Operation: union / difference / intersection. */
  op: "union" | "difference" | "intersection";
  /** Child entity ids. Order matters for `difference` (first -
   *  remaining children). */
  children: string[];
}

export type CadEntity3D = CadBox | CadCylinder3D | CadSphere | CadExtrusion | CadBooleanOp;

export interface Cad3DState {
  schemaVersion: number;
  /** Drawing units — mm by default. */
  unit: "mm" | "cm" | "m" | "in" | "ft";
  /** Global build-volume hint for the editor's grid + camera fit. */
  buildVolumeMm: V3;
  /** All entities in the scene. Boolean ops reference children by id;
   *  the renderer evaluates the graph at render time. */
  entities: CadEntity3D[];
  /** Material palette. */
  materials: CadMaterial[];
  /** Default material when an entity omits `materialId`. */
  defaultMaterialId: string;
  /** Currently selected entity ids (multi-select). */
  selectedIds: string[];
}

const DEFAULT_MATERIAL: CadMaterial = {
  id: "mat-pla-white",
  label: "PLA · White",
  color: "#fafafa",
  densityGCm3: 1.24,
};

export function createBlankCad3DState(): Cad3DState {
  return {
    schemaVersion: CAD_3D_STATE_SCHEMA_VERSION,
    unit: "mm",
    buildVolumeMm: { x: 220, y: 220, z: 250 },
    entities: [],
    materials: [DEFAULT_MATERIAL],
    defaultMaterialId: DEFAULT_MATERIAL.id,
    selectedIds: [],
  };
}
