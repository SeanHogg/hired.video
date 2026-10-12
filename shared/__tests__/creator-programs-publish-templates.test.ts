/**
 * canPublishTemplates (#891): the Templates program gates public studio
 * template listings; the legacy Video flag still counts (no backfill).
 *
 * Run (from api/): node --import tsx --test ../shared/__tests__/creator-programs-publish-templates.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canPublishTemplates } from "../creator-programs.js";

describe("canPublishTemplates", () => {
  it("a templates-only creator can publish", () => {
    assert.equal(canPublishTemplates({ templatesActive: true, videoActive: false }), true);
  });

  it("a video-only creator can still publish (legacy gate, no backfill)", () => {
    assert.equal(canPublishTemplates({ templatesActive: false, videoActive: true }), true);
  });

  it("a creator with neither program cannot", () => {
    assert.equal(canPublishTemplates({ templatesActive: false, videoActive: false }), false);
    assert.equal(canPublishTemplates({ templatesActive: null, videoActive: null }), false);
  });

  it("no enrollment cannot", () => {
    assert.equal(canPublishTemplates(null), false);
    assert.equal(canPublishTemplates(undefined), false);
  });
});
