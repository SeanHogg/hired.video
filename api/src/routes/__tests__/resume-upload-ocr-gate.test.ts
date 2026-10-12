/**
 * gateUploadOcr — the ONE `resume_parse` gate + meter for vision OCR on résumé
 * uploads (#2390), used by /extract-text, /merge/from-file and
 * /createfromfile. A free user over the monthly cap is refused before any OCR
 * spend; an allowed OCR upload records exactly one `resume_parse` event (after
 * success); a plain document upload is free (no gate read, no meter).
 *
 * The composed case mirrors mergeFromFileHandler: gate → use case → meter.
 *
 * Run: node --import tsx --test src/routes/__tests__/resume-upload-ocr-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { gateUploadOcr, type UploadOcrProcessor } from "../resume-upload-ocr-gate.js";
import { analyzeMergeFromFile } from "../../services/resume/mergeFromFile.js";

const ctx = { var: { user: { sub: "00000000-0000-4000-8000-000000000101", role: "job_seeker" } } } as unknown as Context<AppEnv>;

const pngPage = (n: number) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `resume-p${n}.png`, { type: "image/png" });
const pdf = () => new File(["%PDF-1.7"], "Jess_Rivera_Resume.pdf", { type: "application/pdf" });

/** The 402 envelope servicesProcessor.enforce returns for a Free user at cap. */
function overCapResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "ENTITLEMENT_EXCEEDED", message: "Resume parses limited to 5 on the Free plan", cap: 5, consumed: 5, eventType: "resume_parse" },
    }),
    { status: 402, headers: { "Content-Type": "application/json" } },
  );
}

function processor(overCap: boolean) {
  const calls = { enforce: [] as string[], meter: [] as Array<{ eventType: string; metadata?: Record<string, unknown> }> };
  const p: UploadOcrProcessor = {
    enforce: async (_c, eventType) => {
      calls.enforce.push(eventType);
      return overCap ? overCapResponse() : null;
    },
    meterEvent: (_c, eventType, metadata) => {
      calls.meter.push({ eventType, metadata });
    },
  };
  return { p, calls };
}

describe("gateUploadOcr", () => {
  it("refuses a free user over the resume_parse cap when the upload needs OCR", async () => {
    const { p, calls } = processor(true);
    const gate = await gateUploadOcr(ctx, [pngPage(1), pngPage(2)], "merge_from_file", p);
    assert.ok(gate.blocked);
    assert.equal(gate.blocked.status, 402);
    const body = (await gate.blocked.json()) as { error: { code: string } };
    assert.equal(body.error.code, "ENTITLEMENT_EXCEEDED");
    gate.meter();
    assert.deepEqual(calls.enforce, ["resume_parse"]);
    assert.equal(calls.meter.length, 0);
  });

  it("meters one resume_parse event with its source when an allowed OCR upload succeeds", async () => {
    const { p, calls } = processor(false);
    const gate = await gateUploadOcr(ctx, [pngPage(1), pngPage(2)], "createfromfile", p);
    assert.equal(gate.blocked, null);
    assert.equal(gate.needsOcr, true);
    gate.meter();
    gate.meter();
    assert.deepEqual(calls.meter, [{ eventType: "resume_parse", metadata: { source: "createfromfile" } }]);
  });

  it("lets a document upload through free — no gate read, no meter", async () => {
    const { p, calls } = processor(true);
    const gate = await gateUploadOcr(ctx, [pdf()], "extract_text", p);
    assert.equal(gate.blocked, null);
    assert.equal(gate.needsOcr, false);
    gate.meter();
    assert.equal(calls.enforce.length, 0);
    assert.equal(calls.meter.length, 0);
  });

  it("treats a JSON body (no files) as free", async () => {
    const { p, calls } = processor(true);
    const gate = await gateUploadOcr(ctx, [], "merge_from_file", p);
    assert.equal(gate.blocked, null);
    assert.equal(calls.enforce.length, 0);
  });

  it("composed merge-from-file flow: refused uploads never reach OCR; allowed ones meter after success", async () => {
    const ocrCalls: string[] = [];
    const deps = {
      resumes: { findByIdForOwner: async () => null as never },
      ocrImage: async (f: File) => {
        ocrCalls.push(f.name);
        return "JESS RIVERA\nSenior Product Designer\nEXPERIENCE\nAcme Health, 2021–present";
      },
      parseText: async () => ({ basics: { name: "Jess Rivera" }, work: [{ name: "Acme Health" }], skills: [] }),
      llm: null,
    };
    const target = { targetContent: { basics: { name: "Jess Rivera" }, work: [] }, useAI: false };

    const refused = processor(true);
    const blocked = await gateUploadOcr(ctx, [pngPage(1)], "merge_from_file", refused.p);
    assert.ok(blocked.blocked);
    assert.equal(ocrCalls.length, 0);

    const allowed = processor(false);
    const gate = await gateUploadOcr(ctx, [pngPage(1)], "merge_from_file", allowed.p);
    assert.equal(gate.blocked, null);
    const out = await analyzeMergeFromFile("00000000-0000-4000-8000-000000000101", { source: { kind: "files", files: [pngPage(1)] }, ...target }, deps);
    assert.ok("result" in out);
    gate.meter();
    assert.deepEqual(ocrCalls, ["resume-p1.png"]);
    assert.deepEqual(allowed.calls.meter, [{ eventType: "resume_parse", metadata: { source: "merge_from_file" } }]);
  });
});
