/**
 * CAD PDF encoder (#930). Renders the drawing to a single PDF page
 * sized to the drawing's sheet dimensions. Reuses the same minimal
 * in-tree PDF infrastructure as the comic exporter — we rasterise
 * the drawing via the existing `drawCad` renderer onto an
 * OffscreenCanvas, then embed it as an image XObject in a one-page
 * PDF. This gives PDF readers (Preview, Acrobat, browsers) a
 * faithful visual rendition.
 *
 * Vector-faithful PDF (emitting each shape as a native PDF path) is a
 * Phase 2 follow-on (#1168) — the raster pass ships now so CAD users
 * can print + share their drawings today.
 */

import type { CadState } from "@shared/cad-state";
import { drawCad } from "./cad-renderer";

/** Render the CAD state to a one-page PDF. Returns a Blob with
 *  `application/pdf` mime. Caller is responsible for download +
 *  cleanup. */
export async function renderCadPdf(state: CadState): Promise<Blob> {
  // 1mm ≈ 2.83465 PDF points (72pt = 1in = 25.4mm). The PDF page
  // dimensions need to be in points; canvas pixels can be whatever
  // we like (we scale via the PDF content stream's transform matrix).
  const MM_PER_PT = 0.352778;
  const PT_PER_MM = 1 / MM_PER_PT;
  const pageWidthPt = state.widthMm * PT_PER_MM;
  const pageHeightPt = state.heightMm * PT_PER_MM;

  // Rasterise at 150dpi for print quality (close to laser-printer
  // native). At 150dpi, 1mm = ~5.91 pixels.
  const PX_PER_MM = 5.91;
  const canvasWidth = Math.round(state.widthMm * PX_PER_MM);
  const canvasHeight = Math.round(state.heightMm * PX_PER_MM);
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("renderCadPdf: no 2D context");
  drawCad(ctx, state, { zoom: PX_PER_MM });
  const pngBlob = await canvas.convertToBlob({ type: "image/png" });
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  // Build the PDF. Same byte-level approach as `comic-export.ts`'s
  // `buildPdfBytes` — kept inline here so this module is standalone +
  // future tweaks can diverge without shared-helper coupling.
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  function write(text: string | Uint8Array): void {
    const bytes = typeof text === "string" ? asciiBytes(text) : text;
    chunks.push(bytes);
    cursor += bytes.length;
  }
  function startObj(id: number): void {
    offsets[id] = cursor;
    write(`${id} 0 obj\n`);
  }
  function endObj(): void {
    write("endobj\n");
  }

  // Object id plan: 1=catalog, 2=pages tree, 3=page, 4=content, 5=image.
  write("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  startObj(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  startObj(2);
  write("<< /Type /Pages /Count 1 /Kids [3 0 R] >>\n");
  endObj();

  startObj(3);
  write(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(pageWidthPt)} ${formatPdfNumber(pageHeightPt)}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>\n`,
  );
  endObj();

  const stream = asciiBytes(
    `q\n${formatPdfNumber(pageWidthPt)} 0 0 ${formatPdfNumber(pageHeightPt)} 0 0 cm\n/Im1 Do\nQ\n`,
  );
  startObj(4);
  write(`<< /Length ${stream.length} >>\nstream\n`);
  write(stream);
  write("\nendstream\n");
  endObj();

  // PNG IDAT pass-through via FlateDecode — same trick the comic
  // exporter uses.
  const ihdr = parsePngIhdr(pngBytes);
  startObj(5);
  write(
    `<< /Type /XObject /Subtype /Image /Width ${ihdr.width} /Height ${ihdr.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${ihdr.width} >> /Length ${ihdr.idatBytes.length} >>\nstream\n`,
  );
  write(ihdr.idatBytes);
  write("\nendstream\n");
  endObj();

  // xref
  const xrefStart = cursor;
  write(`xref\n0 6\n`);
  write("0000000000 65535 f \n");
  for (let id = 1; id <= 5; id++) {
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // Concat
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function formatPdfNumber(n: number): string {
  return n.toFixed(4);
}

function parsePngIhdr(png: Uint8Array): { width: number; height: number; idatBytes: Uint8Array } {
  if (png[0] !== 0x89 || png[1] !== 0x50) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  const idatChunks: Uint8Array[] = [];
  let cursor = 8;
  while (cursor < png.length) {
    const length =
      (png[cursor] << 24) | (png[cursor + 1] << 16) | (png[cursor + 2] << 8) | png[cursor + 3];
    const type = String.fromCharCode(png[cursor + 4], png[cursor + 5], png[cursor + 6], png[cursor + 7]);
    const dataStart = cursor + 8;
    if (type === "IHDR") {
      width = (png[dataStart] << 24) | (png[dataStart + 1] << 16) | (png[dataStart + 2] << 8) | png[dataStart + 3];
      height =
        (png[dataStart + 4] << 24) | (png[dataStart + 5] << 16) | (png[dataStart + 6] << 8) | png[dataStart + 7];
    } else if (type === "IDAT") {
      idatChunks.push(png.slice(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    cursor = dataStart + length + 4;
  }
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
