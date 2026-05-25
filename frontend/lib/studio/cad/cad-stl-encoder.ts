/**
 * CAD STL ASCII encoder (#930). Extrudes each 2D shape in the drawing
 * by a configurable thickness (default 1mm) and emits an ASCII STL
 * file — the standard 3D-printing input format. Useful for users
 * making laser-cut panels / 3D-printable plaques from 2D floor plans
 * and part drawings.
 *
 * Limitations (logged honestly):
 *   - ASCII STL only (binary STL not generated). Most slicers
 *     accept ASCII; large drawings produce big files (~10× binary).
 *   - Each closed shape becomes a flat extrusion (no slanted faces,
 *     no boolean ops with neighbours). For multi-shape combined
 *     extrusions a future BREP-aware encoder is needed.
 *   - Dimensions + text shapes are skipped (they don't have a
 *     meaningful 3D representation).
 *   - Polylines must be closed for proper extrusion; open polylines
 *     emit as zero-thickness ribbons.
 *
 * The full 3D modelling track (mediaKind: "cad_3d") with replicad /
 * OpenCascade-style BREP is logged separately as the next phase of
 * #930.
 */

import type { CadCircle, CadPolyline, CadRect, CadShape, CadState } from "@shared/cad-state";

export interface StlEncodeOptions {
  /** Extrusion depth in millimetres. Default 1mm — thin enough for
   *  laser cutting, thick enough for 3D-printed signs. */
  thicknessMm?: number;
  /** Polyline → triangle fan tessellation density. Higher = smoother
   *  curves at the cost of file size. Default 32 segments per circle. */
  circleSegments?: number;
}

/** Render the CAD state to an ASCII STL string. */
export function renderCadStl(state: CadState, opts: StlEncodeOptions = {}): string {
  const thickness = opts.thicknessMm ?? 1;
  const circleSegments = opts.circleSegments ?? 32;
  const out: string[] = [];
  out.push("solid hiredvideo_cad");
  for (const shape of state.shapes) {
    emitShape(shape, thickness, circleSegments, out);
  }
  out.push("endsolid hiredvideo_cad");
  return out.join("\n");
}

/** Wrap the ASCII STL string in a Blob with `model/stl` mime so the
 *  export-facade download dispatcher can hand it to the browser
 *  cleanly. */
export async function renderCadStlBlob(
  state: CadState,
  opts: StlEncodeOptions = {},
): Promise<Blob> {
  return new Blob([renderCadStl(state, opts)], { type: "model/stl" });
}

function emitShape(
  shape: CadShape,
  thickness: number,
  circleSegments: number,
  out: string[],
): void {
  if (shape.kind === "rect") {
    emitRectPrism(shape, thickness, out);
  } else if (shape.kind === "circle") {
    emitCylinder(shape, thickness, circleSegments, out);
  } else if (shape.kind === "polyline" && shape.closed) {
    emitPolygonPrism(shape, thickness, out);
  }
  // Lines / open polylines / dimensions / text intentionally skipped —
  // they don't have a meaningful 3D extrusion.
}

function emitRectPrism(rect: CadRect, h: number, out: string[]): void {
  const { x, y, width, height } = rect;
  const x2 = x + width;
  const y2 = y + height;
  // Bottom face (z=0)
  emitQuad([x, y, 0], [x2, y, 0], [x2, y2, 0], [x, y2, 0], out, /* faceUp */ false);
  // Top face (z=h)
  emitQuad([x, y, h], [x2, y, h], [x2, y2, h], [x, y2, h], out, /* faceUp */ true);
  // Sides
  emitQuad([x, y, 0], [x2, y, 0], [x2, y, h], [x, y, h], out, true);
  emitQuad([x2, y, 0], [x2, y2, 0], [x2, y2, h], [x2, y, h], out, true);
  emitQuad([x2, y2, 0], [x, y2, 0], [x, y2, h], [x2, y2, h], out, true);
  emitQuad([x, y2, 0], [x, y, 0], [x, y, h], [x, y2, h], out, true);
}

function emitCylinder(circle: CadCircle, h: number, segments: number, out: string[]): void {
  const { cx, cy, radius } = circle;
  for (let i = 0; i < segments; i++) {
    const theta1 = (i / segments) * Math.PI * 2;
    const theta2 = ((i + 1) / segments) * Math.PI * 2;
    const x1 = cx + Math.cos(theta1) * radius;
    const y1 = cy + Math.sin(theta1) * radius;
    const x2 = cx + Math.cos(theta2) * radius;
    const y2 = cy + Math.sin(theta2) * radius;
    // Bottom triangle fan
    emitTri([cx, cy, 0], [x2, y2, 0], [x1, y1, 0], out);
    // Top triangle fan
    emitTri([cx, cy, h], [x1, y1, h], [x2, y2, h], out);
    // Side quad
    emitQuad([x1, y1, 0], [x2, y2, 0], [x2, y2, h], [x1, y1, h], out, true);
  }
}

function emitPolygonPrism(poly: CadPolyline, h: number, out: string[]): void {
  // Triangle-fan tessellation from the polygon's first vertex.
  // Valid for convex polygons; concave shapes produce overlapping
  // triangles — adequate for STL viewers but not topologically clean.
  const points = poly.points;
  if (points.length < 3) return;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[0];
    const p1 = points[i];
    const p2 = points[i + 1];
    emitTri([p0.x, p0.y, 0], [p2.x, p2.y, 0], [p1.x, p1.y, 0], out);
    emitTri([p0.x, p0.y, h], [p1.x, p1.y, h], [p2.x, p2.y, h], out);
  }
  // Side walls
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    emitQuad([a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, h], [a.x, a.y, h], out, true);
  }
}

type V3 = [number, number, number];

function emitQuad(a: V3, b: V3, c: V3, d: V3, out: string[], _faceUp: boolean): void {
  emitTri(a, b, c, out);
  emitTri(a, c, d, out);
}

function emitTri(a: V3, b: V3, c: V3, out: string[]): void {
  // Compute the face normal via cross product. STL expects unit-length
  // normals; some viewers tolerate zero-vectors but slicers don't.
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len > 0) {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  out.push(`  facet normal ${stl(nx)} ${stl(ny)} ${stl(nz)}`);
  out.push("    outer loop");
  out.push(`      vertex ${stl(a[0])} ${stl(a[1])} ${stl(a[2])}`);
  out.push(`      vertex ${stl(b[0])} ${stl(b[1])} ${stl(b[2])}`);
  out.push(`      vertex ${stl(c[0])} ${stl(c[1])} ${stl(c[2])}`);
  out.push("    endloop");
  out.push("  endfacet");
}

function stl(n: number): string {
  // 6 decimal places matches reference slicers' precision tolerance
  // without bloating file size unnecessarily.
  return n.toFixed(6);
}
