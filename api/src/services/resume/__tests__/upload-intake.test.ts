/**
 * extractUploadedResumeFiles tests — the single intake both upload routes
 * (/api/resumes/parse, /createfromfile) now share.
 *
 * Covers the happy paths (JSON Resume short-circuit, a text document, a
 * rasterised multi-page scan), the boundaries (page order, a page whose OCR
 * comes back empty, the 20-char floor), and the exceptions (OCR throwing, an
 * unsupported type, no files at all). The scan fixtures mirror what the
 * browser actually uploads for a scanned PDF: `<stem>-p1.png`, `-p2.png`, …
 * (see frontend/lib/pdf-raster.ts), which is the case that used to dead-end on
 * a 422 "may be a scanned image".
 *
 * Run: node --import tsx --test src/services/resume/__tests__/upload-intake.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyResumeText, extractUploadedResumeFiles, isResumeImageFile } from "../uploadIntake.js";

const PAGE_ONE =
  "JESS RIVERA\nSenior Product Designer — Toronto\nEXPERIENCE\nAcme Health, 2021–present";
const PAGE_TWO = "EDUCATION\nBSc Design, University of Toronto, 2017\nSKILLS\nFigma, Research";

function textFile(name: string, body: string, type = "text/plain"): File {
  return new File([body], name, { type });
}

function pngFile(name: string): File {
  // Content is irrelevant — the OCR port is injected in these tests.
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

/** An OCR port that returns a canned transcript per filename. */
function ocrFrom(pages: Record<string, string>) {
  const seen: string[] = [];
  return {
    seen,
    deps: {
      ocrImage: async (file: File) => {
        seen.push(file.name);
        return pages[file.name] ?? "";
      },
    },
  };
}

describe("extractUploadedResumeFiles — happy paths", () => {
  it("short-circuits a JSON Resume export to structured content (no OCR, no AI)", async () => {
    const resume = { basics: { name: "Jess Rivera" }, work: [{ name: "Acme", position: "Design" }] };
    const ocr = ocrFrom({});
    const result = await extractUploadedResumeFiles(
      [textFile("resume.json", JSON.stringify(resume), "application/json")],
      ocr.deps,
    );
    assert.equal(result.kind, "structured");
    assert.deepEqual(
      (result as { kind: "structured"; content: Record<string, unknown> }).content.basics,
      { name: "Jess Rivera" },
    );
    assert.deepEqual(ocr.seen, []);
  });

  it("reads a plain-text résumé through the shared extractor", async () => {
    const result = await extractUploadedResumeFiles([textFile("resume.txt", PAGE_ONE)], ocrFrom({}).deps);
    assert.equal(result.kind, "text");
    assert.match((result as { kind: "text"; text: string }).text, /Senior Product Designer/);
  });

  it("joins a rasterised scan's pages in upload order (the scanned-PDF path)", async () => {
    const ocr = ocrFrom({ "resume-p1.png": PAGE_ONE, "resume-p2.png": PAGE_TWO });
    const result = await extractUploadedResumeFiles(
      [pngFile("resume-p1.png"), pngFile("resume-p2.png")],
      ocr.deps,
    );
    assert.equal(result.kind, "text");
    const text = (result as { kind: "text"; text: string }).text;
    assert.ok(text.indexOf("JESS RIVERA") < text.indexOf("EDUCATION"), "page order preserved");
    assert.deepEqual(ocr.seen, ["resume-p1.png", "resume-p2.png"]);
  });
});

describe("extractUploadedResumeFiles — boundaries", () => {
  it("keeps the document when only ONE page of a scan fails to transcribe", async () => {
    const ocr = ocrFrom({ "resume-p1.png": PAGE_ONE, "resume-p2.png": "" });
    const result = await extractUploadedResumeFiles(
      [pngFile("resume-p1.png"), pngFile("resume-p2.png")],
      ocr.deps,
    );
    assert.equal(result.kind, "text");
    assert.match((result as { kind: "text"; text: string }).text, /JESS RIVERA/);
  });

  it("rejects a transcript under the 20-character floor as unreadable", async () => {
    const result = await extractUploadedResumeFiles(
      [pngFile("resume-p1.png")],
      ocrFrom({ "resume-p1.png": "Jess" }).deps,
    );
    assert.equal(result.kind, "error");
    assert.match((result as { kind: "error"; message: string }).message, /clearer, well-lit photo/);
  });

  it("skips zero-byte entries rather than treating them as pages", async () => {
    const empty = new File([], "resume-p2.png", { type: "image/png" });
    const ocr = ocrFrom({ "resume-p1.png": PAGE_ONE });
    const result = await extractUploadedResumeFiles([pngFile("resume-p1.png"), empty], ocr.deps);
    assert.equal(result.kind, "text");
    assert.deepEqual(ocr.seen, ["resume-p1.png"]);
  });
});

