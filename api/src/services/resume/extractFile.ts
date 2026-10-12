/**
 * Server-side résumé file → plain text extraction (Cloudflare Workers safe).
 *
 * Used by the web/mobile resume upload routes (/api/resumes/parse,
 * /createfromfile) and the partner SDK `file` upload path, so every surface
 * reads the ORIGINAL PDF/DOCX bytes the same way.
 *
 *   - PDF  → `extractPdfText` (utils/pdf-extract: unpdf/pdf.js + fallback).
 *   - DOCX → `fflate` unzip of `word/document.xml`, tags stripped.
 *   - text/JSON → decoded as-is.
 *   - legacy .doc (OLE), images, other binaries → UNSUPPORTED_MEDIA_TYPE.
 *
 * Pure of DB/AI; safe to unit-test.
 */
import { unzipSync, strFromU8 } from "fflate";
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

function looksLikePdf(bytes: Uint8Array, contentType?: string): boolean {
  if (contentType && /pdf/i.test(contentType)) return true;
  return new TextDecoder("latin1").decode(bytes.subarray(0, 5)).startsWith(PDF_MAGIC);
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
