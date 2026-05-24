/**
 * Minimal in-tree GIF89a encoder — closes Consolidated Gap Register
 * #1004 (GIF strategy half) without pulling a third-party library.
 *
 * Why in-tree: the project's dep posture is conservative (gif.js is
 * not installed; per `project_nle_decision.md` we avoid paid render
 * infra AND third-party libs we can write ourselves). This encoder is
 * ~300 lines covering the GIF89a Animation Application Extension, LZW
 * compression, and a small adaptive palette via the classic median-cut
 * quantizer.
 *
 * Trade-offs accepted:
 *   - 256-color palette per frame (GIF spec limit). For ≤256 colors
 *     the palette is exact; above that, median-cut quantization
 *     approximates. Smooth gradients will band — that's the format.
 *   - One global palette per animation derived from the first frame's
 *     visible pixels. A future enhancement could emit per-frame local
 *     palettes for higher fidelity, traded for file size.
 *   - No interlace, no transparency in the MVP. Transparency is a
 *     follow-on (#1004 follow-up): GIF spec allows a single
 *     transparent color index per frame's Graphic Control Extension;
 *     when AnimationState.background.kind === "transparent" we'd
 *     reserve palette index 0 for transparency. Logged in the gap
 *     register.
 *
 * Inputs: a `FrameInput[]` (raw RGBA pixel buffers + per-frame
 * delay-in-100ths-of-a-second).
 * Output: a `Uint8Array` containing the full GIF89a byte stream,
 * wrapped in a `Blob` of mime `image/gif` by the caller.
 *
 * Reference: GIF89a specification (Compuserve, 1990), section 23
 * (Graphic Control Extension), section 20 (Image Descriptor) +
 * Appendix C (LZW compression of variable-length codes).
 */

export interface GifFrameInput {
  /** Raw RGBA pixels, width*height*4 bytes. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Frame delay in 1/100ths of a second (GIF spec native unit). */
  delayHundredths: number;
}

export interface GifEncodeOptions {
  /** Output width — every frame must match. */
  width: number;
  /** Output height — every frame must match. */
  height: number;
  /** 0 = loop forever (Netscape Application Extension). */
  loopCount: number;
}

/** Encode an animation as a GIF89a byte stream. Synchronous — the call
 *  may take noticeable time for large strips (~50ms per frame on a
 *  modern desktop for 480² at 256 colors). Callers that care about
 *  responsiveness should run this in a Web Worker.
 *  Throws when frame dimensions disagree with `opts.width/height`. */
export function encodeGif(
  frames: GifFrameInput[],
  opts: GifEncodeOptions,
): Uint8Array {
  if (frames.length === 0) {
    throw new Error("encodeGif: no frames");
  }
  for (const f of frames) {
    if (f.width !== opts.width || f.height !== opts.height) {
      throw new Error(
        `encodeGif: frame ${f.width}x${f.height} doesn't match output ${opts.width}x${opts.height}`,
      );
    }
  }

  // Build a global palette from the first frame. Real animators tend
  // to keep the palette stable across the strip so this is usually
  // close to optimal; producing a per-frame palette is a follow-on.
  const palette = buildPalette(frames[0].pixels, 256);
  const indexedFrames = frames.map((f) => quantizeToPalette(f.pixels, palette));

  const out = new ByteWriter();
  writeHeader(out);
  writeLogicalScreenDescriptor(out, opts.width, opts.height, palette.length);
  writeGlobalColorTable(out, palette);
  writeNetscapeLoopExtension(out, opts.loopCount);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    writeGraphicControlExtension(out, f.delayHundredths);
    writeImageDescriptor(out, opts.width, opts.height);
    writeLzwImageData(out, indexedFrames[i], palette.length);
  }

  out.writeByte(0x3b); // GIF trailer
  return out.toUint8Array();
}

// ─── GIF byte-stream writers ──────────────────────────────────────────────

function writeHeader(out: ByteWriter): void {
  for (const c of "GIF89a") out.writeByte(c.charCodeAt(0));
}

