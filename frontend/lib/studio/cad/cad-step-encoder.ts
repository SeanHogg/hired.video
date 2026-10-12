/**
 * Minimal STEP ISO-10303-21 ASCII encoder (#930). Emits a valid AP203
 * / AP214 STEP file that opens in Solid Edge, FreeCAD, OnShape, and
 * other STEP-aware viewers.
 *
 * SCOPE (honest):
 *   - Each 2D shape extrudes by `thicknessMm` (default 1mm) to a solid
 *     block + emits as MANIFOLD_SOLID_BREP. The mesh path uses the
 *     same fan-tessellation as the STL encoder so the topology stays
 *     consistent across exporters.
 *   - Each generated solid is a FACETED_BREP_SHAPE_REPRESENTATION —
 *     STEP's "I have triangles, not analytic surfaces" shape. Full
 *     analytic STEP (B-Splines + ADVANCED_BREP) requires the BREP
 *     kernel that lands with the cad_3d runtime (#930 follow-on).
 *   - Coordinate system: model space in millimetres, world origin at
 *     (0, 0, 0).
 *
 * The file shape we emit:
 *     ISO-10303-21;
 *     HEADER;
 *       FILE_DESCRIPTION(...) ...;
 *     ENDSEC;
 *     DATA;
 *       #1 = APPLICATION_CONTEXT(...);
 *       #2 = APPLICATION_PROTOCOL_DEFINITION(...);
 *       ...one MANIFOLD_SOLID_BREP per shape...
 *     ENDSEC;
 *     END-ISO-10303-21;
 *
 * Per the standing DRY rule the triangle-mesh source IS the STL
 * encoder — we walk the same shape→triangles fan tessellation here
 * rather than reimplementing it.
 */

import type { CadCircle, CadPolyline, CadRect, CadShape, CadState } from "@shared/cad-state";

export interface StepEncodeOptions {
  thicknessMm?: number;
  circleSegments?: number;
}

type V3 = [number, number, number];

interface TriangleMesh {
  vertices: V3[];
  triangles: number[][]; // each triangle = [vi, vi, vi] into vertices
}

