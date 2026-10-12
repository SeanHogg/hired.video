/**
 * extractResumeTextFromUploads tests — the text-only use case behind
 * POST /api/resumes/extract-text (#2229), which the résumé tools (roast,
 * summarize, skill extractor, sentiment, …) fall back to when the browser
 * can't read a file (pdfjs failing on phones, photos, scanned PDFs).
 *
 * Happy paths (a text document, a rasterised scan, a JSON Resume export
 * rendered back to text), boundaries (OCR only when an image is present, a
 * pasted JSON Resume in a .txt, non-résumé JSON kept verbatim) and exceptions
 * (OCR noise caught by the binary guard, OCR throwing, unsupported type, no
 * files). Fixtures mirror real uploads: `<stem>-p1.png` pages from
 * frontend/lib/pdf-raster.ts and a hired.video PascalCase JSON export.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/upload-text.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractResumeTextFromUploads, uploadsNeedOcr } from "../uploadText.js";

const PAGE_ONE =
  "JESS RIVERA\nSenior Product Designer — Toronto\nEXPERIENCE\nAcme Health, 2021–present\n• Led the patient-portal redesign";
const PAGE_TWO = "EDUCATION\nBSc Design, University of Toronto, 2017\nSKILLS\nFigma, Research, Prototyping";

/** A legacy hired.video export: PascalCase keys, display title at top-level `Name`. */
const PASCAL_EXPORT = {
  Name: "Design résumé 2026",
  Basics: { Name: "Jess Rivera", Label: "Senior Product Designer", Email: "jess@example.com" },
  Work: [
    {
      Name: "Acme Health",
      Position: "Senior Product Designer",
      StartDate: "2021-03",
      Highlights: ["Led the patient-portal redesign", "Cut onboarding drop-off 18%"],
    },
  ],
  Skills: [{ Name: "Design", Keywords: ["Figma", "Research"] }],
};

function textFile(name: string, body: string, type = "text/plain"): File {
  return new File([body], name, { type });
}

function pngFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

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

type Ok = { kind: "text"; text: string };
type Err = { kind: "error"; message: string };

describe("extractResumeTextFromUploads — happy paths", () => {
  it("returns a plain-text résumé verbatim without calling OCR", async () => {
    const ocr = ocrFrom({});
    const result = await extractResumeTextFromUploads([textFile("resume.txt", PAGE_ONE)], ocr.deps);
    assert.equal(result.kind, "text");
    assert.match((result as Ok).text, /Senior Product Designer[\s\S]*patient-portal redesign/);
    assert.deepEqual(ocr.seen, []);
  });

  it("transcribes a rasterised scan and joins its pages in order (the mobile scanned-PDF path)", async () => {
    const ocr = ocrFrom({ "resume-p1.png": PAGE_ONE, "resume-p2.png": PAGE_TWO });
    const result = await extractResumeTextFromUploads([pngFile("resume-p1.png"), pngFile("resume-p2.png")], ocr.deps);
    assert.equal(result.kind, "text");
    const text = (result as Ok).text;
    assert.ok(text.indexOf("JESS RIVERA") < text.indexOf("EDUCATION"), "page order preserved");
    assert.deepEqual(ocr.seen, ["resume-p1.png", "resume-p2.png"]);
  });

  it("renders an uploaded JSON Resume export back to readable text, not JSON", async () => {
    const result = await extractResumeTextFromUploads(
      [textFile("resume.json", JSON.stringify(PASCAL_EXPORT), "application/json")],
      ocrFrom({}).deps,
    );
    assert.equal(result.kind, "text");
    const text = (result as Ok).text;
    assert.match(text, /Jess Rivera/);
    assert.match(text, /Senior Product Designer at Acme Health/);
    assert.match(text, /- Cut onboarding drop-off 18%/);
    assert.doesNotMatch(text, /^\s*\{/, "no raw JSON reaches the tools");
  });
});

describe("extractResumeTextFromUploads — boundaries", () => {
  it("renders a JSON Resume pasted into a .txt file as text (classifier short-circuit)", async () => {
    const result = await extractResumeTextFromUploads(
      [textFile("resume.txt", JSON.stringify(PASCAL_EXPORT))],
      ocrFrom({}).deps,
    );
    assert.equal(result.kind, "text");
    assert.match((result as Ok).text, /Senior Product Designer at Acme Health/);
  });

  it("keeps JSON without résumé keys as the raw text", async () => {
    const raw = JSON.stringify({ notes: "Portfolio links and references available on request." });
    const result = await extractResumeTextFromUploads([textFile("notes.json", raw, "application/json")], ocrFrom({}).deps);
    assert.deepEqual(result, { kind: "text", text: raw });
  });

  it("flags OCR spend only when an image is in the upload", () => {
    assert.equal(uploadsNeedOcr([textFile("resume.txt", PAGE_ONE)]), false);
    assert.equal(uploadsNeedOcr([new File(["%PDF-1.7"], "resume.pdf", { type: "application/pdf" })]), false);
    assert.equal(uploadsNeedOcr([pngFile("resume-p1.png"), pngFile("resume-p2.png")]), true);
    assert.equal(uploadsNeedOcr([new File([new Uint8Array([1, 2])], "IMG_0412.HEIC", { type: "" })]), true);
    assert.equal(uploadsNeedOcr([]), false);
  });
});

describe("extractResumeTextFromUploads — exceptions", () => {
  it("rejects OCR output that is undecoded byte noise via the shared binary guard", async () => {
    const noise = Array.from({ length: 200 }, (_, i) => String.fromCharCode(i % 2 ? 0x01 : 0x41)).join("");
    const result = await extractResumeTextFromUploads([pngFile("resume-p1.png")], ocrFrom({ "resume-p1.png": noise }).deps);
    assert.equal(result.kind, "error");
    assert.match((result as Err).message, /looks like a scan or an unsupported encoding/);
  });

  it("reports the photo message when the vision call throws", async () => {
    const result = await extractResumeTextFromUploads([pngFile("resume-p1.png")], {
      ocrImage: async () => {
        throw new Error("No AI provider available for image OCR");
      },
    });
    assert.equal(result.kind, "error");
    assert.match((result as Err).message, /clearer, well-lit photo/);
  });

  it("errors with the user-facing message on a legacy .doc upload", async () => {
    const doc = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "resume.doc", { type: "application/msword" });
    const result = await extractResumeTextFromUploads([doc], ocrFrom({}).deps);
    assert.equal(result.kind, "error");
    assert.match((result as Err).message, /isn't supported/);
  });

  it("errors when nothing usable was uploaded", async () => {
    const result = await extractResumeTextFromUploads([new File([], "resume.pdf", { type: "application/pdf" })], ocrFrom({}).deps);
    assert.equal(result.kind, "error");
  });
});
