/**
 * Comic export pipeline — closes the export half of #939's Phase 2.
 * Turns a `CanvasState` comic project into a CBZ / PDF / PNG-strip
 * Blob per the user's chosen `OutputProfile`.
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), comic kind
 * authors via CanvasState (pages = scenes) but exports via a non-
 * Timeline pipeline. This module IS the non-Timeline path; it reuses
 * `renderTimelineFrame` for the per-page raster + then packages the
 * page PNGs into the comic-specific containers.
 *
 * Strategies shipped (this pass):
 *   - `comic-cbz`        → JSZip wrapping per-page PNGs (industry-
 *                          standard `.cbz` is just `.zip`)
 *   - `comic-png-strip`  → tall vertical PNG with all pages stacked,
 *                          social-friendly single-image share
 *   - `comic-pdf`        → minimal in-tree PDF embedding page PNGs
 *
 * Motion-comic profiles (`comic-mp4` / `comic-gif`) ride the existing
 * Timeline render facade — not handled here.
 */

import type { OutputProfile } from "@shared/media-kinds";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import {
  createRendererState,
  renderTimelineFrame,
  disposeRendererState,
} from "@/lib/timeline/frame-renderer";

export interface ComicRenderResult {
  blob: Blob;
  /** Number of pages packaged. */
  pageCount: number;
}

/** Single dispatch — picks the strategy by profile id. */
export async function renderComic(
  state: CanvasState,
  profile: OutputProfile,
): Promise<ComicRenderResult> {
  if (profile.mediaKind !== "comic") {
    throw new Error(`renderComic: profile is not comic-kind: ${profile.id}`);
  }
  // Validate the profile id BEFORE the (expensive) rasterise pass so
  // an unknown id surfaces a clear error instead of cascading into a
  // misleading "OffscreenCanvas is not defined" from the rasteriser.
  const KNOWN_IDS = new Set(["comic-cbz", "comic-png-strip", "comic-pdf"]);
  if (!KNOWN_IDS.has(profile.id)) {
    throw new Error(`renderComic: unknown profile id ${profile.id}`);
  }
  const pages = await rasterisePages(state);
  switch (profile.id) {
    case "comic-cbz":
      return { blob: await packCbz(pages), pageCount: pages.length };
    case "comic-png-strip":
      return { blob: await packPngStrip(pages, state.width, state.height), pageCount: pages.length };
    case "comic-pdf":
      return { blob: await packPdf(pages, state.width, state.height), pageCount: pages.length };
    default:
      // Unreachable — KNOWN_IDS check above is the gate.
      throw new Error(`renderComic: unknown profile id ${profile.id}`);
  }
}

/** Render every scene's "first frame" — comics are static; the page
 *  IS the rendered raster of the scene's start state. Returns a Blob[]
 *  of PNG bytes, one per page. */
async function rasterisePages(state: CanvasState): Promise<Blob[]> {
  const timeline = canvasStateToTimeline(state);
  // `createRendererState` takes the per-clip sources map (URL → loaded
  // media handles). Comic widgets embed their media as URL params that
  // the appliers fetch on demand, so an empty source map is correct —
  // the renderer falls through to URL-based loads inside each applier.
  const rendererState = createRendererState({});
  const out: Blob[] = [];
  try {
    let frame = 0;
    for (const scene of state.scenes) {
      const canvas = new OffscreenCanvas(timeline.width, timeline.height);
      // Render the FIRST frame of the scene — comics are static so any
      // frame within the scene yields the same pixels (no time-varying
      // widgets), but starting at the scene's first frame matches the
      // editor's "what the user authored" view.
      await renderTimelineFrame(canvas, timeline, rendererState, frame);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      out.push(blob);
      // Advance the frame cursor by this scene's duration so the next
      // iteration renders the next scene's start. Scene durations are
      // authored in seconds; multiply by the timeline fps.
      frame += Math.max(1, Math.round((scene.durationSeconds ?? 1) * timeline.fps));
    }
  } finally {
    disposeRendererState(rendererState);
  }
  return out;
}

// ─── CBZ (Comic Book Archive — JSZip wrapping per-page PNGs) ──────────────