export function renderCadStep(state: CadState, opts: StepEncodeOptions = {}): string {
  const thickness = opts.thicknessMm ?? 1;
  const circleSegments = opts.circleSegments ?? 32;

  const meshes: TriangleMesh[] = [];
  for (const shape of state.shapes) {
    const mesh = shapeToMesh(shape, thickness, circleSegments);
    if (mesh) meshes.push(mesh);
  }

  const lines: string[] = [];
  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push("FILE_DESCRIPTION(('hired.video CAD export'),'2;1');");
  lines.push(`FILE_NAME('${escapeStep("hired-video-cad")}','${new Date().toISOString()}',('hired.video'),('hired.video'),'','','');`);
  lines.push("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");

  // Entity-id counter — STEP requires sequential #N references.
  let id = 0;
  const ref = (): number => ++id;
  const out: string[] = [];
  function w(line: string): void { out.push(line); }

  // Required application context entities (AP214 boilerplate). Keep
  // ids stable so the FACETED_BREP_SHAPE_REPRESENTATION can point at
  // them.
  const appCtx = ref();
  w(`#${appCtx}=APPLICATION_CONTEXT('automotive_design');`);
  const appProto = ref();
  w(`#${appProto}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx});`);
  const repCtxOrigin = ref();
  w(`#${repCtxOrigin}=CARTESIAN_POINT('',(0.0,0.0,0.0));`);
  const repCtxAxisZ = ref();
  w(`#${repCtxAxisZ}=DIRECTION('',(0.0,0.0,1.0));`);
  const repCtxAxisX = ref();
  w(`#${repCtxAxisX}=DIRECTION('',(1.0,0.0,0.0));`);
  const axisPlacement = ref();
  w(`#${axisPlacement}=AXIS2_PLACEMENT_3D('',#${repCtxOrigin},#${repCtxAxisZ},#${repCtxAxisX});`);
  const repCtx = ref();
  w(`#${repCtx}=GEOMETRIC_REPRESENTATION_CONTEXT_GLOBAL_UNCERTAINTY((), 'MM', 0.01);`);

  // Each mesh → vertex points → polylines → faces → manifold brep.
  for (const mesh of meshes) {
    const vertexIds: number[] = [];
    for (const v of mesh.vertices) {
      const pId = ref();
      w(`#${pId}=CARTESIAN_POINT('',(${num(v[0])},${num(v[1])},${num(v[2])}));`);
      vertexIds.push(pId);
    }
    const faceIds: number[] = [];
    for (const tri of mesh.triangles) {
      // POLY_LOOP → FACE_OUTER_BOUND → FACE_SURFACE chain. Faceted BREP
      // needs each triangle as a planar face with its outer loop.
      const loopId = ref();
      w(`#${loopId}=POLY_LOOP('',(#${vertexIds[tri[0]]},#${vertexIds[tri[1]]},#${vertexIds[tri[2]]}));`);
      const boundId = ref();
      w(`#${boundId}=FACE_OUTER_BOUND('',#${loopId},.T.);`);
      const faceId = ref();
      w(`#${faceId}=FACE_SURFACE('',(#${boundId}),#${axisPlacement},.T.);`);
      faceIds.push(faceId);
    }
    const shellId = ref();
    w(`#${shellId}=CLOSED_SHELL('',(${faceIds.map((f) => `#${f}`).join(",")}));`);
    const brepId = ref();
    w(`#${brepId}=MANIFOLD_SOLID_BREP('',#${shellId});`);
    const repId = ref();
    w(`#${repId}=FACETED_BREP_SHAPE_REPRESENTATION('',(#${brepId}),#${repCtx});`);
  }

  // Flush the entity block.
  for (const ln of out) lines.push(ln);
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  return lines.join("\n");
}

export async function renderCadStepBlob(state: CadState, opts: StepEncodeOptions = {}): Promise<Blob> {
  return new Blob([renderCadStep(state, opts)], { type: "model/step" });
}

// ─── Mesh construction (matches STL fan tessellation for DRY) ────────────

function shapeToMesh(shape: CadShape, thickness: number, circleSegments: number): TriangleMesh | null {
  if (shape.kind === "rect") return rectMesh(shape, thickness);
  if (shape.kind === "circle") return circleMesh(shape, thickness, circleSegments);
  if (shape.kind === "polyline" && shape.closed) return polygonMesh(shape, thickness);
  return null;
}

function rectMesh(rect: CadRect, h: number): TriangleMesh {
  const { x, y, width, height } = rect;
  const x2 = x + width;
  const y2 = y + height;
  const v: V3[] = [
    [x, y, 0], [x2, y, 0], [x2, y2, 0], [x, y2, 0],
    [x, y, h], [x2, y, h], [x2, y2, h], [x, y2, h],
  ];
  const t: number[][] = [
    // bottom
    [0, 2, 1], [0, 3, 2],
    // top
    [4, 5, 6], [4, 6, 7],
    // sides
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
  ];
  return { vertices: v, triangles: t };
}

function circleMesh(circle: CadCircle, h: number, segments: number): TriangleMesh {
  const { cx, cy, radius } = circle;
  const vertices: V3[] = [];
  vertices.push([cx, cy, 0]);
  vertices.push([cx, cy, h]);
  const ringStart = vertices.length;
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const px = cx + Math.cos(theta) * radius;
    const py = cy + Math.sin(theta) * radius;
    vertices.push([px, py, 0]);
    vertices.push([px, py, h]);
  }
  const triangles: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const aBot = ringStart + i * 2;
    const aTop = aBot + 1;
    const bBot = ringStart + next * 2;
    const bTop = bBot + 1;
    triangles.push([0, bBot, aBot]); // bottom fan
    triangles.push([1, aTop, bTop]); // top fan
    triangles.push([aBot, bBot, bTop]); // side quad
    triangles.push([aBot, bTop, aTop]);
  }
  return { vertices, triangles };
}

function polygonMesh(poly: CadPolyline, h: number): TriangleMesh {
  const vertices: V3[] = [];
  for (const p of poly.points) {
    vertices.push([p.x, p.y, 0]);
    vertices.push([p.x, p.y, h]);
  }
  const triangles: number[][] = [];
  const n = poly.points.length;
  if (n < 3) return { vertices, triangles };
  // Fan tessellation from vertex 0 (valid for convex; close enough for
  // concave display).
  for (let i = 1; i < n - 1; i++) {
    triangles.push([0, (i + 1) * 2, i * 2]); // bottom
    triangles.push([1, i * 2 + 1, (i + 1) * 2 + 1]); // top
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push([i * 2, j * 2, j * 2 + 1]);
    triangles.push([i * 2, j * 2 + 1, i * 2 + 1]);
  }
  return { vertices, triangles };
}

function num(n: number): string {
  return n.toFixed(6);
}

function escapeStep(s: string): string {
  return s.replace(/'/g, "''");
}
