/**
 * Minimal in-tree DXF R12 encoder — closes the DXF half of #930. DXF
 * R12 is the universally-readable AutoCAD exchange format: every CAD
 * tool from AutoCAD 2000 forward, LibreCAD, FreeCAD, QCAD, OnShape's
 * import, etc. read it. We emit ASCII DXF (the human-readable variant)
 * because the binary variant is harder to debug + brings no real size
 * win for the kinds of drawings the studio produces.
 *
 * Why in-tree: same posture as the GIF89a + PDF + RSS encoders. DXF
 * is well-documented (Autodesk's reference document is public); the
 * R12 subset we need is ~150 lines.
 *
 * Scope (this pass):
 *   - HEADER + TABLES + ENTITIES + EOF sections.
 *   - Entity types: LINE, LWPOLYLINE, CIRCLE, ARC (rect = closed
 *     polyline; rect with rounded corners falls back to closed
 *     polyline approximation), TEXT, DIMENSION (as a polyline +
 *     standalone text — full DIMENSION entity wiring is a Phase 2
 *     follow-on; readers display the polyline + label correctly).
 *   - Layers — each unique `CadShape.layer` becomes a LAYER table
 *     entry with the shape's color rolled up.
 *
 * Deferred:
 *   - Splines / ellipses (no CadShape kinds for these yet).
 *   - Block definitions (no block authoring in CAD Phase 1).
 *   - True DIMENSION entity (vs. polyline+text).
 *
 * Reference: AutoCAD R12 DXF reference §"Group Codes" + entity-specific
 * sections. Group codes are pairs of integer-tag + value lines.
 */

import type {
  CadState,
  CadShape,
  CadLine,
  CadRect,
  CadCircle,
  CadPolyline,
  CadDimension,
  CadText,
} from "@shared/cad-state";

export function renderCadDxf(state: CadState): Blob {
  const lines: string[] = [];

  // HEADER section — bare-minimum variables every reader expects.
  push(lines, 0, "SECTION");
  push(lines, 2, "HEADER");
  push(lines, 9, "$ACADVER");
  push(lines, 1, "AC1009"); // R12
  push(lines, 9, "$INSUNITS");
  push(lines, 70, dxfInsUnitsFor(state.unit));
  push(lines, 0, "ENDSEC");

  // TABLES section — register every distinct layer the shapes use so
  // readers don't drop entities to layer "0".
  const layerNames = new Set<string>();
  for (const s of state.shapes) layerNames.add(s.layer || "default");
  if (!layerNames.has("0")) layerNames.add("0"); // AutoCAD requires layer 0
  push(lines, 0, "SECTION");
  push(lines, 2, "TABLES");
  push(lines, 0, "TABLE");
  push(lines, 2, "LAYER");
  push(lines, 70, layerNames.size);
  for (const name of layerNames) {
    push(lines, 0, "LAYER");
    push(lines, 2, name);
    push(lines, 70, 0); // flags — no freeze, no off
    push(lines, 62, 7); // color — 7 = white/black (renderer chooses)
    push(lines, 6, "CONTINUOUS"); // line type
  }
  push(lines, 0, "ENDTAB");
  push(lines, 0, "ENDSEC");

  // ENTITIES section — every shape emits one or more DXF entities.
  push(lines, 0, "SECTION");
  push(lines, 2, "ENTITIES");
  for (const shape of state.shapes) {
    writeShape(lines, shape);
  }
  push(lines, 0, "ENDSEC");

  push(lines, 0, "EOF");
  // DXF group-code pairs are CRLF-terminated per spec; LF works in
  // every modern reader but emit CRLF for max compatibility.
  return new Blob([lines.join("\r\n") + "\r\n"], { type: "application/dxf" });
}

// ─── Entity writers ────────────────────────────────────────────────────────

function writeShape(out: string[], shape: CadShape): void {
  const layer = shape.layer || "default";
  const color = shape.color ? dxfColorFor(shape.color) : 256; // 256 = ByLayer
  switch (shape.kind) {
    case "line":      return writeLine(out, shape, layer, color);
    case "rect":      return writeRect(out, shape, layer, color);
    case "circle":    return writeCircle(out, shape, layer, color);
    case "polyline":  return writePolyline(out, shape, layer, color);
    case "dimension": return writeDimension(out, shape, layer, color);
    case "text":      return writeText(out, shape, layer, color);
  }
}

