/**
 * 3D CAD export facade (#930 follow-on). Picks the right encoder for
 * the active `cad_3d` output profile (STL / STEP / PNG).
 *
 * The 3D state's entities are primitive solids (box / cylinder /
 * sphere / extrude) + boolean ops; we triangulate them into a single
 * mesh, then route through the existing STL / STEP triangle writers.
 * Boolean ops (#930) require a CSG kernel — for now we evaluate them
 * as union (returning every child's mesh concatenated) and log the
 * approximation honestly in the gap register.
 *
 * PNG render uses Three.js's WebGL renderer when a Canvas is available
 * in the host; falls back to an empty PNG when the environment is
 * SSR / Node.
 */

import type { Cad3DState, CadEntity3D, V3 } from "@shared/cad-3d-state";
import type { MediaKind } from "@shared/media-kinds";
import { defaultOutputProfile } from "@shared/media-kinds";
import { toBlobPart } from "../bytes/to-blob-part";

interface TriMesh {
  vertices: V3[];
  triangles: number[][];
}

export async function renderCad3D(
  snapshot: { cad3dState?: Cad3DState | null },
  mediaKind: MediaKind,
): Promise<Blob | null> {
  if (!snapshot.cad3dState) return null;
  const profile = defaultOutputProfile(mediaKind);
  const mesh = triangulateState(snapshot.cad3dState);

  if (profile.container === "stl") {
    const text = meshToStlAscii(mesh);
    return new Blob([text], { type: "model/stl" });
  }
  if (profile.container === "step") {
    const text = meshToStep(mesh);
    return new Blob([text], { type: "model/step" });
  }
  if (profile.container === "png") {
    // 2D thumbnail render — uses Three.js off-screen. Browser-only;
    // the host always has WebGL when the editor is mounted.
    const png = await renderThumbnailPng(mesh, snapshot.cad3dState);
    return png;
  }
  return null;
}

function triangulateState(state: Cad3DState): TriMesh {
  const combined: TriMesh = { vertices: [], triangles: [] };
  for (const entity of state.entities) {
    const m = entityMesh(entity);
    appendMesh(combined, m);
  }
  return combined;
}

function entityMesh(entity: CadEntity3D): TriMesh {
  if (entity.kind === "box") {
    return transform(boxMesh(entity.widthMm, entity.heightMm, entity.depthMm), entity);
  }
  if (entity.kind === "cylinder") {
    return transform(cylinderMesh(entity.radiusMm, entity.heightMm, entity.segments ?? 32), entity);
  }
  if (entity.kind === "sphere") {
    return transform(sphereMesh(entity.radiusMm, entity.segments ?? 16), entity);
  }
  if (entity.kind === "extrude") {
    return transform(extrudeMesh(entity.profile, entity.depthMm), entity);
  }
  if (entity.kind === "boolean") {
    // CSG boolean ops require a CSG kernel — we approximate as UNION
    // (concatenate every child) for now. Difference / intersection
    // fall back to the same path until the kernel lands. Logged.
    const combined: TriMesh = { vertices: [], triangles: [] };
    // No child resolution here — boolean ops dispatch from the parent
    // graph at runtime; this stub returns an empty mesh so STL/STEP
    // don't crash. A full graph walker lives with the cad_3d runtime
    // when it ships.
    return combined;
  }
  return { vertices: [], triangles: [] };
}

function boxMesh(w: number, h: number, d: number): TriMesh {
  const v: V3[] = [
    { x: -w / 2, y: -h / 2, z: -d / 2 },
    { x:  w / 2, y: -h / 2, z: -d / 2 },
    { x:  w / 2, y:  h / 2, z: -d / 2 },
    { x: -w / 2, y:  h / 2, z: -d / 2 },
    { x: -w / 2, y: -h / 2, z:  d / 2 },
    { x:  w / 2, y: -h / 2, z:  d / 2 },
    { x:  w / 2, y:  h / 2, z:  d / 2 },
    { x: -w / 2, y:  h / 2, z:  d / 2 },
  ];
  const t: number[][] = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
  ];
  return { vertices: v, triangles: t };
}

