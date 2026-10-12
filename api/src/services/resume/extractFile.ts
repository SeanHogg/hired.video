/**
 * Server-side résumé file → plain text extraction (Cloudflare Workers safe).
 *
 * Used by the web/mobile resume upload routes (/api/resumes/parse,
 * /createfromfile) and the partner SDK `file` upload path, so every surface
 * reads the ORIGINAL PDF/DOCX bytes the same way.
 *
 *   - PDF  → `extractPdfText` (utils/pdf-extract: unpdf/pdf.js + fallback).
 *     A scanned PDF (no text layer) still returns INVALID_RESUME from
 *     `extractResumeText`; callers that can OCR should then pull embedded
 *     page images via `extractPdfEmbeddedImages` (Workers has no canvas, so
 *     we cannot rasterise — but phone/scanner PDFs typically embed
 *     DCTDecode JPEGs or FlateDecode RGB/gray rasters we can hand to
 *     vision as `image_url`).
 *   - DOCX → `fflate` unzip of `word/document.xml`, tags stripped.
 *   - text/JSON → decoded as-is.
 *   - legacy .doc (OLE), images, other binaries → UNSUPPORTED_MEDIA_TYPE.
 *
 * Pure of DB/AI; safe to unit-test.
 */
import { unzipSync, strFromU8, unzlibSync, inflateSync, zlibSync } from "fflate";
import { looksLikeBinaryText, stripResumeControlChars } from "./parse.js";
import { extractPdfText } from "../../utils/pdf-extract.js";

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; code: "UNSUPPORTED_MEDIA_TYPE" | "INVALID_RESUME"; message: string };

const PDF_MAGIC = "%PDF";
const ZIP_MAGIC = [0x50, 0x4b]; // "PK" — docx/xlsx/pptx are zip containers

function startsWithBytes(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

export function looksLikePdf(bytes: Uint8Array, contentType?: string): boolean {
  if (contentType && /pdf/i.test(contentType)) return true;
  return new TextDecoder("latin1").decode(bytes.subarray(0, 5)).startsWith(PDF_MAGIC);
}

/** True when content-type, filename, or %PDF magic says this is a PDF. */
export function isPdfResumeBytes(
  bytes: Uint8Array,
  opts: { contentType?: string; filename?: string } = {},
): boolean {
  return looksLikePdf(bytes, opts.contentType) || (opts.filename ?? "").toLowerCase().endsWith(".pdf");
}

/** Matches the browser raster cap (frontend/lib/pdf-raster.ts). */
export const PDF_EMBEDDED_IMAGE_MAX_PAGES = 5;

/** Skip logos / icons — a résumé page scan is at least this on one edge. */
const MIN_PAGE_EDGE = 400;

/** Skip tiny DCTDecode blobs (thumbnails). A page JPEG is typically tens of KB. */
const MIN_JPEG_BYTES = 4 * 1024;

export type PdfEmbeddedImage = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
};

function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export type DecodeResumeFileResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; message: string };

/**
 * Decode a partner/SDK `file` string into bytes.
 *
 * Accepts:
 *   - standard base64 (optionally a `data:` URL with `;base64`)
 *   - a raw PDF payload whose first bytes are `%PDF` (latin1 / JSON-escaped
 *     binary). Partners and the Chrome extension sometimes POST the PDF
 *     body instead of base64; treating that as invalid base64 422'd them
 *     (#2308).
 *
 * Data-URL comma stripping is applied ONLY to `data:` headers — a raw PDF
 * body commonly contains commas (content streams, arrays) and must not be
 * sliced at the first one.
 */
export function decodeResumeFilePayload(file: string): DecodeResumeFileResult {
  const dataUrl = /^\s*data:[^,]*,/i.exec(file);
  const header = dataUrl?.[0] ?? "";
  const payload = dataUrl ? file.slice(header.length) : file;
  const declaredBase64 = /;base64/i.test(header);
  const rawCandidate = payload.replace(/^\uFEFF?/, "");
  const looksRawPdf = rawCandidate.startsWith(PDF_MAGIC);

  if (looksRawPdf && !declaredBase64) {
    return { ok: true, bytes: latin1ToBytes(rawCandidate) };
  }

  try {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, bytes };
  } catch {
    if (looksRawPdf) {
      return { ok: true, bytes: latin1ToBytes(rawCandidate) };
    }
    return { ok: false, message: "`file` is not valid base64 or a raw PDF." };
  }
}

