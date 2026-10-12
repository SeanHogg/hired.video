// image-dimensions.ts — width/height from an image's header bytes (#950).
//
// The media library shows each image's dimensions. Decoding an image in the
// Worker is out of the question (10 ms CPU), but every common format states
// its size in the first bytes: PNG IHDR, GIF logical screen, WebP VP8/VP8L/
// VP8X chunk, JPEG SOFn marker. This reads only those; anything else (or a
// truncated header) returns null and the row stores no dimensions.

export interface ImageDimensions {
  width: number;
  height: number;
}

/** JPEG scans stop after this many bytes (SOF sits well inside it). */
const JPEG_SCAN_LIMIT = 512 * 1024;

function toBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function valid(width: number, height: number): ImageDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function png(b: Uint8Array): ImageDimensions | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  if (b.length < 24 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return valid(v.getUint32(16), v.getUint32(20));
}

function gif(b: Uint8Array): ImageDimensions | null {
  if (b.length < 10) return null;
  return valid(b[6]! | (b[7]! << 8), b[8]! | (b[9]! << 8));
}

function webp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (chunk === "VP8X") {
    const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return valid(w, h);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8 ") {
    // Key frame start code 9D 01 2A, then 14-bit width/height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return valid((b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff);
  }
  return null;
}

/** SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC). */
function isSofMarker(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

function jpeg(b: Uint8Array): ImageDimensions | null {
  const end = Math.min(b.length, JPEG_SCAN_LIMIT);
  let i = 2;
  while (i + 9 < end) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2; // standalone markers carry no length
      continue;
    }
    const length = (b[i + 2]! << 8) | b[i + 3]!;
    if (length < 2) return null;
    if (isSofMarker(marker)) {
      return valid((b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!);
    }
    if (marker === 0xda) return null; // start of scan: no SOF before it
    i += 2 + length;
  }
  return null;
}

/** Dimensions of a PNG / JPEG / GIF / WebP from its header, else null. */
export function readImageDimensions(input: ArrayBuffer | ArrayBufferView): ImageDimensions | null {
  const b = toBytes(input);
  if (b.length < 10) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return png(b);
  if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return gif(b);
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    return webp(b);
  }
  return null;
}
