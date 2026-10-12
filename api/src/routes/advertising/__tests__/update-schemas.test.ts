/**
 * PUT /api/advertising/ads/:id and /ad-sets/:id must not reset fields the
 * client omitted. Zod 4 applies `.default()` inside `.partial()`, so the
 * update schemas are built from default-free bases (schemas.ts).
 *
 * Run: node --import tsx --test src/routes/advertising/__tests__/update-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CreateAdSchema,
  CreateAdSetSchema,
  CreateCampaignSchema,
  UpdateAdSchema,
  UpdateAdSetSchema,
  UpdateCampaignSchema,
  definedOnly,
} from "../schemas.js";

describe("update schemas leave omitted fields alone", () => {
  it("PUT /ads/:id with only a headline does not set ctaText", () => {
    const parsed = UpdateAdSchema.parse({ headline: "Hiring senior TypeScript engineers" });
    assert.deepEqual(definedOnly(parsed), { headline: "Hiring senior TypeScript engineers" });
    assert.equal("ctaText" in definedOnly(parsed), false);
  });

  it("PUT /ad-sets/:id with only a name does not set placementType / pricingModel / bidStrategy / targeting", () => {
    const patch = definedOnly(UpdateAdSetSchema.parse({ name: "Retarget — applicants" }));
    assert.deepEqual(patch, { name: "Retarget — applicants" });
  });

  it("PUT /campaigns/:id with only notes does not reset the objective", () => {
    assert.deepEqual(definedOnly(UpdateCampaignSchema.parse({ notes: "Q4 push" })), { notes: "Q4 push" });
  });

  it("an explicit value on update is kept", () => {
    assert.equal(UpdateAdSchema.parse({ ctaText: "Learn More" }).ctaText, "Learn More");
    assert.equal(UpdateAdSetSchema.parse({ bidStrategy: "target_cpa" }).bidStrategy, "target_cpa");
  });

  it("an invalid enum on update is still rejected", () => {
    assert.equal(UpdateAdSchema.safeParse({ ctaText: "Buy now!!" }).success, false);
    assert.equal(UpdateAdSetSchema.safeParse({ pricingModel: "auction" }).success, false);
  });
});

describe("create schemas keep their defaults", () => {
  it("ads default ctaText to Apply Now", () => {
    assert.equal(CreateAdSchema.parse({ name: "Ad A", headline: "We're hiring" }).ctaText, "Apply Now");
  });

  it("ad sets default placement / pricing / bid strategy", () => {
    const p = CreateAdSetSchema.parse({ name: "Prospecting" });
    assert.equal(p.placementType, "search_top");
    assert.equal(p.pricingModel, "cpc");
    assert.equal(p.bidStrategy, "manual");
    assert.equal(p.targetingJson, undefined);
  });

  it("campaigns default the objective to TRAFFIC", () => {
    assert.equal(CreateCampaignSchema.parse({ name: "Fall hiring" }).objective, "TRAFFIC");
  });
});