/** Trim PDF stream padding and slice a complete JPEG (SOI…EOI). */
function jpegFromStreamData(raw: Uint8Array): Uint8Array | null {
  let start = 0;
  while (
    start < raw.length &&
    (raw[start] === 0x00 || raw[start] === 0x0a || raw[start] === 0x0d || raw[start] === 0x20)
  ) {
    start++;
  }
  if (start + 2 >= raw.length || raw[start] !== 0xff || raw[start + 1] !== 0xd8) return null;
  let end = raw.length;
  for (let i = raw.length - 2; i > start + 2; i--) {
    if (raw[i] === 0xff && raw[i + 1] === 0xd9) {
      end = i + 2;
      break;
    }
  }
  const jpeg = raw.subarray(start, end);
  return jpeg.length >= MIN_JPEG_BYTES ? jpeg : null;
}

function dictImageFilter(dict: string): "DCTDecode" | "FlateDecode" | null {
  if (!/\/Subtype\s*\/Image\b/.test(dict)) return null;
  const filterArray = dict.match(/\/Filter\s*\[([^\]]*)\]/);
  const token = (filterArray ? filterArray[1] : dict.match(/\/Filter\s*(\/\w+)/)?.[1] ?? "").trim();
  if (token === "/DCTDecode") return "DCTDecode";
  if (token === "/FlateDecode") return "FlateDecode";
  return null;
}

function dictInt(dict: string, name: string): number {
  const needle = `/${name} `;
  const i = dict.indexOf(needle);
  if (i < 0) return 0;
  return parseInt(dict.slice(i + needle.length), 10) || 0;
}

/** RGB / gray only — CMYK and Indexed cannot become a PNG without a palette. */
function dictColorChannels(dict: string): number {
  if (/\/(?:ColorSpace|CS)\s*\/DeviceGray\b/.test(dict)) return 1;
  if (/\/(?:ColorSpace|CS)\s*\/DeviceRGB\b/.test(dict)) return 3;
  if (/\/(?:ColorSpace|CS)\s*\/(?:DeviceCMYK|Indexed|ICCBased)\b/.test(dict)) return 0;
  const colors = dictInt(dict, "Colors");
  if (colors === 1 || colors === 3) return colors;
  return 3;
}

function inflatePdfStream(raw: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(raw);
  } catch {
    try {
      return inflateSync(raw);
    } catch {
      return null;
    }
  }
}

const PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = PNG_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode raw (or PNG-predicted) pixels as a PNG so vision OCR can consume them. */
function pngFromRawPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
  alreadyFiltered: boolean,
): Uint8Array | null {
  if (channels !== 1 && channels !== 3 && channels !== 4) return null;
  if (width <= 0 || height <= 0) return null;
  const rowRaw = width * channels;
  const rowFiltered = rowRaw + 1;
  const expected = alreadyFiltered ? height * rowFiltered : height * rowRaw;
  if (pixels.length < expected) return null;
  let filtered: Uint8Array;
  if (alreadyFiltered) {
    filtered = pixels.subarray(0, expected);
  } else {
    filtered = new Uint8Array(height * rowFiltered);
    for (let y = 0; y < height; y++) {
      filtered[y * rowFiltered] = 0;
      filtered.set(pixels.subarray(y * rowRaw, (y + 1) * rowRaw), y * rowFiltered + 1);
    }
  }
  const colorType = channels === 1 ? 0 : channels === 4 ? 6 : 2;
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const idat = zlibSync(filtered);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = pngChunk("IHDR", ihdr);
  const idatChunk = pngChunk("IDAT", idat);
  const iendChunk = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  out.set(sig, 0);
  out.set(ihdrChunk, sig.length);
  out.set(idatChunk, sig.length + ihdrChunk.length);
  out.set(iendChunk, sig.length + ihdrChunk.length + idatChunk.length);
  return out;
}

/**
 * Pull embedded page images out of a scanned PDF (DCTDecode JPEGs or
 * FlateDecode RGB/gray rasters). Workers-safe: no canvas, no pdf.js render.
 * Returns at most {@link PDF_EMBEDDED_IMAGE_MAX_PAGES} images, skipping
 * logos/thumbnails. Empty when the PDF has no unpackable page images
 * (CCITT / JBIG2 still 422).
 */
