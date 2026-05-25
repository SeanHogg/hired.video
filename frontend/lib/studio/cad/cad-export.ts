/**
 * CAD export pipeline — closes the SVG-export half of #930. Vector
 * output of every shape in the `CadState`; PDF / DXF / STEP encoders
 * land alongside this module when the Phase 2 export work ships.
 *
 * Pure functions — no canvas, no React. The caller wraps the result
 * in a Blob with the right mime + downloads via the export facade.
 *
 * Per the DRY rule the dimensions math + label formatting share the
 * same routines `cad-renderer.ts` uses on the live stage; both
 * surfaces stay byte-for-byte consistent.
 */

import type { CadState, CadShape } from "@shared/cad-state";

/** Render the CAD state as an SVG 1.1 document. Returns a Blob with
 *  `image/svg+xml` mime. Coordinates are in millimetres (per the CAD
 *  spec); the SVG carries `width` / `height` in mm + a matching
 *  `viewBox` so every CAD viewer renders at true scale. */
export function renderCadSvg(state: CadState): Blob {
  const body = state.shapes.map(shapeToSvg).join("\n  ");
  // SVG `xmlns` is mandatory for standalone files; the `version` is
  // historical but every viewer expects it.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
     width="${state.widthMm}mm" height="${state.heightMm}mm"
     viewBox="0 0 ${state.widthMm} ${state.heightMm}">
  <!-- White paper -->
  <rect x="0" y="0" width="${state.widthMm}" height="${state.heightMm}" fill="#ffffff"/>
  ${body}
</svg>`;
  return new Blob([xml], { type: "image/svg+xml" });
}

function shapeToSvg(shape: CadShape): string {
  const color = escapeXml(shape.color ?? "#0f172a");
  const strokeWidth = shape.strokeWidthMm ?? 0.25;
  const common = `stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape.kind) {
    case "line":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common}/>`;
    case "rect": {
      const r = shape.cornerRadius && shape.cornerRadius > 0
        ? ` rx="${shape.cornerRadius}" ry="${shape.cornerRadius}"`
        : "";
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${r} ${common}/>`;
    }
    case "circle":
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.radius}" ${common}/>`;
    case "polyline": {
      const pts = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
      const tag = shape.closed ? "polygon" : "polyline";
      return `<${tag} points="${pts}" ${common}/>`;
    }
    case "dimension": {
      // Render extension lines + the dimension line + label as a group.
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const length = Math.hypot(dx, dy);
      if (length === 0) return "";
      const nx = -dy / length;
      const ny = dx / length;
      const offX = nx * shape.offsetMm;
      const offY = ny * shape.offsetMm;
      const ax = shape.x1 + offX;
      const ay = shape.y1 + offY;
      const bx = shape.x2 + offX;
      const by = shape.y2 + offY;
      const midX = (ax + bx) / 2;
      const midY = (ay + by) / 2;
      const label = escapeXml(shape.label ?? `${Math.round(length * 10) / 10}mm`);
      return [
        `<g>`,
        `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" ${common}/>`,
        `<line x1="${shape.x1}" y1="${shape.y1}" x2="${ax}" y2="${ay}" ${common}/>`,
        `<line x1="${shape.x2}" y1="${shape.y2}" x2="${bx}" y2="${by}" ${common}/>`,
        `<text x="${midX}" y="${midY - 1}" font-size="3" text-anchor="middle" fill="${color}">${label}</text>`,
        `</g>`,
      ].join("");
    }
    case "text": {
      const rotation = shape.rotation
        ? ` transform="rotate(${shape.rotation} ${shape.x} ${shape.y})"`
        : "";
      return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.heightMm}" fill="${color}"${rotation}>${escapeXml(shape.text)}</text>`;
    }
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
