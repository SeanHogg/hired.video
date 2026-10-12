/**
 * Resume upload intake — ONE place that turns the file(s) a client uploaded
 * into either structured JSON Resume content or plain text.
 *
 * Every upload surface (`POST /api/resumes/parse`, `POST /api/resumes/createfromfile`,
 * `POST /api/resumes/merge/from-file`, `POST /api/resumes/extract-text` via uploadText.ts)
 * goes through this so the routing rules — JSON Resume wins, images go to
 * vision OCR, PDF/DOCX/text go to the Workers-safe extractor — live once
 * instead of being re-implemented per route.
 *
 * Multi-file is first class: a scanned PDF has no text layer, so the browser
 * rasterises its pages to images (lib/pdf-raster.ts) and uploads them as a
 * page sequence. Their OCR transcripts are joined in page order and parsed as
 * one resume.
 *
 * Pure of DB/HTTP. The vision call is injected (`ocrImage`) so this module
 * stays unit-testable and free of the LLM client.
 */
import { extractResumeText } from "./extractFile.js";
import { looksLikeBinaryText, stripResumeControlChars, tryParseJsonResume } from "./parse.js";
import { mapWithConcurrency } from "../../utils/async.js";

export type UploadIntakeResult =
  | { kind: "structured"; content: Record<string, unknown> }
  | { kind: "text"; text: string }
  | { kind: "error"; message: string };

export interface UploadIntakeDeps {
  /** Transcribe one image file to plain text (vision OCR). May throw. */
  ocrImage: (file: File) => Promise<string>;
  /** Called as each file finishes (`done` of `total`), in completion order. */
  onFileRead?: (done: number, total: number) => void;
}

/** Pages transcribed at once — a 10-page scan reads in ~3 vision round-trips, not 10. */
const OCR_CONCURRENCY = 4;

/** User-facing messages for upload extraction failures, keyed by the shared
 *  extractor's codes (its own messages are written for API partners). */
const UPLOAD_EXTRACT_MESSAGES: Record<"UNSUPPORTED_MEDIA_TYPE" | "INVALID_RESUME", string> = {
  UNSUPPORTED_MEDIA_TYPE:
    "That file type isn't supported. Upload a PDF, Word (.docx), text file or photo, or paste the text directly.",
  INVALID_RESUME:
    "Couldn't read text from that file — it may be a scanned image. Upload a photo of it, a Word (.docx) export, or paste the text directly.",
};

const OCR_FAILED_MESSAGE =
  "Couldn't read text from that image. Try a clearer, well-lit photo (JPG or PNG), or upload a PDF / Word file instead.";

/** Shortest transcript we treat as a real resume page rather than a misread. */
const MIN_USABLE_TEXT = 20;

/** Image MIME / extension matcher for resume uploads. Phone users very
 *  commonly photograph their resume or pick a JPG/PNG/HEIC from Photos, and
 *  the browser rasterises scanned PDFs to PNG pages — none of which have a
 *  text layer, so they route to vision OCR. */
const RESUME_IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

export function isResumeImageFile(file: Pick<File, "type" | "name">): boolean {
  if (typeof file.type === "string" && file.type.startsWith("image/")) return true;
  return RESUME_IMAGE_EXT_RE.test(file.name ?? "");
}

function isJsonFile(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/json" || (file.name ?? "").toLowerCase().endsWith(".json");
}

/** PDF / DOCX / text upload → plain text via the shared extractor. */
async function extractDocumentText(
  file: File,
): Promise<{ text: string } | { message: string }> {
  const bytes = await file.arrayBuffer().catch(() => null);
  if (!bytes) return { message: UPLOAD_EXTRACT_MESSAGES.INVALID_RESUME };
  const result = await extractResumeText(new Uint8Array(bytes), {
    contentType: file.type,
    filename: file.name,
  });
  if ("code" in result) {
    console.warn("[resume upload] extraction failed:", result.code, result.message);
    return { message: UPLOAD_EXTRACT_MESSAGES[result.code] };
  }
  return { text: result.text };
}

type FileRead = ({ text: string } | { message: string }) & { image: boolean };