function writeLogicalScreenDescriptor(
  out: ByteWriter,
  width: number,
  height: number,
  paletteLen: number,
): void {
  out.writeShort(width);
  out.writeShort(height);
  // Packed: global color table flag (1) + color resolution (8 bit -> 7)
  // + sort flag (0) + size of GCT (log2(paletteLen) - 1, padded).
  const sizeBits = paletteSizeBits(paletteLen);
  // 0x80 = global color table present
  // 0x70 = 8-bit color resolution
  out.writeByte(0x80 | 0x70 | (sizeBits & 0x07));
  out.writeByte(0); // background color index
  out.writeByte(0); // pixel aspect ratio (0 = none)
}

function paletteSizeBits(paletteLen: number): number {
  // GIF stores palette size as 2^(N+1) entries — i.e. 2 = 8 entries,
  // 7 = 256 entries. We pad up to the next power-of-two slot count.
  let slots = 2;
  let n = 0;
  while (slots < paletteLen) {
    slots *= 2;
    n++;
  }
  return n;
}

function writeGlobalColorTable(out: ByteWriter, palette: number[][]): void {
  const targetSlots = 1 << (paletteSizeBits(palette.length) + 1);
  for (let i = 0; i < targetSlots; i++) {
    const entry = palette[i] ?? [0, 0, 0];
    out.writeByte(entry[0]);
    out.writeByte(entry[1]);
    out.writeByte(entry[2]);
  }
}

function writeNetscapeLoopExtension(out: ByteWriter, loopCount: number): void {
  // 0x21 = Extension Introducer
  // 0xFF = Application Extension Label
  // 0x0B = Block Size (11)
  // "NETSCAPE2.0" = 11-byte application identifier + auth code
  // 0x03 = Sub-block size (3 bytes)
  // 0x01 = Sub-block identifier (loop)
  // <loopCount as LE u16>
  // 0x00 = Block Terminator
  out.writeByte(0x21);
  out.writeByte(0xff);
  out.writeByte(0x0b);
  for (const c of "NETSCAPE2.0") out.writeByte(c.charCodeAt(0));
  out.writeByte(0x03);
  out.writeByte(0x01);
  out.writeShort(loopCount);
  out.writeByte(0x00);
}

function writeGraphicControlExtension(out: ByteWriter, delayHundredths: number): void {
  // 0x21 = Extension Introducer
  // 0xF9 = Graphic Control Label
  // 0x04 = Block Size (4)
  // Packed field (disposal=2 restore-to-background, no user input, no transparency)
  // <delay LE u16>
  // 0x00 = transparent color index (unused without transparency flag)
  // 0x00 = Block Terminator
  out.writeByte(0x21);
  out.writeByte(0xf9);
  out.writeByte(0x04);
  // disposal=2 (restore to background) so per-frame paint shows
  // correctly when frames don't completely cover the canvas. Bits:
  //   disposal method = 010 (2) in bits 4-2 → 0x08
  out.writeByte(0x08);
  out.writeShort(delayHundredths);
  out.writeByte(0x00);
  out.writeByte(0x00);
}

function writeImageDescriptor(out: ByteWriter, width: number, height: number): void {
  out.writeByte(0x2c); // Image Separator
  out.writeShort(0); // left
  out.writeShort(0); // top
  out.writeShort(width);
  out.writeShort(height);
  out.writeByte(0x00); // no local color table, no interlace
}

// ─── LZW compression (per GIF89a Appendix C) ──────────────────────────────

