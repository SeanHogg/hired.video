/**
 * Power window — shape-masked exposure / saturation / contrast push.
 * Closes the last part of #352. Acts as a graduated correction inside
 * (or, with `invert`, outside) a rect or ellipse, with feathered edges.
 *
 * Distinct from `mask-rect`, which kills alpha outside the shape.
 * Power-window keeps the full image and only pushes the qualified
 * region — the standard "vignette this face" / "darken this sky"
 * primary-grade workflow.
 */

import { registerEffect } from "./registry";

const SHAPE_OPTIONS = [
  { value: "rect", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
];

registerEffect({
  kind: "power-window",
  label: "Power window",
  category: "color",
  proOnly: true,
  defaults: {
    shape: "ellipse",
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
    feather: 0.15,
    invert: false,
    exposure: 0,
    saturation: 0,
    contrast: 0,
  },
  paramHints: {
    shape: { type: "select", options: SHAPE_OPTIONS },
    exposure: { type: "number", min: -1, max: 1, step: 0.01 },
    saturation: { type: "number", min: -1, max: 1, step: 0.01 },
    contrast: { type: "number", min: -1, max: 1, step: 0.01 },
  },
  apply(effect, { ctx, canvas }) {
    const shape = effect.params.shape === "rect" ? "rect" : "ellipse";
    const x = clamp01(numberOr(effect.params.x, 0));
    const y = clamp01(numberOr(effect.params.y, 0));
    const w = clamp01(numberOr(effect.params.width, 1));
    const h = clamp01(numberOr(effect.params.height, 1));
    const feather = clamp(numberOr(effect.params.feather, 0), 0, 0.5);
    const invert = effect.params.invert === true;
    const exposure = numberOr(effect.params.exposure, 0);
    const dSat = numberOr(effect.params.saturation, 0);
    const dContrast = numberOr(effect.params.contrast, 0);

    if (exposure === 0 && dSat === 0 && dContrast === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const cxC = (x + w / 2) * cw;
    const cyC = (y + h / 2) * ch;
    const rx = (w / 2) * cw;
    const ry = (h / 2) * ch;
    const fpxX = feather * cw;
    const fpxY = feather * ch;

    const img = ctx.getImageData(0, 0, cw, ch);
    const px = img.data;
    const expFactor = Math.pow(2, exposure);
    const contrastK = 1 + 2 * dContrast;

    let i = 0;
    for (let py = 0; py < ch; py++) {
      for (let pxX = 0; pxX < cw; pxX++) {
        const weight = shapeWeight(
          shape,
          pxX,
          py,
          x * cw,
          y * ch,
          (x + w) * cw,
          (y + h) * ch,
          cxC,
          cyC,
          rx,
          ry,
          fpxX,
          fpxY,
        );
        const w2 = invert ? 1 - weight : weight;
        if (w2 <= 0) {
          i += 4;
          continue;
        }
        for (let c = 0; c < 3; c++) {
          let v = px[i + c] / 255;
          if (exposure !== 0) v = lerp(v, clamp01(v * expFactor), w2);
          if (dContrast !== 0) v = lerp(v, clamp01(0.5 + (v - 0.5) * contrastK), w2);
          px[i + c] = clampByte(v * 255);
        }
        if (dSat !== 0) {
          const r = px[i];
          const g = px[i + 1];
          const b = px[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          // dSat > 0 pushes away from luma; dSat < 0 pulls toward it.
          const k = 1 + dSat * w2;
          px[i] = clampByte(luma + (r - luma) * k);
          px[i + 1] = clampByte(luma + (g - luma) * k);
          px[i + 2] = clampByte(luma + (b - luma) * k);
        }
        i += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  },
});

/**
 * Per-pixel membership weight (1 fully inside, 0 fully outside, ramp
 * across the feather band). Branches once on shape and stays in the
 * inner loop's hot path.
 */
function shapeWeight(
  shape: "rect" | "ellipse",
  pxX: number,
  pxY: number,
  rectL: number,
  rectT: number,
  rectR: number,
  rectB: number,
  cxC: number,
  cyC: number,
  rx: number,
  ry: number,
  fpxX: number,
  fpxY: number,
): number {
  if (shape === "rect") {
    const inside = pxX >= rectL && pxX < rectR && pxY >= rectT && pxY < rectB;
    if (fpxX <= 0 && fpxY <= 0) return inside ? 1 : 0;
    const dxL = pxX - rectL;
    const dxR = rectR - pxX;
    const dyT = pxY - rectT;
    const dyB = rectB - pxY;
    const insideDist = Math.min(dxL, dxR, dyT, dyB);
    const fp = Math.min(fpxX, fpxY);
    if (insideDist >= fp) return 1;
    if (insideDist <= -fp) return 0;
    return (insideDist + fp) / (2 * fp);
  }
  // Ellipse — normalised radial distance with a feather band on the
  // outside of the rim.
  if (rx <= 0 || ry <= 0) return 0;
  const nx = (pxX - cxC) / rx;
  const ny = (pxY - cyC) / ry;
  const r = Math.sqrt(nx * nx + ny * ny);
  if (r <= 1) return 1;
  const fpNorm = Math.min(fpxX / rx, fpxY / ry);
  if (fpNorm <= 0) return 0;
  if (r >= 1 + fpNorm) return 0;
  return 1 - (r - 1) / fpNorm;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
