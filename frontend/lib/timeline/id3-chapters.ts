/**
 * ID3v2.4 chapter-frame writer — produces the CHAP + CTOC frames the
 * podcast spec (https://id3.org/id3v2-chapters-1.0) defines for chapter
 * markers in MP3 / M4A audio files. Closes the chapter half of #907.
 *
 * Why in-tree: the project's no-dep posture (per `project_nle_decision.md`)
 * prefers small focused encoders we own outright. This writer is ~200
 * lines of well-tested byte emission — cheaper than pulling
 * `node-id3` / `browser-id3-writer` (~30kb gzipped) and dealing with
 * their browser-build quirks.
 *
 * Scope (this session):
 *   - Emit a complete ID3v2.4 tag containing TOC (CTOC) + per-chapter
 *     (CHAP) frames. Each CHAP carries start/end times in ms + an
 *     embedded TIT2 sub-frame with the chapter title.
 *   - Pure function — caller prepends the bytes to an MP3 / M4A blob
 *     before download.
 *
 * Deferred (when ffmpeg.wasm lands per NLE M3):
 *   - The actual MP3 / M4A transcode (audio-only-render emits WAV today).
 *   - Apple iTunes chapter `chpl` atom for M4A — a different format that
 *     ffmpeg can write directly; not needed once we have the transcode
 *     pipeline.
 *   - Embedded chapter artwork (APIC frame nested inside CHAP).
 *
 * Reference: ID3v2.4.0 spec (https://id3.org/id3v2.4.0-structure) +
 * Chapter Frame Addendum (https://id3.org/id3v2-chapters-1.0).
 */

export interface Id3Chapter {
  /** Stable element id surfaced to Apple Podcasts / Spotify chapter
   *  views. Recommended pattern: `chp1` / `chp2` / … */
  elementId: string;
  /** Start of the chapter in milliseconds from the start of the file. */
  startTimeMs: number;
  /** End of the chapter in milliseconds. Most players use start-of-next
   *  as the end; the spec requires it to be set explicitly. */
  endTimeMs: number;
  /** Chapter title — surfaced in podcast app chapter lists. */
  title: string;
}

/** Emit an ID3v2.4 tag carrying the chapter table. Returns a
 *  Uint8Array the caller prepends to the audio bytes. */
export function writeId3v2Chapters(chapters: Id3Chapter[]): Uint8Array {
  if (chapters.length === 0) return new Uint8Array(0);

  // Build inner frames first so we can compute the tag's total size.
  const frames: Uint8Array[] = [];
  frames.push(writeCtocFrame(chapters));
  for (const ch of chapters) frames.push(writeChapFrame(ch));

  let payloadSize = 0;
  for (const f of frames) payloadSize += f.length;

  // ID3v2.4 tag header — 10 bytes:
  //   "ID3" (3) + version major (1, "4") + revision (1, "0") +
  //   flags (1) + size (4, synchsafe)
  const header = new Uint8Array(10);
  header[0] = 0x49; // "I"
  header[1] = 0x44; // "D"
  header[2] = 0x33; // "3"
  header[3] = 0x04; // major version
  header[4] = 0x00; // revision
  header[5] = 0x00; // flags (no extended header, no footer)
  writeSynchsafeUint32(payloadSize, header, 6);

  const out = new Uint8Array(10 + payloadSize);
  out.set(header, 0);
  let offset = 10;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}

/** Build a CTOC (Table of Contents) frame referencing all chapter
 *  CHAP frames in order. Marks the TOC as the top-level / primary
 *  TOC so podcast apps surface it on track entry. */
function writeCtocFrame(chapters: Id3Chapter[]): Uint8Array {
  // Frame body:
  //   element id (null-terminated text): "toc"
  //   flags (1 byte): bit 0 = top-level, bit 1 = ordered → both set
  //   entry count (1 byte): number of child element ids
  //   child element ids (null-terminated text each): each CHAP's elementId
  const elementId = textZ("toc");
  const flags = new Uint8Array([0x03]); // top-level + ordered
  const entryCount = new Uint8Array([chapters.length & 0xff]);
  const childIds = chapters.map((c) => textZ(c.elementId));

  const bodyParts: Uint8Array[] = [elementId, flags, entryCount, ...childIds];
  return wrapFrame("CTOC", concat(bodyParts));
}