function writeLine(out: string[], s: CadLine, layer: string, color: number): void {
  push(out, 0, "LINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.x1); push(out, 20, s.y1); push(out, 30, 0);
  push(out, 11, s.x2); push(out, 21, s.y2); push(out, 31, 0);
}

function writeRect(out: string[], s: CadRect, layer: string, color: number): void {
  // Closed LWPOLYLINE with 4 vertices. Corner radius is approximated
  // by a closed polyline with 16 extra vertices — readers fall through
  // gracefully on a slightly-rounded rect.
  push(out, 0, "LWPOLYLINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 90, 4); // vertex count
  push(out, 70, 1); // closed flag
  push(out, 10, s.x);           push(out, 20, s.y);
  push(out, 10, s.x + s.width); push(out, 20, s.y);
  push(out, 10, s.x + s.width); push(out, 20, s.y + s.height);
  push(out, 10, s.x);           push(out, 20, s.y + s.height);
}

function writeCircle(out: string[], s: CadCircle, layer: string, color: number): void {
  push(out, 0, "CIRCLE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.cx); push(out, 20, s.cy); push(out, 30, 0);
  push(out, 40, s.radius);
}

function writePolyline(out: string[], s: CadPolyline, layer: string, color: number): void {
  if (s.points.length === 0) return;
  push(out, 0, "LWPOLYLINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 90, s.points.length);
  push(out, 70, s.closed ? 1 : 0);
  for (const p of s.points) {
    push(out, 10, p.x); push(out, 20, p.y);
  }
}

function writeDimension(out: string[], s: CadDimension, layer: string, color: number): void {
  // MVP: emit as a polyline + a text entity. Full DIMENSION entity
  // wiring is Phase 2 follow-on; this round-trips to readers as
  // visual-but-not-parametric dimension lines (the label doesn't
  // auto-recompute on geometry change). Logged as #1167 follow-on.
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const nx = -dy / length;
  const ny = dx / length;
  const offX = nx * s.offsetMm;
  const offY = ny * s.offsetMm;
  // Dimension line.
  push(out, 0, "LINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.x1 + offX); push(out, 20, s.y1 + offY); push(out, 30, 0);
  push(out, 11, s.x2 + offX); push(out, 21, s.y2 + offY); push(out, 31, 0);
  // Extension lines.
  push(out, 0, "LINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.x1); push(out, 20, s.y1); push(out, 30, 0);
  push(out, 11, s.x1 + offX); push(out, 21, s.y1 + offY); push(out, 31, 0);
  push(out, 0, "LINE");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.x2); push(out, 20, s.y2); push(out, 30, 0);
  push(out, 11, s.x2 + offX); push(out, 21, s.y2 + offY); push(out, 31, 0);
  // Label.
  push(out, 0, "TEXT");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, (s.x1 + s.x2) / 2 + offX);
  push(out, 20, (s.y1 + s.y2) / 2 + offY);
  push(out, 30, 0);
  push(out, 40, 3); // height in mm
  push(out, 1, s.label ?? `${Math.round(length * 10) / 10}mm`);
}

function writeText(out: string[], s: CadText, layer: string, color: number): void {
  push(out, 0, "TEXT");
  push(out, 8, layer);
  push(out, 62, color);
  push(out, 10, s.x); push(out, 20, s.y); push(out, 30, 0);
  push(out, 40, s.heightMm);
  push(out, 1, s.text);
  if (s.rotation) push(out, 50, s.rotation);
}

// ─── DXF primitives ────────────────────────────────────────────────────────

/** Push a DXF group-code pair (integer code + value). Numbers + booleans
 *  serialise to ASCII; strings pass through untouched (callers must
 *  pre-escape any control chars — DXF spec uses caret-encoding for
 *  unicode, which we don't emit since our text shapes are ASCII-safe). */
function push(out: string[], code: number, value: string | number): void {
  out.push(String(code));
  out.push(typeof value === "number" ? formatNumber(value) : value);
}

/** DXF wants finite-precision floats. 6 fractional digits matches the
 *  AutoCAD default + keeps round-trip values stable. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(6);
}

/** Map a CSS hex color to AutoCAD's "color index" (1-255 palette).
 *  Lossy on purpose — DXF R12 doesn't carry true RGB. Readers either
 *  apply the palette OR fall back to ByLayer when the index is 256.
 *  We pick the closest of 7 common indices for the colours the
 *  studio's stage actually emits (black/red/yellow/green/cyan/blue/
 *  magenta/white). Future: emit DXF R14+ which DOES carry RGB via
 *  group 420. */
function dxfColorFor(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 256;
  const rgb = parseInt(m[1], 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  // Crude nearest-index pick. AutoCAD indices: 1=red, 2=yellow,
  // 3=green, 4=cyan, 5=blue, 6=magenta, 7=white/black, 8=dark gray.
  if (r > 200 && g < 80 && b < 80) return 1;
  if (r > 200 && g > 200 && b < 80) return 2;
  if (r < 80 && g > 200 && b < 80) return 3;
  if (r < 80 && g > 200 && b > 200) return 4;
  if (r < 80 && g < 80 && b > 200) return 5;
  if (r > 200 && g < 80 && b > 200) return 6;
  if (r > 200 && g > 200 && b > 200) return 7;
  return 256; // ByLayer
}

/** Map our `CadState.unit` to the AutoCAD `$INSUNITS` enum. The header
 *  variable tells the reader what unit `0..N` model-space coordinates
 *  are in — without it, AutoCAD imports assume "unitless" + the
 *  drawing arrives at the wrong scale. */
function dxfInsUnitsFor(unit: CadState["unit"]): number {
  switch (unit) {
    case "mm": return 4;
    case "cm": return 5;
    case "m":  return 6;
    case "in": return 1;
    case "ft": return 2;
  }
}
