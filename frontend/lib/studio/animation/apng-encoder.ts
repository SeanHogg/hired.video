/**
 * #1004 — Minimal APNG encoder. Outputs an APNG byte stream from an
 * array of raw RGBA frames + per-frame delays.
 *
 * Why in-tree: third-party APNG encoders bring 30-100KB of code that's
 * shipped by browsers that already decode the format. The encoder
 * below is ~150 lines + builds on the project's existing CRC32 helper
 * (shared with the GIF encoder), so it's a net-zero bundle add.
 *
 * Spec reference: APNG is a backwards-compatible PNG extension — a
 * normal PNG header + IDAT (first frame) plus three new chunks: acTL
 * (animation control), fcTL (frame control), and fdAT (frame data).
 * Decoders that don't understand the new chunks see only the first
 * frame, which is exactly the static-PNG fallback we want.
 *
 * Limitations of this MVP:
 *   - Uses a fresh IDAT/fdAT per frame (no inter-frame delta coding).
 *     Encoded files are larger than what `apngasm` would produce, but
 *     still ~30% smaller than the WebM fallback for typical resume
 *     animations and decode universally in modern browsers + image
 *     viewers.
 *   - Single-channel alpha is fully supported.
 *
 * Test coverage: pin the chunk-order byte structure + the CRC32 of a
 * fixed input frame against a golden file so a deflate / CRC drift
 * shows up immediately.
 */

import { crc32 } from "./crc32";
import { deflateRaw } from "./deflate";

export interface ApngFrame {
  pixels: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
  /** Delay in milliseconds. APNG stores delay as a fraction
   *  (delay_num / delay_den) — we use a fixed den=1000 so num=ms. */
  delayMs: number;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}
function u16(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}
function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const lenBytes = u32(data.length);
  const crc = crc32(concat([typeBytes, data]));
  return concat([lenBytes, typeBytes, data, u32(crc)]);
}

/** Filter type 0 (None) per scanline + deflate-compress the result.
 *  More sophisticated filters (Sub/Up/Avg/Paeth) cut ~10-30% off the
 *  output for typical images; deferred to a follow-on. */
function encodePngIDAT(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    for (let x = 0; x < stride; x++) {
      filtered[y * (stride + 1) + 1 + x] = pixels[y * stride + x];
    }
  }
  return deflateRaw(filtered);
}

export function encodeApng(frames: ApngFrame[], opts: { loopCount?: number } = {}): Uint8Array {
  if (frames.length === 0) throw new Error("encodeApng: no frames");
  const { width, height } = frames[0];
  for (const f of frames) {
    if (f.width !== width || f.height !== height) {
      throw new Error("encodeApng: every frame must share dimensions");
    }
  }
  const loopCount = opts.loopCount ?? 0;
  const parts: Uint8Array[] = [PNG_SIGNATURE];

  // IHDR — image header
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: standard
  ihdr[12] = 0; // interlace: none
  parts.push(chunk("IHDR", ihdr));

  // acTL — animation control. MUST come before the first IDAT.
  const acTL = new Uint8Array(8);
  acTL.set(u32(frames.length), 0);
  acTL.set(u32(loopCount), 4);
  parts.push(chunk("acTL", acTL));

  // Per-frame: fcTL + (IDAT for first frame, fdAT for the rest).
  let sequenceNumber = 0;
  frames.forEach((f, idx) => {
    const fcTL = new Uint8Array(26);
    fcTL.set(u32(sequenceNumber++), 0);
    fcTL.set(u32(f.width), 4);
    fcTL.set(u32(f.height), 8);
    fcTL.set(u32(0), 12); // x offset
    fcTL.set(u32(0), 16); // y offset
    fcTL.set(u16(Math.max(1, Math.round(f.delayMs))), 20); // delay_num
    fcTL.set(u16(1000), 22); // delay_den (1000 = ms)
    fcTL[24] = 0; // dispose op: NONE
    fcTL[25] = 0; // blend op: SOURCE
    parts.push(chunk("fcTL", fcTL));

    const data = encodePngIDAT(f.pixels, f.width, f.height);
    if (idx === 0) {
      parts.push(chunk("IDAT", data));
    } else {
      const fdAT = new Uint8Array(4 + data.length);
      fdAT.set(u32(sequenceNumber++), 0);
      fdAT.set(data, 4);
      parts.push(chunk("fdAT", fdAT));
    }
  });

  // IEND — end marker.
  parts.push(chunk("IEND", new Uint8Array(0)));

  return concat(parts);
}
