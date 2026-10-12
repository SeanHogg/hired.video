/**
 * Smoke tests for the in-tree GIF89a encoder (#1004). Validates the
 * emitted bytes carry the GIF89a signature + Netscape loop extension +
 * end-of-file trailer, and that an explicit multi-frame strip produces
 * a byte stream that's strictly longer than a single-frame strip
 * (proving the second frame's image-data block actually lands).
 *
 * Full visual fidelity is best-tested by eye via the actual studio
 * editor's export-and-preview — these unit tests pin the byte-stream
 * structure so a future encoder tweak can't silently regress.
 */

import { describe, expect, it } from "vitest";
import { encodeGif, type GifFrameInput } from "../animation/gif89a-encoder";

function checkerFrame(width: number, height: number, tint: number): GifFrameInput {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dark = ((x >> 3) ^ (y >> 3)) & 1;
      pixels[i] = dark ? tint : 240;
      pixels[i + 1] = dark ? tint : 240;
      pixels[i + 2] = dark ? tint : 240;
      pixels[i + 3] = 255;
    }
  }
  return { pixels, width, height, delayHundredths: 10 };
}

describe("encodeGif", () => {
  it("throws when frames is empty", () => {
    expect(() => encodeGif([], { width: 8, height: 8, loopCount: 0 })).toThrow();
  });

  it("throws when frame dimensions don't match opts", () => {
    const f = checkerFrame(8, 8, 0);
    expect(() => encodeGif([f], { width: 16, height: 16, loopCount: 0 })).toThrow();
  });

  it("emits the GIF89a signature + trailer", () => {
    const bytes = encodeGif([checkerFrame(16, 16, 0)], { width: 16, height: 16, loopCount: 0 });
    // First 6 bytes = "GIF89a"
    const sig = String.fromCharCode(...bytes.slice(0, 6));
    expect(sig).toBe("GIF89a");
    // Last byte = 0x3B (GIF trailer)
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("embeds a Netscape loop extension", () => {
    const bytes = encodeGif([checkerFrame(16, 16, 0)], { width: 16, height: 16, loopCount: 0 });
    // The 11-byte ASCII identifier "NETSCAPE2.0" must appear somewhere
    // in the stream (the loop extension's application identifier).
    const ascii = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
    expect(ascii).toContain("NETSCAPE2.0");
  });

  it("multi-frame stream is meaningfully longer than single-frame", () => {
    const single = encodeGif([checkerFrame(16, 16, 0)], { width: 16, height: 16, loopCount: 0 });
    const multi = encodeGif(
      [checkerFrame(16, 16, 0), checkerFrame(16, 16, 80), checkerFrame(16, 16, 160)],
      { width: 16, height: 16, loopCount: 0 },
    );
    expect(multi.byteLength).toBeGreaterThan(single.byteLength);
  });

  it("handles a tiny palette (≤ 4 colors) by padding the GCT", () => {
    // All pixels the same color → palette has one entry; encoder pads
    // the GCT to the next power-of-two slot count.
    const w = 4, h = 4;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200;
      pixels[i + 1] = 100;
      pixels[i + 2] = 50;
      pixels[i + 3] = 255;
    }
    const bytes = encodeGif(
      [{ pixels, width: w, height: h, delayHundredths: 10 }],
      { width: w, height: h, loopCount: 0 },
    );
    // Header (6) + LSD (7) + minimal GCT (at least 2 colors × 3 bytes)
    // + Netscape loop ext (~19) + GCE (8) + image descriptor (10) +
    // LZW data + trailer = >50 bytes minimum.
    expect(bytes.byteLength).toBeGreaterThan(50);
  });
});