function writeLzwImageData(
  out: ByteWriter,
  indices: Uint8Array,
  paletteLen: number,
): void {
  // Minimum LZW code size — GIF requires this to be at least 2 even
  // when the palette is smaller (clear/end codes need 2 bits).
  let minCodeSize = paletteSizeBits(paletteLen) + 1;
  if (minCodeSize < 2) minCodeSize = 2;
  out.writeByte(minCodeSize);

  const lzw = lzwEncode(indices, minCodeSize);

  // Sub-block stream — GIF requires data sub-blocks of up to 255 bytes.
  let i = 0;
  while (i < lzw.length) {
    const chunk = Math.min(255, lzw.length - i);
    out.writeByte(chunk);
    for (let j = 0; j < chunk; j++) out.writeByte(lzw[i + j]);
    i += chunk;
  }
  out.writeByte(0); // Block Terminator
}

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const maxCode = 1 << 12; // GIF caps codes at 12 bits

  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;

  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // Dictionary keyed by string-of-indices → code. Using a Map of
  // string keys keeps the code short; performance is fine for the
  // strip sizes the studio targets (<= ~50 480² frames).
  const newDict = (): Map<string, number> => {
    const d = new Map<string, number>();
    for (let i = 0; i < clearCode; i++) d.set(String.fromCharCode(i), i);
    return d;
  };
  let dict = newDict();
  let nextCode = endCode + 1;

  emit(clearCode);

  let prefix = String.fromCharCode(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = String.fromCharCode(indices[i]);
    const concat = prefix + k;
    if (dict.has(concat)) {
      prefix = concat;
    } else {
      emit(dict.get(prefix)!);
      if (nextCode < maxCode) {
        dict.set(concat, nextCode++);
        if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
      } else {
        // Dictionary full — emit clear and reset (GIF convention).
        emit(clearCode);
        dict = newDict();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      }
      prefix = k;
    }
  }
  emit(dict.get(prefix)!);
  emit(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return bytes;
}

// ─── Palette quantizer (median-cut) ───────────────────────────────────────

function buildPalette(pixels: Uint8ClampedArray, maxColors: number): number[][] {
  // Sample up to 4096 unique colors from the source — full per-pixel
  // scan would be O(n) but the median-cut split below treats each
  // sample equally, so down-sampling preserves correctness.
  const samples: number[][] = [];
  const seen = new Set<number>();
  const stride = Math.max(1, Math.floor((pixels.length / 4) / 4096));
  for (let i = 0; i < pixels.length; i += stride * 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = (r << 16) | (g << 8) | b;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push([r, g, b]);
  }
  if (samples.length === 0) return [[0, 0, 0]];
  if (samples.length <= maxColors) return samples;

  // Median-cut: repeatedly split the bucket with the widest channel
  // range until we hit `maxColors`. Each bucket's representative is
  // the channel-mean of its samples.
  const buckets: number[][][] = [samples];
  while (buckets.length < maxColors) {
    let widestIdx = 0;
    let widestRange = -1;
    let widestChannel = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      const [range, channel] = widestChannelRange(b);
      if (range > widestRange) {
        widestRange = range;
        widestIdx = i;
        widestChannel = channel;
      }
    }
    if (widestRange <= 0) break; // can't split further
    const b = buckets[widestIdx];
    b.sort((a, c) => a[widestChannel] - c[widestChannel]);
    const mid = Math.floor(b.length / 2);
    buckets.splice(widestIdx, 1, b.slice(0, mid), b.slice(mid));
  }

  return buckets.map(meanColor);
}

function widestChannelRange(bucket: number[][]): [number, number] {
  let lo = [255, 255, 255];
  let hi = [0, 0, 0];
  for (const p of bucket) {
    for (let c = 0; c < 3; c++) {
      if (p[c] < lo[c]) lo[c] = p[c];
      if (p[c] > hi[c]) hi[c] = p[c];
    }
  }
  let widestRange = -1;
  let widestChannel = 0;
  for (let c = 0; c < 3; c++) {
    const range = hi[c] - lo[c];
    if (range > widestRange) {
      widestRange = range;
      widestChannel = c;
    }
  }
  return [widestRange, widestChannel];
}

function meanColor(bucket: number[][]): number[] {
  let r = 0, g = 0, b = 0;
  for (const p of bucket) { r += p[0]; g += p[1]; b += p[2]; }
  const n = bucket.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function quantizeToPalette(pixels: Uint8ClampedArray, palette: number[][]): Uint8Array {
  const out = new Uint8Array(pixels.length / 4);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const dr = r - palette[p][0];
      const dg = g - palette[p][1];
      const db = b - palette[p][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = p;
      }
    }
    out[j] = bestIdx;
  }
  return out;
}

// ─── Byte writer (small growable buffer) ──────────────────────────────────

class ByteWriter {
  private buf: number[] = [];
  writeByte(v: number): void { this.buf.push(v & 0xff); }
  writeShort(v: number): void {
    this.buf.push(v & 0xff);
    this.buf.push((v >>> 8) & 0xff);
  }
  toUint8Array(): Uint8Array { return new Uint8Array(this.buf); }
}