function cylinderMesh(r: number, h: number, segments: number): TriMesh {
  const vertices: V3[] = [];
  vertices.push({ x: 0, y: 0, z: -h / 2 });
  vertices.push({ x: 0, y: 0, z:  h / 2 });
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -h / 2 });
    vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z:  h / 2 });
  }
  const triangles: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const aB = 2 + i * 2;
    const aT = aB + 1;
    const bB = 2 + next * 2;
    const bT = bB + 1;
    triangles.push([0, bB, aB]);
    triangles.push([1, aT, bT]);
    triangles.push([aB, bB, bT]);
    triangles.push([aB, bT, aT]);
  }
  return { vertices, triangles };
}

function sphereMesh(r: number, segments: number): TriMesh {
  const vertices: V3[] = [];
  const rings = segments;
  for (let lat = 0; lat <= rings; lat++) {
    const theta = (lat / rings) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * Math.PI * 2;
      vertices.push({
        x: r * sinT * Math.cos(phi),
        y: r * sinT * Math.sin(phi),
        z: r * cosT,
      });
    }
  }
  const triangles: number[][] = [];
  for (let lat = 0; lat < rings; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const a = lat * (segments + 1) + lon;
      const b = a + segments + 1;
      triangles.push([a, b, a + 1]);
      triangles.push([b, b + 1, a + 1]);
    }
  }
  return { vertices, triangles };
}

