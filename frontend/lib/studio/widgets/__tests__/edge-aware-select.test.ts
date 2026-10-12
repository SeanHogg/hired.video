/**
 * Edge-aware quick-select (#1107): Sobel magnitude gates the flood so a
 * high colour-tolerance dab cannot leak across a hard contour.
 *
 * Run: vitest run lib/studio/widgets/__tests__/edge-aware-select.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_THRESHOLD,
  edgeAwareFloodMask,
  emptyMask,
  pixelLuma,
  quickSelectAccumulate,
  sobelMagnitude,
  unionMasks,
  type PixelSource,
  type RgbaBuffer,
} from "../edge-aware-select";

function fillRect(
  buf: RgbaBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * buf.width + x) * 4;
      buf.data[i] = r;
      buf.data[i + 1] = g;
      buf.data[i + 2] = b;
      buf.data[i + 3] = a;
    }
  }
}

/** Uniform grey field. */
function grey(width: number, height: number, v = 180): RgbaBuffer {
  const buf = emptyMask(width, height);
  fillRect(buf, 0, 0, width, height, v, v, v);
  return buf;
}

/**
 * Two identical grey panels split by a 1px black vertical wall.
 * Magic-wand at tolerance 255 would flood both sides; edge-aware must not.
 */
function splitByWall(width = 8, height = 8, wallX = 4): RgbaBuffer {
  const buf = grey(width, height, 200);
  fillRect(buf, wallX, 0, wallX + 1, height, 0, 0, 0);
  return buf;
}

function selected(mask: RgbaBuffer, x: number, y: number): boolean {
  return mask.data[(y * mask.width + x) * 4 + 3] === 255;
}

function countSelected(mask: RgbaBuffer): number {
  let n = 0;
  for (let i = 3; i < mask.data.length; i += 4) {
    if (mask.data[i] === 255) n++;
  }
  return n;
}

function asSource(buf: RgbaBuffer): PixelSource {
  return { getImageData: () => buf };
}

describe("pixelLuma", () => {
  it("is 0 for a fully transparent pixel even if RGB is white", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 0]);
    expect(pixelLuma(data, 0)).toBe(0);
  });

  it("is ~255 for opaque white", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(pixelLuma(data, 0)).toBeCloseTo(255, 5);
  });
});

describe("sobelMagnitude", () => {
  it("is near zero on a flat field", () => {
    const mag = sobelMagnitude(grey(6, 6, 128));
    const interior = mag[2 * 6 + 2] ?? 0;
    expect(interior).toBeLessThan(1);
  });

  it("peaks on a black/white step well above the default threshold", () => {
    const img = grey(8, 8, 255);
    fillRect(img, 4, 0, 8, 8, 0, 0, 0);
    const mag = sobelMagnitude(img);
    const atBoundary = mag[3 * 8 + 4] ?? 0;
    expect(atBoundary).toBeGreaterThan(DEFAULT_EDGE_THRESHOLD);
    const farLeft = mag[3 * 8 + 1] ?? 0;
    expect(farLeft).toBeLessThan(DEFAULT_EDGE_THRESHOLD);
  });
});

describe("edgeAwareFloodMask", () => {
  it("fills a uniform field the way magic-wand would", () => {
    const mask = edgeAwareFloodMask(grey(5, 5, 40), 2, 2, 24);
    expect(countSelected(mask)).toBe(25);
  });

  it("returns an empty mask when the seed is out of bounds", () => {
    const mask = edgeAwareFloodMask(grey(4, 4), -1, 0, 24);
    expect(countSelected(mask)).toBe(0);
  });

  it("stops at a strong contour even when colour tolerance would leak", () => {
    const img = splitByWall();
    const mask = edgeAwareFloodMask(img, 1, 3, 255);
    expect(selected(mask, 1, 3)).toBe(true);
    // Sobel lights up the column *beside* the wall; that pixel is the
    // barrier (included, not expanded past). The far side stays out.
    expect(selected(mask, 3, 3)).toBe(true);
    expect(selected(mask, 6, 3)).toBe(false);
    expect(selected(mask, 7, 0)).toBe(false);
  });

  it("a dab on the other side of the wall selects only that side", () => {
    const img = splitByWall();
    const mask = edgeAwareFloodMask(img, 6, 3, 255);
    expect(selected(mask, 6, 3)).toBe(true);
    expect(selected(mask, 1, 3)).toBe(false);
  });

  it("a seed sitting on the contour is still selected", () => {
    const img = splitByWall();
    const mask = edgeAwareFloodMask(img, 4, 3, 255);
    expect(selected(mask, 4, 3)).toBe(true);
    // Seed expands once into its 4-neighbours; it does not dump both panels.
    expect(selected(mask, 0, 0)).toBe(false);
    expect(selected(mask, 7, 0)).toBe(false);
  });

  it("still honours colour tolerance on a flat field", () => {
    const img = grey(4, 4, 10);
    fillRect(img, 2, 0, 4, 4, 200, 200, 200);
    const mask = edgeAwareFloodMask(img, 0, 0, 16);
    expect(selected(mask, 0, 0)).toBe(true);
    expect(selected(mask, 3, 1)).toBe(false);
  });

  it("radius clips the dab to a circular neighbourhood", () => {
    const mask = edgeAwareFloodMask(grey(9, 9, 90), 4, 4, 24, { radius: 1 });
    expect(selected(mask, 4, 4)).toBe(true);
    expect(selected(mask, 5, 4)).toBe(true);
    expect(selected(mask, 4, 5)).toBe(true);
    expect(selected(mask, 0, 0)).toBe(false);
    expect(selected(mask, 8, 8)).toBe(false);
    expect(countSelected(mask)).toBe(5); // centre + 4-neighbourhood
  });

  it("reuses a precomputed Sobel buffer", () => {
    const img = splitByWall();
    const mag = sobelMagnitude(img);
    const a = edgeAwareFloodMask(img, 1, 1, 255, { edgeMagnitude: mag });
    const b = edgeAwareFloodMask(img, 1, 1, 255);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe("unionMasks / quickSelectAccumulate", () => {
  it("union is mutation-safe and ORs alpha", () => {
    const a = emptyMask(2, 1);
    a.data[3] = 255;
    const b = emptyMask(2, 1);
    b.data[7] = 255;
    const u = unionMasks(a, b);
    expect(u.data[3]).toBe(255);
    expect(u.data[7]).toBe(255);
    expect(a.data[7]).toBe(0);
    expect(b.data[3]).toBe(0);
  });

  it("accumulates dabs from both sides of a wall into one mask", () => {
    const img = splitByWall();
    const src = asSource(img);
    const first = quickSelectAccumulate(src, 8, 8, 1, 3, 255, null);
    expect(selected(first, 1, 3)).toBe(true);
    expect(selected(first, 6, 3)).toBe(false);
    const next = quickSelectAccumulate(src, 8, 8, 6, 3, 255, first);
    expect(selected(next, 1, 3)).toBe(true);
    expect(selected(next, 6, 3)).toBe(true);
    expect(selected(first, 6, 3)).toBe(false); // prior unchanged
  });

  it("a first dab with no prior returns the dab itself", () => {
    const src = asSource(grey(3, 3, 12));
    const mask = quickSelectAccumulate(src, 3, 3, 1, 1, 24, null);
    expect(countSelected(mask)).toBe(9);
  });
});