export function extractPdfEmbeddedImages(bytes: Uint8Array): PdfEmbeddedImage[] {
  const pdfStr = new TextDecoder("latin1").decode(bytes);
  const images: PdfEmbeddedImage[] = [];
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(pdfStr)) !== null && images.length < PDF_EMBEDDED_IMAGE_MAX_PAGES) {
    const dict = pdfStr.slice(Math.max(0, m.index - 1200), m.index);
    const filter = dictImageFilter(dict);
    if (!filter) continue;

    const width = dictInt(dict, "Width");
    const height = dictInt(dict, "Height");
    if ((width > 0 || height > 0) && Math.max(width, height) < MIN_PAGE_EDGE) continue;

    const dataStart = m.index + m[0].length;
    const lengthMatch = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let raw: Uint8Array;
    if (lengthMatch) {
      const end = Math.min(bytes.length, dataStart + Number(lengthMatch[1]));
      raw = bytes.subarray(dataStart, end);
    } else {
      const end = pdfStr.indexOf("endstream", dataStart);
      if (end < 0) continue;
      raw = bytes.subarray(dataStart, end);
    }

    if (filter === "DCTDecode") {
      const jpeg = jpegFromStreamData(raw);
      if (!jpeg) continue;
      images.push({ bytes: jpeg, mime: "image/jpeg" });
      continue;
    }

    const bpc = dictInt(dict, "BitsPerComponent");
    if (bpc !== 0 && bpc !== 8) continue;
    if (width <= 0 || height <= 0) continue;
    const channels = dictColorChannels(dict);
    if (channels === 0) continue;
    const inflated = inflatePdfStream(raw);
    if (!inflated) continue;
    let png: Uint8Array | null = null;
    try {
      png = pngFromRawPixels(inflated, width, height, channels, dictInt(dict, "Predictor") >= 10);
    } catch {
      png = null;
    }
    if (!png) continue;
    images.push({ bytes: png, mime: "image/png" });
  }
  return images;
}

/** Name embedded page images `<stem>-p1.jpg` / `.png` to match the browser rasteriser. */
export function pdfEmbeddedImagesToFiles(
  images: readonly PdfEmbeddedImage[],
  filename?: string,
): File[] {
  const stem = (filename ?? "resume").replace(/\.pdf$/i, "") || "resume";
  return images.map((img, i) => {
    const ext = img.mime === "image/png" ? "png" : "jpg";
    return new File([img.bytes], `${stem}-p${i + 1}.${ext}`, { type: img.mime });
  });
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, ZIP_MAGIC);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Extract visible text from a WordprocessingML `document.xml`, preserving
 *  paragraph breaks (`</w:p>`) and tabs so the regex parser sees line structure. */
function docxXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((para) => {
      const withTabs = para.replace(/<w:tab\b[^>]*\/?>/g, "\t");
      const runs = [...withTabs.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
        decodeXmlEntities(m[1]),
      );
      return runs.join("");
    })
    .join("\n");
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const clean = stripResumeControlChars(await extractPdfText(bytes)).trim();
  if (!clean) {
    return {
      ok: false,
      code: "INVALID_RESUME",
      message: "PDF has no extractable text layer (likely a scanned image). Send `rawText`.",
    };
  }
  return { ok: true, text: clean };
}

function extractDocx(bytes: Uint8Array): ExtractResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  } catch {
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Not a readable .docx (zip could not be opened). Send `rawText`.",
    };
  }
  const doc = entries["word/document.xml"];
  if (!doc) {
    // A PK zip that isn't a Word document (e.g. .xlsx/.pptx/.pages).
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Zip is not a Word .docx. Send `rawText` or a supported format.",
    };
  }
  const text = stripResumeControlChars(docxXmlToText(strFromU8(doc))).trim();
  if (!text) {
    return { ok: false, code: "INVALID_RESUME", message: ".docx contained no text." };
  }
  return { ok: true, text };
}

/**
 * Decode a résumé file's bytes to plain text. `contentType`/`filename` are
 * hints; detection falls back to magic bytes so a mislabeled upload still works.
 */
export async function extractResumeText(
  bytes: Uint8Array,
  opts: { contentType?: string; filename?: string } = {},
): Promise<ExtractResult> {
  const name = (opts.filename ?? "").toLowerCase();
  const ct = opts.contentType ?? "";

  if (looksLikePdf(bytes, ct) || name.endsWith(".pdf")) {
    return extractPdf(bytes);
  }
  if (looksLikeZip(bytes)) {
    // Any PK zip is probed for word/document.xml; non-Word zips (xlsx/pptx)
    // are rejected inside extractDocx. contentType/filename are only hints.
    return extractDocx(bytes);
  }
  if (/msword/i.test(ct) || name.endsWith(".doc")) {
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Legacy .doc (binary Word) isn't supported. Save as .docx or PDF, or send `rawText`.",
    };
  }

  // Fall through: treat as text/JSON if it decodes cleanly. No options object —
  // newer @types/node types TextDecoder options as requiring `ignoreBOM`; the
  // default decoder is already non-fatal, which is what we want.
  const text = new TextDecoder("utf-8").decode(bytes);
  if (looksLikeBinaryText(text)) {
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: `Unsupported file type${ct ? ` (${ct})` : ""}. Supported: PDF, DOCX, text, JSON.`,
    };
  }
  const clean = stripResumeControlChars(text).trim();
  if (!clean) return { ok: false, code: "INVALID_RESUME", message: "File decoded to empty text." };
  return { ok: true, text: clean };
}