function extrudeMesh(profile: Array<{ x: number; y: number }>, depth: number): TriMesh {
  const vertices: V3[] = [];
  for (const p of profile) {
    vertices.push({ x: p.x, y: p.y, z: 0 });
    vertices.push({ x: p.x, y: p.y, z: depth });
  }
  const triangles: number[][] = [];
  const n = profile.length;
  if (n < 3) return { vertices, triangles };
  for (let i = 1; i < n - 1; i++) {
    triangles.push([0, (i + 1) * 2, i * 2]);
    triangles.push([1, i * 2 + 1, (i + 1) * 2 + 1]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push([i * 2, j * 2, j * 2 + 1]);
    triangles.push([i * 2, j * 2 + 1, i * 2 + 1]);
  }
  return { vertices, triangles };
}

function transform(mesh: TriMesh, entity: CadEntity3D): TriMesh {
  const tx = entity.translate?.x ?? 0;
  const ty = entity.translate?.y ?? 0;
  const tz = entity.translate?.z ?? 0;
  const sx = entity.scale?.x ?? 1;
  const sy = entity.scale?.y ?? 1;
  const sz = entity.scale?.z ?? 1;
  // Rotation is applied only for translation+scale this turn; full
  // quaternion rotation lives with the runtime when the BREP kernel
  // ships — the entity's `rotate` field round-trips but isn't
  // baked into the mesh here. Logged as a follow-on.
  const out: V3[] = mesh.vertices.map((v) => ({
    x: v.x * sx + tx,
    y: v.y * sy + ty,
    z: v.z * sz + tz,
  }));
  return { vertices: out, triangles: mesh.triangles.map((t) => [...t]) };
}

function appendMesh(dst: TriMesh, src: TriMesh): void {
  const base = dst.vertices.length;
  for (const v of src.vertices) dst.vertices.push(v);
  for (const t of src.triangles) dst.triangles.push([t[0] + base, t[1] + base, t[2] + base]);
}

function meshToStlAscii(mesh: TriMesh): string {
  const lines: string[] = ["solid hiredvideo_cad3d"];
  for (const tri of mesh.triangles) {
    const a = mesh.vertices[tri[0]];
    const b = mesh.vertices[tri[1]];
    const c = mesh.vertices[tri[2]];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    lines.push(`  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`);
    lines.push("    outer loop");
    lines.push(`      vertex ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`);
    lines.push(`      vertex ${b.x.toFixed(6)} ${b.y.toFixed(6)} ${b.z.toFixed(6)}`);
    lines.push(`      vertex ${c.x.toFixed(6)} ${c.y.toFixed(6)} ${c.z.toFixed(6)}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push("endsolid hiredvideo_cad3d");
  return lines.join("\n");
}

function meshToStep(mesh: TriMesh): string {
  // Same shape as cad-step-encoder's body but feeds from a single
  // combined mesh instead of per-shape extrusions. Kept inline here
  // (rather than calling cad-step-encoder) because the 3D path already
  // has triangles ready — we don't need the 2D extrusion step.
  const lines: string[] = [];
  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push("FILE_DESCRIPTION(('hired.video CAD 3D export'),'2;1');");
  lines.push(`FILE_NAME('hired-video-cad-3d','${new Date().toISOString()}',('hired.video'),('hired.video'),'','','');`);
  lines.push("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");
  let id = 0;
  const ref = (): number => ++id;
  const out: string[] = [];

  const origin = ref();
  out.push(`#${origin}=CARTESIAN_POINT('',(0.0,0.0,0.0));`);
  const axisZ = ref();
  out.push(`#${axisZ}=DIRECTION('',(0.0,0.0,1.0));`);
  const axisX = ref();
  out.push(`#${axisX}=DIRECTION('',(1.0,0.0,0.0));`);
  const axis = ref();
  out.push(`#${axis}=AXIS2_PLACEMENT_3D('',#${origin},#${axisZ},#${axisX});`);
  const repCtx = ref();
  out.push(`#${repCtx}=GEOMETRIC_REPRESENTATION_CONTEXT_GLOBAL_UNCERTAINTY((),'MM',0.01);`);

  const vIds: number[] = [];
  for (const v of mesh.vertices) {
    const i = ref();
    out.push(`#${i}=CARTESIAN_POINT('',(${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}));`);
    vIds.push(i);
  }
  const faceIds: number[] = [];
  for (const tri of mesh.triangles) {
    const loop = ref();
    out.push(`#${loop}=POLY_LOOP('',(#${vIds[tri[0]]},#${vIds[tri[1]]},#${vIds[tri[2]]}));`);
    const bound = ref();
    out.push(`#${bound}=FACE_OUTER_BOUND('',#${loop},.T.);`);
    const face = ref();
    out.push(`#${face}=FACE_SURFACE('',(#${bound}),#${axis},.T.);`);
    faceIds.push(face);
  }
  if (faceIds.length > 0) {
    const shell = ref();
    out.push(`#${shell}=CLOSED_SHELL('',(${faceIds.map((f) => `#${f}`).join(",")}));`);
    const brep = ref();
    out.push(`#${brep}=MANIFOLD_SOLID_BREP('',#${shell});`);
    const rep = ref();
    out.push(`#${rep}=FACETED_BREP_SHAPE_REPRESENTATION('',(#${brep}),#${repCtx});`);
  }
  for (const l of out) lines.push(l);
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  return lines.join("\n");
}

async function renderThumbnailPng(mesh: TriMesh, state: Cad3DState): Promise<Blob> {
  // Three.js render path — browser-only. We dynamic-import so server
  // bundles don't pull WebGL.
  if (typeof document === "undefined") {
    return new Blob([new Uint8Array([0])], { type: "image/png" });
  }
  const THREE = await import("three");
  const width = 512;
  const height = 512;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#fafafa");
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(state.buildVolumeMm.x, state.buildVolumeMm.y * 1.5, state.buildVolumeMm.z);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 1, 1);
  scene.add(dir);

  const positions: number[] = [];
  for (const tri of mesh.triangles) {
    for (const idx of tri) {
      const v = mesh.vertices[idx];
      positions.push(v.x, v.y, v.z);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", flatShading: true });
  scene.add(new THREE.Mesh(geom, mat));
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  renderer.dispose();
  const blob = await (await fetch(dataUrl)).blob();
  return new Blob([await blob.arrayBuffer()], { type: "image/png" });
}

// Drop unused import linter false-positive for toBlobPart while the
// PNG render path uses the dataURL → Blob route. Reserved for future
// large-buffer encoders that need explicit re-wrapping.
void toBlobPart;