describe("extractUploadedResumeFiles — exceptions", () => {
  it("reports the image message when the vision call throws (no provider configured)", async () => {
    const result = await extractUploadedResumeFiles([pngFile("resume-p1.png")], {
      ocrImage: async () => {
        throw new Error("No AI provider available for image OCR");
      },
    });
    assert.equal(result.kind, "error");
    assert.match((result as { kind: "error"; message: string }).message, /clearer, well-lit photo/);
  });

  it("rethrows AbortError instead of turning a closed tab into an OCR failure", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    await assert.rejects(
      () =>
        extractUploadedResumeFiles([pngFile("resume-p1.png")], {
          ocrImage: async () => {
            throw abort;
          },
        }),
      (err: unknown) => err instanceof Error && err.name === "AbortError",
    );
  });

  it("errors with the extractor's user-facing message on an unsupported type", async () => {
    const doc = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "resume.doc", {
      type: "application/msword",
    });
    const result = await extractUploadedResumeFiles([doc], ocrFrom({}).deps);
    assert.equal(result.kind, "error");
    assert.match((result as { kind: "error"; message: string }).message, /isn't supported/);
  });

  it("errors when no usable file was uploaded", async () => {
    const result = await extractUploadedResumeFiles([], ocrFrom({}).deps);
    assert.equal(result.kind, "error");
  });
});

describe("isResumeImageFile", () => {
  it("matches by MIME type and by extension, including a rasterised page", () => {
    assert.equal(isResumeImageFile({ type: "image/png", name: "scan" }), true);
    assert.equal(isResumeImageFile({ type: "", name: "resume-p1.PNG" }), true);
    assert.equal(isResumeImageFile({ type: "", name: "resume.heic" }), true);
    assert.equal(isResumeImageFile({ type: "application/pdf", name: "resume.pdf" }), false);
  });
});

describe("extractUploadedResumeFiles — concurrency + progress", () => {
  it("transcribes pages in parallel, reports each, and still joins them in upload order", async () => {
    const pages = ["resume-p1.png", "resume-p2.png", "resume-p3.png"];
    // Page 1 is the slowest, so completion order is p2, p3, p1.
    const latency: Record<string, number> = { "resume-p1.png": 30, "resume-p2.png": 1, "resume-p3.png": 10 };
    const text: Record<string, string> = {
      "resume-p1.png": PAGE_ONE,
      "resume-p2.png": PAGE_TWO,
      "resume-p3.png": "PROJECTS\nPatient portal redesign, 2022",
    };
    let inFlight = 0;
    let peak = 0;
    const progress: Array<[number, number]> = [];

    const result = await extractUploadedResumeFiles(pages.map(pngFile), {
      ocrImage: async (file) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, latency[file.name]));
        inFlight--;
        return text[file.name];
      },
      onFileRead: (done, total) => progress.push([done, total]),
    });

    assert.equal(result.kind, "text");
    const joined = (result as { text: string }).text;
    assert.ok(joined.indexOf("JESS RIVERA") < joined.indexOf("EDUCATION"), "p1 before p2");
    assert.ok(joined.indexOf("EDUCATION") < joined.indexOf("PROJECTS"), "p2 before p3");
    assert.equal(peak, 3, "all three pages in flight at once");
    assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  });
});

/**
 * classifyResumeText — the post-extraction rule /parse, /createfromfile and
 * /merge/from-file share (#2228). Fixtures mirror what actually arrives: text
 * pdfjs pulled from a real PDF, a hired.video PascalCase JSON export pasted as
 * text, and the raw bytes a failed mobile extraction used to send (a PDF or
 * zip read as text, latin1-decoded image noise).
 */
describe("classifyResumeText", () => {
  it("passes real extracted résumé text through as text", () => {
    const result = classifyResumeText(`${PAGE_ONE}\n\n${PAGE_TWO}`);
    assert.equal(result.kind, "text");
    assert.match((result as { text: string }).text, /JESS RIVERA[\s\S]*EDUCATION/);
  });

  it("strips stray control characters but keeps tabs and newlines", () => {
    const result = classifyResumeText("JESS RIVERA\u0007\nSkills:\tFigma\u000b, Research");
    assert.deepEqual(result, { kind: "text", text: "JESS RIVERA\nSkills:\tFigma, Research" });
  });

  it("short-circuits a pasted JSON Resume export to structured, canonical content", () => {
    const pasted = JSON.stringify({
      Basics: { Name: "Jess Rivera" },
      Work: [{ Name: "Acme Health", Position: "Designer" }],
    });
    const result = classifyResumeText(`  ${pasted}\n`);
    assert.equal(result.kind, "structured");
    assert.ok((result as { content: Record<string, unknown> }).content.basics, "normalised to canonical keys");
  });

  it("treats JSON without any résumé keys as plain text", () => {
    assert.equal(classifyResumeText('{"foo": "bar"}').kind, "text");
  });

  it("flags a raw PDF stream read as text as binary", () => {
    const pdfAsText = "%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>";
    assert.equal(classifyResumeText(pdfAsText).kind, "binary");
  });

  it("flags a DOCX zip read as text as binary", () => {
    assert.equal(classifyResumeText("PK\u0003\u0004\u0014\u0000\u0006\u0000word/document.xml").kind, "binary");
  });

  it("flags control-char-heavy noise (latin1-decoded image bytes) as binary", () => {
    const noise = Array.from({ length: 200 }, (_, i) => String.fromCharCode(i % 2 ? 0x01 : 0x41)).join("");
    assert.equal(classifyResumeText(noise).kind, "binary");
  });

  it("returns empty text (not binary) for an empty string — callers own the emptiness check", () => {
    assert.deepEqual(classifyResumeText(""), { kind: "text", text: "" });
  });
});
