/**
 * analyzeMergeFromFile — the use case behind POST /api/resumes/merge/from-file
 * (#2390). Happy paths (a stored target + a text upload parsed by AI, a photo
 * transcribed by OCR, a pre-parsed JSON Resume skipping AI), boundaries
 * (inline target content, `useAI: false` never hands the LLM to the analysis)
 * and exceptions (unknown / foreign target id fails before any OCR, OCR byte
 * noise caught by the shared binary guard). Fixtures mirror real data: a
 * stored master row shaped like `resumes`, and `<stem>-p1.png` scan pages.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/merge-from-file.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeMergeFromFile, type MergeFromFileDeps, type MergeFromFileInput } from "../mergeFromFile.js";
import type { LLMClient } from "../../adapters/llm-client.js";

const OWNER = "00000000-0000-4000-8000-000000000101";
const OTHER = "00000000-0000-4000-8000-000000000202";
const MASTER = "11111111-0000-4000-8000-000000000001";

const TARGET_CONTENT = {
  basics: { name: "Jess Rivera", label: "Senior Product Designer", email: "jess@example.com" },
  work: [{ name: "Acme Health", position: "Senior Product Designer", startDate: "2021-03", highlights: ["Led the patient-portal redesign"] }],
  skills: [{ name: "Design", keywords: ["Figma"] }],
};

const UPLOAD_TEXT =
  "JESS RIVERA\nSenior Product Designer — Toronto\nEXPERIENCE\nNorthwind Clinics, 2018–2021\n• Shipped the booking flow used by 40 clinics";

const PARSED_UPLOAD = {
  basics: { name: "Jess Rivera", label: "Senior Product Designer" },
  work: [{ name: "Northwind Clinics", position: "Product Designer", startDate: "2018-01", endDate: "2021-02", highlights: ["Shipped the booking flow used by 40 clinics"] }],
  education: [{ institution: "University of Toronto", studyType: "BSc", area: "Design" }],
};

function storedRow(userId: string) {
  return { id: MASTER, userId, title: "Design résumé 2026", content: TARGET_CONTENT, isMaster: true };
}

interface Recorder {
  ocr: string[];
  parsed: string[];
  lookups: Array<[string, string]>;
}

function deps(over: Partial<MergeFromFileDeps> = {}, ocrText = UPLOAD_TEXT): { deps: MergeFromFileDeps; rec: Recorder } {
  const rec: Recorder = { ocr: [], parsed: [], lookups: [] };
  const rows = [storedRow(OWNER)];
  return {
    rec,
    deps: {
      resumes: {
        findByIdForOwner: async (id: string, ownerId: string) => {
          rec.lookups.push([id, ownerId]);
          return (rows.find((r) => r.id === id && r.userId === ownerId) ?? null) as never;
        },
      },
      ocrImage: async (file) => {
        rec.ocr.push(file.name);
        return ocrText;
      },
      parseText: async (text) => {
        rec.parsed.push(text);
        return PARSED_UPLOAD;
      },
      llm: null,
      ...over,
    },
  };
}

const textFile = (name: string, body: string) => new File([body], name, { type: "text/plain" });
const pngFile = (name: string) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });

function input(source: MergeFromFileInput["source"], over: Partial<MergeFromFileInput> = {}): MergeFromFileInput {
  return { source, targetResumeId: MASTER, useAI: true, ...over };
}

describe("analyzeMergeFromFile", () => {
  it("parses a text upload with AI and analyses it against the stored target", async () => {
    const { deps: d, rec } = deps();
    const out = await analyzeMergeFromFile(OWNER, input({ kind: "files", files: [textFile("resume.txt", UPLOAD_TEXT)] }), d);
    assert.ok("result" in out);
    assert.deepEqual(rec.lookups, [[MASTER, OWNER]]);
    assert.equal(rec.ocr.length, 0);
    assert.equal(rec.parsed.length, 1);
    assert.match(rec.parsed[0], /Northwind Clinics/);
    assert.deepEqual(out.result.parsedContent, PARSED_UPLOAD);
    assert.equal(out.result.parseConfidence, 0.8);
    assert.equal((out.result.targetContent.basics as { name: string }).name, "Jess Rivera");
    assert.ok(out.result.analysis.summary.totalSections >= 1);
  });

  it("transcribes a photographed page through the OCR port", async () => {
    const { deps: d, rec } = deps();
    const out = await analyzeMergeFromFile(OWNER, input({ kind: "files", files: [pngFile("resume-p1.png")] }), d);
    assert.ok("result" in out);
    assert.deepEqual(rec.ocr, ["resume-p1.png"]);
    assert.equal(rec.parsed.length, 1);
  });

  it("uses pre-parsed content as-is (confidence 1, no AI parse)", async () => {
    const { deps: d, rec } = deps();
    const out = await analyzeMergeFromFile(OWNER, input({ kind: "parsed", content: PARSED_UPLOAD }), d);
    assert.ok("result" in out);
    assert.equal(out.result.parseConfidence, 1);
    assert.equal(rec.parsed.length, 0);
  });

  it("accepts inline target content without reading the repository", async () => {
    const { deps: d, rec } = deps();
    const out = await analyzeMergeFromFile(
      OWNER,
      input({ kind: "text", text: UPLOAD_TEXT }, { targetResumeId: undefined, targetContent: TARGET_CONTENT }),
      d,
    );
    assert.ok("result" in out);
    assert.equal(rec.lookups.length, 0);
  });

  it("never hands the LLM to the analysis when useAI is false", async () => {
    let llmUsed = false;
    const llm = new Proxy({}, { get: () => { llmUsed = true; return () => { throw new Error("LLM must not be called"); }; } }) as LLMClient;
    const { deps: d } = deps({ llm });
    const out = await analyzeMergeFromFile(OWNER, input({ kind: "parsed", content: PARSED_UPLOAD }, { useAI: false }), d);
    assert.ok("result" in out);
    assert.equal(llmUsed, false);
  });

  it("returns NOT_FOUND for another owner's résumé before any OCR spend", async () => {
    const { deps: d, rec } = deps();
    const out = await analyzeMergeFromFile(OTHER, input({ kind: "files", files: [pngFile("resume-p1.png")] }), d);
    assert.ok("error" in out);
    assert.equal(out.error.code, "NOT_FOUND");
    assert.equal(rec.ocr.length, 0);
  });

  it("rejects OCR byte noise through the shared binary guard", async () => {
    const noise = Array.from({ length: 200 }, (_, i) => String.fromCharCode(i % 2 ? 0x01 : 0x41)).join("");
    const { deps: d, rec } = deps({}, noise);
    const out = await analyzeMergeFromFile(OWNER, input({ kind: "files", files: [pngFile("resume-p1.png")] }), d);
    assert.ok("error" in out);
    assert.equal(out.error.code, "PARSE_FAILED");
    assert.equal(rec.parsed.length, 0);
  });
});
