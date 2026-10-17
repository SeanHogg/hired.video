/**
 * Unit tests for the pure `preserveMetaData` helper in routes/resumes.ts.
 *
 * The legacy `rowToSummary` shape tests that used to live here have moved
 * to resume-serializers.test.ts under the new clean `rowToResumeSummary`
 * contract (no more PascalCase wire field names).
 *
 * Run: node --import tsx --test src/routes/__tests__/resumes.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { preserveMetaData } from "../../services/resume/content.js";

describe("preserveMetaData", () => {
  const existingMetaData = [
    { id: "m1", metaType: 1, url: "https://example.com/video.mp4" },
  ];

  it("carries existing metaData forward when caller omits it", () => {
    const next = { basics: { summary: "updated" } };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, existingMetaData);
    assert.deepEqual((merged.basics as any).summary, "updated");
  });

  it("respects an explicit metaData from the caller", () => {
    const overrideMedia = [{ id: "m2", metaType: 2, url: "new.png" }];
    const next = { basics: { summary: "x" }, metaData: overrideMedia };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, overrideMedia);
  });

  it("respects an explicit empty metaData array (intentional clear)", () => {
    const next = { basics: { summary: "x" }, metaData: [] };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, []);
  });

  it("returns content unchanged when there is no existing metaData", () => {
    const next = { basics: { summary: "x" } };
    const merged = preserveMetaData(next, undefined);
    assert.equal(merged, next);
  });

  it("passes through non-object content verbatim", () => {
    assert.equal(preserveMetaData(null, existingMetaData), null);
    assert.equal(preserveMetaData(undefined, existingMetaData), undefined);
    assert.equal(preserveMetaData("raw pdf text", existingMetaData), "raw pdf text");
  });

  it("does not mutate the incoming content object", () => {
    const next = { basics: { summary: "x" } };
    preserveMetaData(next, existingMetaData);
    assert.equal((next as Record<string, unknown>).metaData, undefined);
  });
});