/** One upload → its text: vision OCR for an image, the shared extractor for a document. */
async function readOneFile(file: File, deps: UploadIntakeDeps): Promise<FileRead> {
  if (!isResumeImageFile(file)) return { ...(await extractDocumentText(file)), image: false };
  // A vision failure (no provider, or a format the vendor rejects such as
  // HEIC) yields no text for that page; the length guard in the caller
  // reports it once rather than failing the whole upload on one bad page.
  try {
    const text = (await deps.ocrImage(file)).trim();
    return text ? { text, image: true } : { message: OCR_FAILED_MESSAGE, image: true };
  } catch (err) {
    console.warn("[resume upload] image OCR failed:", err instanceof Error ? err.message : err);
    return { message: OCR_FAILED_MESSAGE, image: true };
  }
}

/**
 * Turn uploaded resume file(s) into structured content or plain text.
 *
 * A JSON Resume export short-circuits to `structured` (exact, no AI). Images
 * are transcribed with vision OCR; documents go through the Workers-safe
 * extractor. Several files are joined in upload order, so a rasterised
 * multi-page scan reads as one document.
 */
export async function extractUploadedResumeFiles(
  files: readonly File[],
  deps: UploadIntakeDeps,
): Promise<UploadIntakeResult> {
  const usable = files.filter((f): f is File => f instanceof File && f.size > 0);
  if (usable.length === 0) {
    return { kind: "error", message: UPLOAD_EXTRACT_MESSAGES.INVALID_RESUME };
  }

  // JSON Resume export — structure wins over any AI roundtrip. Only the first
  // file is considered: a JSON Resume is a whole document, never a page.
  const [first] = usable;
  if (isJsonFile(first)) {
    const raw = await first.text().catch(() => "");
    const structured = tryParseJsonResume(raw);
    if (structured) return { kind: "structured", content: structured };
    return raw.trim()
      ? { kind: "text", text: raw }
      : { kind: "error", message: UPLOAD_EXTRACT_MESSAGES.INVALID_RESUME };
  }

  // Files are read concurrently; results keep upload order so a rasterised
  // scan's pages still join in sequence.
  let done = 0;
  const reads = await mapWithConcurrency(usable, OCR_CONCURRENCY, async (file) => {
    const read = await readOneFile(file, deps);
    deps.onFileRead?.(++done, usable.length);
    return read;
  });

  const parts = reads.flatMap((r) => ("text" in r ? [r.text] : []));
  const anyImage = reads.some((r) => r.image);
  const lastMessage =
    [...reads].reverse().find((r): r is FileRead & { message: string } => "message" in r)?.message ??
    UPLOAD_EXTRACT_MESSAGES.INVALID_RESUME;

  const text = parts.join("\n\n").trim();
  if (text.length < MIN_USABLE_TEXT) {
    return { kind: "error", message: anyImage ? OCR_FAILED_MESSAGE : lastMessage };
  }
  return { kind: "text", text };
}

/** User-facing message when résumé text is really undecoded bytes. */
export const RESUME_BINARY_TEXT_MESSAGE =
  "Couldn't read that file — it looks like a scan or an unsupported encoding. Try a text-based PDF, a Word (.docx) export, a clear photo (JPG/PNG), or paste the text directly.";

export type ResumeTextSource =
  | { kind: "structured"; content: Record<string, unknown> }
  | { kind: "text"; text: string }
  | { kind: "binary" };

/**
 * Résumé text (client-extracted or from the upload intake) → what the parse
 * step should consume. Binary guard first — undecoded PDF/DOCX/image bytes
 * read as text by a fragile client extractor must never reach the AI parser
 * or JSONB — then control-char cleanup, then a JSON Resume short-circuit
 * (structure beats AI parsing: dates, highlights and grouping survive exactly).
 *
 * Shared by /parse, /createfromfile and /merge/from-file so the rule lives once.
 */
export function classifyResumeText(text: string): ResumeTextSource {
  if (looksLikeBinaryText(text)) return { kind: "binary" };
  const cleaned = stripResumeControlChars(text);
  const structured = tryParseJsonResume(cleaned);
  return structured ? { kind: "structured", content: structured } : { kind: "text", text: cleaned };
}