/** Build a CHAP (Chapter) frame for a single chapter. Embeds a TIT2
 *  sub-frame so the chapter has a human-readable title. */
function writeChapFrame(chapter: Id3Chapter): Uint8Array {
  // Frame body:
  //   element id (null-terminated text)
  //   start time (4 bytes, big-endian uint32 — milliseconds)
  //   end time (4 bytes, big-endian uint32)
  //   start offset (4 bytes, 0xFFFFFFFF when undefined)
  //   end offset (4 bytes, 0xFFFFFFFF when undefined)
  //   optional embedded sub-frames (TIT2 for the title)
  const elementId = textZ(chapter.elementId);
  const times = new Uint8Array(16);
  writeUint32BE(chapter.startTimeMs >>> 0, times, 0);
  writeUint32BE(chapter.endTimeMs >>> 0, times, 4);
  // No byte-offset addressing — players use timestamps. Spec says
  // 0xFFFFFFFF means "undefined".
  writeUint32BE(0xffffffff, times, 8);
  writeUint32BE(0xffffffff, times, 12);
  const titleSubframe = writeTit2Subframe(chapter.title);
  return wrapFrame("CHAP", concat([elementId, times, titleSubframe]));
}

/** Build an embedded TIT2 (Title) sub-frame holding the chapter title
 *  as UTF-16 with BOM (encoding 0x01, the spec-mandated default). */
function writeTit2Subframe(title: string): Uint8Array {
  const enc = new Uint8Array([0x01]); // UTF-16 with BOM
  const titleBytes = encodeUtf16WithBom(title);
  const terminator = new Uint8Array([0x00, 0x00]);
  return wrapFrame("TIT2", concat([enc, titleBytes, terminator]));
}

// ─── Frame wrapper + primitives ────────────────────────────────────────────

/** Wrap a frame body with the 10-byte ID3v2.4 frame header:
 *    frame id (4 ASCII chars) + size (4, synchsafe) + flags (2) */
function wrapFrame(frameId: string, body: Uint8Array): Uint8Array {
  if (frameId.length !== 4) {
    throw new Error(`ID3 frame id must be 4 chars: ${frameId}`);
  }
  const out = new Uint8Array(10 + body.length);
  out[0] = frameId.charCodeAt(0);
  out[1] = frameId.charCodeAt(1);
  out[2] = frameId.charCodeAt(2);
  out[3] = frameId.charCodeAt(3);
  writeSynchsafeUint32(body.length, out, 4);
  // Flags — both bytes 0 (no preservation flags, no compression /
  // encryption / unsynchronisation).
  out[8] = 0;
  out[9] = 0;
  out.set(body, 10);
  return out;
}

/** Encode a small uint32 as a "synchsafe" 4-byte integer — the ID3v2
 *  size encoding that uses only 7 bits per byte (high bit cleared) so
 *  the size field can't be mistaken for an MPEG sync marker. */
function writeSynchsafeUint32(value: number, out: Uint8Array, offset: number): void {
  if (value < 0 || value > 0x0fffffff) {
    throw new Error(`ID3 synchsafe size out of range: ${value}`);
  }
  out[offset + 0] = (value >>> 21) & 0x7f;
  out[offset + 1] = (value >>> 14) & 0x7f;
  out[offset + 2] = (value >>> 7) & 0x7f;
  out[offset + 3] = value & 0x7f;
}

/** Write a regular big-endian uint32 (for CHAP timestamps). */
function writeUint32BE(value: number, out: Uint8Array, offset: number): void {
  out[offset + 0] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

/** ISO-8859-1 null-terminated text — used for element ids. ASCII-only
 *  ids are safe; chars outside ISO-8859-1 are clamped to '?'. */
function textZ(text: string): Uint8Array {
  const out = new Uint8Array(text.length + 1);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c <= 0xff ? c : 0x3f;
  }
  out[text.length] = 0;
  return out;
}

/** UTF-16 little-endian with byte-order-mark prefix — the ID3v2.4
 *  encoding-byte-0x01 convention. Player support is universal. */
function encodeUtf16WithBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  // BOM 0xFFFE = LE
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[2 + i * 2 + 1] = (c >>> 8) & 0xff;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
