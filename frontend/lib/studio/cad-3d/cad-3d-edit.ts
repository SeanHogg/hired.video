/**
 * CAD 3D state mutators (#930 Phase 2).
 *
 * Pure functions that take a `Cad3DState`, apply a single edit, and
 * return the next state. The host wraps each call in its own
 * `commit(next)` for undo/redo so this layer stays history-agnostic.
 *
 * Per the DRY rule the AI agent (when it lands) calls the same
 * functions the inspector + palette already use — no parallel "agent
 * API" that bypasses the seam.
 */

import type {
  Cad3DState,
  CadEntity3D,
  CadBox,
  CadCylinder3D,
  CadSphere,
  CadExtrusion,
  CadBooleanOp,
  V3,
} from "@shared/cad-3d-state";

let entityCounter = 0;
function nextEntityId(prefix: string): string {
  entityCounter += 1;
  // Deterministic-ish id — high enough entropy for collision-free
  // session-local ids without bringing crypto.randomUUID() into this
  // pure module (caller may run in Node, browser, or Worker).
  return `${prefix}-${Date.now().toString(36)}-${entityCounter.toString(36)}`;
}

/** Insert a new box primitive at the build-volume centre. */
export function addBox(state: Cad3DState, dims?: Partial<{ widthMm: number; heightMm: number; depthMm: number }>): Cad3DState {
  const entity: CadBox = {
    id: nextEntityId("box"),
    kind: "box",
    widthMm: dims?.widthMm ?? 20,
    heightMm: dims?.heightMm ?? 20,
    depthMm: dims?.depthMm ?? 20,
    translate: centreOfBuildVolume(state),
  };
  return appendEntity(state, entity);
}

/** Insert a new cylinder primitive. */
export function addCylinder(
  state: Cad3DState,
  dims?: Partial<{ radiusMm: number; heightMm: number }>,
): Cad3DState {
  const entity: CadCylinder3D = {
    id: nextEntityId("cyl"),
    kind: "cylinder",
    radiusMm: dims?.radiusMm ?? 10,
    heightMm: dims?.heightMm ?? 30,
    translate: centreOfBuildVolume(state),
  };
  return appendEntity(state, entity);
}

/** Insert a new sphere primitive. */
export function addSphere(
  state: Cad3DState,
  dims?: Partial<{ radiusMm: number }>,
): Cad3DState {
  const entity: CadSphere = {
    id: nextEntityId("sph"),
    kind: "sphere",
    radiusMm: dims?.radiusMm ?? 12,
    translate: centreOfBuildVolume(state),
  };
  return appendEntity(state, entity);
}

/** Insert a new extrusion from a 2D profile. */
export function addExtrusion(
  state: Cad3DState,
  profile: Array<{ x: number; y: number }>,
  depthMm: number,
): Cad3DState {
  const entity: CadExtrusion = {
    id: nextEntityId("ext"),
    kind: "extrude",
    profile,
    depthMm,
    translate: centreOfBuildVolume(state),
  };
  return appendEntity(state, entity);
}

/** Group N entities under a boolean op (union / difference /
 *  intersection). The children retain their own positions; the boolean
 *  op evaluates at render time (or, until the CSG kernel lands, renders
 *  the children layered with a pending-op marker). */
export function addBooleanOp(
  state: Cad3DState,
  op: "union" | "difference" | "intersection",
  childIds: string[],
): Cad3DState {
  if (childIds.length < 2) {
    throw new Error(`addBooleanOp: need at least 2 children, got ${childIds.length}`);
  }
  const entity: CadBooleanOp = {
    id: nextEntityId("bool"),
    kind: "boolean",
    op,
    children: childIds,
  };
  return appendEntity(state, entity);
}

/** Delete entities by id. Children of boolean ops are NOT auto-deleted
 *  when the op is removed (matches Fusion 360's behaviour — feature
 *  removal preserves the underlying bodies). */
export function deleteEntities(state: Cad3DState, ids: string[]): Cad3DState {
  const idSet = new Set(ids);
  return {
    ...state,
    entities: state.entities.filter((e) => !idSet.has(e.id)),
    selectedIds: state.selectedIds.filter((s) => !idSet.has(s)),
  };
}

/** Mutate one entity by id — caller supplies the partial diff. */
export function updateEntity<E extends CadEntity3D>(
  state: Cad3DState,
  id: string,
  patch: Partial<E>,
): Cad3DState {
  return {
    ...state,
    entities: state.entities.map((e) =>
      e.id === id ? ({ ...e, ...patch } as CadEntity3D) : e,
    ),
  };
}

/** Replace the entity's translate field. Used by drag handles + AI
 *  agent reposition commands. */
export function setEntityTranslate(state: Cad3DState, id: string, translate: V3): Cad3DState {
  return updateEntity(state, id, { translate } as Partial<CadEntity3D>);
}

function centreOfBuildVolume(state: Cad3DState): V3 {
  return {
    x: state.buildVolumeMm.x / 2,
    y: state.buildVolumeMm.y / 2,
    z: state.buildVolumeMm.z / 2,
  };
}

function appendEntity(state: Cad3DState, entity: CadEntity3D): Cad3DState {
  return {
    ...state,
    entities: [...state.entities, entity],
    selectedIds: [entity.id],
  };
}