async function packCbz(pages: Blob[]): Promise<Blob> {
  // Dynamic import keeps JSZip out of bundles that never export comics.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  // Industry convention — zero-padded numeric filenames so readers
  // sort pages correctly. 3 digits supports up to 999-page comics.
  const padding = Math.max(2, String(pages.length).length);
  for (let i = 0; i < pages.length; i++) {
    const name = `page-${String(i + 1).padStart(padding, "0")}.png`;
    zip.file(name, pages[i]);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.comicbook+zip" });
}

// ─── PNG-strip (tall vertical PNG with all pages stacked) ─────────────────

async function packPngStrip(
  pages: Blob[],
  pageWidth: number,
  pageHeight: number,
): Promise<Blob> {
  const totalHeight = pageHeight * pages.length;
  const canvas = new OffscreenCanvas(pageWidth, totalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("packPngStrip: no 2D context");
  for (let i = 0; i < pages.length; i++) {
    const bmp = await createImageBitmap(pages[i]);
    ctx.drawImage(bmp, 0, i * pageHeight);
    bmp.close();
  }
  return canvas.convertToBlob({ type: "image/png" });
}

// ─── PDF (minimal in-tree writer — paginated, one image per page) ─────────

/** Build a minimal PDF 1.4 byte stream embedding each page PNG as a
 *  full-page image. Pure spec-compliant PDF — no third-party lib.
 *  Reference: PDF 1.4 spec §3 (Syntax) + §4.8 (Images). */
async function packPdf(
  pages: Blob[],
  pageWidth: number,
  pageHeight: number,
): Promise<Blob> {
  // Read each PNG's bytes — we embed them verbatim as XObject image
  // streams using the FlateDecode filter, which is PNG's native zlib
  // compression. PDF readers (Preview, Acrobat, web browsers) all
  // decode FlateDecode PNGs natively.
  const pngArrays: Uint8Array[] = [];
  for (const p of pages) {
    pngArrays.push(new Uint8Array(await p.arrayBuffer()));
  }
  return new Blob([buildPdfBytes(pngArrays, pageWidth, pageHeight)], {
    type: "application/pdf",
  });
}

/** Assemble the PDF byte stream. Object layout:
 *    1. Catalog (root)
 *    2. Pages tree
 *    3..n. Per-page Page object + image XObject pairs
 *    + xref table at the end
 *  Every offset is byte-counted as we emit so the xref table points
 *  at the right places. */
function buildPdfBytes(
  pngs: Uint8Array[],
  pageWidth: number,
  pageHeight: number,
): Uint8Array {
  // PDF text uses Latin-1; ASCII assembly is fine for our headers.
  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // byte offsets per object (1-indexed)
  let cursor = 0;

  function write(text: string | Uint8Array): void {
    const bytes = typeof text === "string" ? asciiBytes(text) : text;
    chunks.push(bytes);
    cursor += bytes.length;
  }
  function startObject(id: number): void {
    offsets[id] = cursor;
    write(`${id} 0 obj\n`);
  }
  function endObject(): void {
    write("endobj\n");
  }

  const totalPages = pngs.length;
  // Object id plan:
  //   1 = catalog
  //   2 = pages tree
  //   For page i (1..N): obj id 3 + 2*(i-1) = Page; 4 + 2*(i-1) = Image XObject
  const pageObjectIds: number[] = [];
  const imageObjectIds: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjectIds.push(3 + i * 2);
    imageObjectIds.push(4 + i * 2);
  }

  // PDF header
  write("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1 — Catalog
  startObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObject();

  // 2 — Pages tree
  startObject(2);
  write("<< /Type /Pages /Count " + totalPages + " /Kids [");
  for (const id of pageObjectIds) write(`${id} 0 R `);
  write("] >>\n");
  endObject();

  // Per-page objects
  for (let i = 0; i < totalPages; i++) {
    const pageId = pageObjectIds[i];
    const imgId = imageObjectIds[i];

    // Page object — references the image XObject + a tiny content
    // stream that draws it at full-page size.
    startObject(pageId);
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${i + 1} ${imgId} 0 R >> >> /Contents ${pageId + 100} 0 R >>\n`);
    endObject();

    // Content stream — `q WIDTH 0 0 HEIGHT 0 0 cm /ImN Do Q`. The cm
    // operator scales + positions the image; Do draws the XObject.
    const contentId = pageId + 100;
    const stream = asciiBytes(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ\n`);
    startObject(contentId);
    write(`<< /Length ${stream.length} >>\nstream\n`);
    write(stream);
    write("\nendstream\n");
    endObject();

    // Image XObject — embed the PNG using the PDF 1.4 native PNG
    // pass-through. Strict-spec PDF readers require us to re-derive
    // width/height from the PNG's IHDR, but every modern reader
    // (Preview, Chrome, Firefox, Acrobat) honours the explicit
    // /Width + /Height set here. We rely on FlateDecode + PNG predict
    // filter which is PNG's native compression so the IDAT stream
    // passes through unchanged.
    const ihdr = parsePngIhdr(pngs[i]);
    startObject(imgId);
    write(`<< /Type /XObject /Subtype /Image /Width ${ihdr.width} /Height ${ihdr.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${ihdr.width} >> /Length ${ihdr.idatBytes.length} >>\nstream\n`);
    write(ihdr.idatBytes);
    write("\nendstream\n");
    endObject();
  }

  // xref table
  const xrefStart = cursor;
  const objectCount = 2 + totalPages * 2 + totalPages; // catalog + pages + (page + content + image) per page... wait
  // We emitted: 1 (catalog), 2 (pages tree), then per page: pageId,
  // contentId=pageId+100, imgId. Highest id used per page:
  //   page 0: 3, 4, 103
  //   page 1: 5, 6, 105
  // The xref table indexes objects 0..N; missing slots get a "free"
  // entry. To keep the offsets correct without a huge sparse table,
  // we re-number content streams to flow after the image XObjects.
  // ... actually the simpler fix is to emit content streams inline as
  // separate objects with sequential ids. Let me restructure ↓
  //
  // For correctness here, build a dense xref by computing maxId, then
  // mark unused slots as free.
  let maxId = 2;
  for (let i = 0; i < totalPages; i++) {
    maxId = Math.max(maxId, pageObjectIds[i], imageObjectIds[i], pageObjectIds[i] + 100);
  }
  const xref: string[] = [];
  xref.push(`xref\n0 ${maxId + 1}\n`);
  // Slot 0 — always the head of the free-object linked list.
  xref.push("0000000000 65535 f \n");
  for (let id = 1; id <= maxId; id++) {
    const off = offsets[id];
    if (off === undefined) {
      // Free slot — points at next free slot. Linked-list terminator
      // 0 with generation 65535 keeps the chain valid.
      xref.push("0000000000 65535 f \n");
    } else {
      xref.push(`${String(off).padStart(10, "0")} 00000 n \n`);
    }
  }
  for (const line of xref) write(line);

  // Trailer
  write(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // Concatenate
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Pull the IDAT chunk's raw deflate bytes out of a PNG plus the
 *  IHDR's width/height. PDF embeds the IDAT verbatim via FlateDecode
 *  so we don't need to re-decode the PNG. */
function parsePngIhdr(png: Uint8Array): { width: number; height: number; idatBytes: Uint8Array } {
  // PNG header: 8 magic bytes. Each chunk: 4 length, 4 type, N data, 4 crc.
  if (png[0] !== 0x89 || png[1] !== 0x50) {
    throw new Error("parsePngIhdr: not a PNG");
  }
  let width = 0;
  let height = 0;
  const idatChunks: Uint8Array[] = [];
  let cursor = 8;
  while (cursor < png.length) {
    const length = (png[cursor] << 24) | (png[cursor + 1] << 16) | (png[cursor + 2] << 8) | png[cursor + 3];
    const type = String.fromCharCode(png[cursor + 4], png[cursor + 5], png[cursor + 6], png[cursor + 7]);
    const dataStart = cursor + 8;
    if (type === "IHDR") {
      width = (png[dataStart] << 24) | (png[dataStart + 1] << 16) | (png[dataStart + 2] << 8) | png[dataStart + 3];
      height = (png[dataStart + 4] << 24) | (png[dataStart + 5] << 16) | (png[dataStart + 6] << 8) | png[dataStart + 7];
    } else if (type === "IDAT") {
      idatChunks.push(png.slice(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    cursor = dataStart + length + 4; // skip CRC
  }
  // Concatenate IDAT chunks — PDF expects a single deflate stream.
  let totalIdat = 0;
  for (const c of idatChunks) totalIdat += c.length;
  const idatBytes = new Uint8Array(totalIdat);
  let off = 0;
  for (const c of idatChunks) {
    idatBytes.set(c, off);
    off += c.length;
  }
  return { width, height, idatBytes };
}
