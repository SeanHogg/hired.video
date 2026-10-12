/**
 * Tests for the wire validation schemas exposed by routes/extension.ts.
 *
 * The Zod schema is the contract between the extension client (a JS
 * batcher in extension-telemetry.js) and the server. Tests pin:
 *   • sessionId must be a UUID
 *   • extension whitelist (jobseeker / recruiter)
 *   • event kind whitelist
 *   • per-event url/host length caps
 *   • event batch size cap (max 200)
 *   • empty-events array rejected (a batch of zero is a client bug)
 *
 * Run: node --import tsx --test src/routes/__tests__/extension-route-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BatchSchema } from "../extension.js";
import { EVENT_KINDS } from "../../services/extension/ingest.js";

const validBatch = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  extension: "jobseeker" as const,
  version: "3.8",
  events: [{ kind: "page_view" as const, url: "https://example.com" }],
};

describe("BatchSchema validation", () => {
  it("accepts a minimal valid batch", () => {
    const r = BatchSchema.safeParse(validBatch);
    assert.equal(r.success, true);
  });

  it("rejects when sessionId is not a UUID", () => {
    const r = BatchSchema.safeParse({ ...validBatch, sessionId: "not-a-uuid" });
    assert.equal(r.success, false);
  });

  it("rejects unknown extension values", () => {
    const r = BatchSchema.safeParse({ ...validBatch, extension: "bogus" });
    assert.equal(r.success, false);
  });

  it("accepts both jobseeker and recruiter", () => {
    assert.equal(BatchSchema.safeParse({ ...validBatch, extension: "jobseeker" }).success, true);
    assert.equal(BatchSchema.safeParse({ ...validBatch, extension: "recruiter" }).success, true);
  });

  it("rejects unknown event kinds", () => {
    const r = BatchSchema.safeParse({
      ...validBatch,
      events: [{ kind: "rogue_kind" }],
    });
    assert.equal(r.success, false);
  });

  it("accepts every published event kind", () => {
    for (const kind of EVENT_KINDS) {
      const r = BatchSchema.safeParse({ ...validBatch, events: [{ kind }] });
      assert.equal(r.success, true, `kind ${kind} should validate`);
    }
  });

  it("rejects empty events arrays (zero-event batch is a client bug)", () => {
    const r = BatchSchema.safeParse({ ...validBatch, events: [] });
    assert.equal(r.success, false);
  });

  it("rejects batches larger than 200 events", () => {
    const events = Array(201).fill({ kind: "page_view" as const });
    const r = BatchSchema.safeParse({ ...validBatch, events });
    assert.equal(r.success, false);
  });

  it("accepts a 200-event batch (boundary)", () => {
    const events = Array(200).fill({ kind: "page_view" as const });
    const r = BatchSchema.safeParse({ ...validBatch, events });
    assert.equal(r.success, true);
  });

  it("caps url length at 2048", () => {
    const longUrl = "https://x.com/" + "a".repeat(2100);
    const r = BatchSchema.safeParse({
      ...validBatch,
      events: [{ kind: "page_view" as const, url: longUrl }],
    });
    assert.equal(r.success, false);
  });

  it("accepts events without optional url/host/payload/ts", () => {
    const r = BatchSchema.safeParse({
      ...validBatch,
      events: [{ kind: "manual" }],
    });
    assert.equal(r.success, true);
  });

  it("accepts an arbitrary record payload (forward-compat by design)", () => {
    const r = BatchSchema.safeParse({
      ...validBatch,
      events: [{
        kind: "picker_capture",
        payload: { fields: { title: { value: "Eng", selector: "h1" } }, source: "manual" },
      }],
    });
    assert.equal(r.success, true);
  });

  it("rejects payload that's not an object", () => {
    const r = BatchSchema.safeParse({
      ...validBatch,
      events: [{ kind: "manual", payload: "string-payload" }],
    });
    assert.equal(r.success, false);
  });
});
