/**
 * Pins the "post" artifact-kind contract that backs the social-feed post
 * analytics (PostStatsSheet → GET /api/analytics/artifacts/post/:id).
 *
 * If any of these drift, the owner-only insights drawer silently stops
 * resolving: the route's z.enum(ARTIFACT_KINDS) would reject "post", or the
 * heatmap axis / owner lookup would mis-key.
 *
 * Run: node --import tsx --test src/services/__tests__/artifact-views-post.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ARTIFACT_KINDS,
  engagementUnitFor,
  isStudioArtifactKind,
} from "../../../../shared/artifact-views.js";

describe("post artifact kind", () => {
  it("is a registered artifact kind (so the analytics route accepts it)", () => {
    assert.ok((ARTIFACT_KINDS as readonly string[]).includes("post"));
  });

  it("is a single-shot '%' impression unit, not a time-based heatmap", () => {
    assert.equal(engagementUnitFor("post"), "%");
  });

  it("is NOT a studio-projects-keyed kind (owner lookup hits feed_posts)", () => {
    assert.equal(isStudioArtifactKind("post"), false);
  });
});
