/**
 * Header-accurate image byte fixtures for the storage tests — the first bytes
 * of real PNG / JPEG / GIF / WebP files (signature + the chunk that states the
 * size), padded the way a real upload would continue.
 */

export const USER_ID = "3b9f6d2e-8c41-4f7a-9e0d-5a1c2b3d4e5f";
export const PROJECT_ID = "a7c3e1f0-2b4d-4c6e-8f10-123456789abc";

/** PNG: signature + IHDR (width, height, 8-bit RGBA). */
export function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  b.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return b;
}

/** JPEG: SOI, a JFIF APP0 segment, an EXIF-sized APP1 segment, then SOF0. */
export function jpegHeader(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00];
  const app1Body = new Array(300).fill(0x00);
  const app1 = [0xff, 0xe1, (app1Body.length + 2) >> 8, (app1Body.length + 2) & 0xff, ...app1Body];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...sof0, 0xff, 0xda, 0x00, 0x0c]);
}

/** GIF89a logical screen descriptor. */
export function gifHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 0xff, width >> 8, height & 0xff, height >> 8, 0xf7, 0, 0]);
}

/** WebP extended (VP8X) header: canvas width-1 / height-1 as 24-bit LE. */
export function webpVp8xHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  b.set([0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00], 12);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return b;
}
