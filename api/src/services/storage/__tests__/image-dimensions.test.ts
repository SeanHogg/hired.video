/** #950 — image width/height read from header bytes (no decode in the Worker). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readImageDimensions } from "../image-dimensions.js";
import { gifHeader, jpegHeader, pngHeader, webpVp8xHeader } from "./fixtures.js";

describe("readImageDimensions", () => {
  it("reads a PNG IHDR (DrawingStage 4K export)", () => {
    assert.deepEqual(readImageDimensions(pngHeader(4096, 4096)), { width: 4096, height: 4096 });
  });

  it("reads a JPEG SOF0 after APP0 + APP1 (iPhone photo)", () => {
    assert.deepEqual(readImageDimensions(jpegHeader(4032, 3024)), { width: 4032, height: 3024 });
  });

  it("reads a GIF logical screen", () => {
    assert.deepEqual(readImageDimensions(gifHeader(480, 270)), { width: 480, height: 270 });
  });

  it("reads a WebP VP8X canvas (boundary: 1-based 24-bit sizes)", () => {
    assert.deepEqual(readImageDimensions(webpVp8xHeader(1, 16384)), { width: 1, height: 16384 });
  });

  it("accepts an ArrayBufferView over a larger buffer", () => {
    const inner = pngHeader(1200, 630);
    const outer = new Uint8Array(inner.length + 16);
    outer.set(inner, 16);
    assert.deepEqual(readImageDimensions(outer.subarray(16)), { width: 1200, height: 630 });
  });

  it("returns null for truncated, unknown or PDF bytes", () => {
    assert.equal(readImageDimensions(pngHeader(10, 10).subarray(0, 20)), null);
    assert.equal(readImageDimensions(jpegHeader(10, 10).subarray(0, 40)), null);
    assert.equal(readImageDimensions(new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj")), null);
    assert.equal(readImageDimensions(new Uint8Array(4)), null);
  });
});
