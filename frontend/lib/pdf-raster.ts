/**
 * PDF → page images, in the browser.
 *
 * A scanned résumé is a PDF with no text layer, so `extractTextFromPdf`
 * legitimately returns "" and the server's extractor has nothing to read
 * either — the upload used to dead-end on a 422 ("may be a scanned image").
 * Rendering the pages here turns that file into exactly the input the server
 * already handles well: images, which route to vision OCR.
 *
 * Browser-only on purpose: pdf.js can rasterise with a canvas here, while the
 * Workers runtime has no canvas at all. Pure of React/services so it can be
 * reused by any upload surface (and unit-tested with a stubbed pdfjs).
 */

/** Pages rendered at most. A résumé is 1–3 pages; the cap keeps a mistakenly
 *  uploaded 200-page PDF from melting the tab (and the OCR budget). */
export const PDF_RASTER_MAX_PAGES = 5;

/** Target width in CSS pixels. Large enough for OCR to read 9pt body text,
 *  small enough to keep each PNG a couple hundred KB. */
const TARGET_WIDTH = 1600;

/** Safety valve for the whole batch — a vision call per page is not free. */
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

export function isPdfFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Render the first {@link PDF_RASTER_MAX_PAGES} pages of a PDF to PNG files,
 * named `<stem>-p1.png`, `<stem>-p2.png`, … so the server joins the OCR
 * transcripts in page order.
 *
 * Never throws: any failure (pdf.js unavailable, no canvas, OOM on a phone)
 * resolves to `[]` so the caller falls back to uploading the raw file.
 */
export async function rasterizePdfToImages(file: File): Promise<File[]> {
  if (typeof document === "undefined") return [];
  try {
    const pdfjs = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    }

    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pageCount = Math.min(doc.numPages, PDF_RASTER_MAX_PAGES);
    const stem = file.name.replace(/\.pdf$/i, "") || "resume";
    const images: File[] = [];
    let totalBytes = 0;

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return [];
      // White ground: a transparent PNG of dark glyphs reads as a black page
      // in some vision pipelines.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;
      const blob = await canvasToPngBlob(canvas);
      // Free the backing store before the next page — phones are tight on memory.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) continue;

      totalBytes += blob.size;
      if (totalBytes > MAX_TOTAL_BYTES) break;
      images.push(new File([blob], `${stem}-p${i}.png`, { type: "image/png" }));
    }

    return images;
  } catch (err) {
    console.warn("PDF rasterization failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
