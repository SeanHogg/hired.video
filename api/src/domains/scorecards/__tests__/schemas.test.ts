/**
 * Tests for the Zod input schemas that gate writes into the scorecards
 * bounded context. Pure parse-tests; no DB/HTTP.
 *
 * Run: node --import tsx --test src/domains/scorecards/__tests__/schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AttributeInputSchema,
  CreateDecisionSchema,
  CreateKitSchema,
  CreateSubmissionSchema,
  CreateTemplateSchema,
  RatingInputSchema,
  StageInputSchema,
} from "../schemas.js";
import { SYNTHETIC_V4_UUID as UUID } from "../../../../../shared/__tests__/uuid-fixtures.js";

describe("AttributeInputSchema", () => {
  it("accepts minimal payload — name only, defaults the rest", () => {
    const r = AttributeInputSchema.safeParse({ name: "Communication" });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.weight, 1);
      assert.equal(r.data.displayOrder, 0);
    }
  });

  it("rejects empty name", () => {
    assert.equal(AttributeInputSchema.safeParse({ name: "" }).success, false);
  });

  it("rejects weight outside 1..10", () => {
    assert.equal(
      AttributeInputSchema.safeParse({ name: "x", weight: 0 }).success,
      false,
    );
    assert.equal(
      AttributeInputSchema.safeParse({ name: "x", weight: 11 }).success,
      false,
    );
  });

  it("accepts string-keyed anchors map", () => {
    const r = AttributeInputSchema.safeParse({
      name: "x",
      anchors: { "1": "Below bar", "4": "Strong" },
    });
    assert.equal(r.success, true);
  });
});

describe("CreateTemplateSchema", () => {
  const valid = {
    companyId: UUID,
    name: "Senior Engineer",
    attributes: [{ name: "Communication" }, { name: "Technical depth" }],
  };

  it("accepts minimum required payload (defaults rating scale)", () => {
    const r = CreateTemplateSchema.safeParse(valid);
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.ratingScale, "1-4");
  });

  it("rejects when attributes array is empty", () => {
    assert.equal(
      CreateTemplateSchema.safeParse({ ...valid, attributes: [] }).success,
      false,
    );
  });

  it("rejects more than 20 attributes (cap on rubric size)", () => {
    const bigAttrs = Array.from({ length: 21 }, (_, i) => ({ name: `a${i}` }));
    assert.equal(
      CreateTemplateSchema.safeParse({ ...valid, attributes: bigAttrs }).success,
      false,
    );
  });

  it("rejects non-UUID companyId", () => {
    assert.equal(
      CreateTemplateSchema.safeParse({ ...valid, companyId: "not-a-uuid" }).success,
      false,
    );
  });

  // Regression for gap #1522: seed migrations cast `md5(slug)` to UUID,
  // producing strings with non-RFC-4122 version/variant bits. The shared
  // `UuidLikeSchema` must accept them — runtime lookup only cares about
  // the 8-4-4-4-12 hex shape, not the bit fields.
  it("accepts md5-seed-derived UUID for companyId (non-RFC variant)", () => {
    const seedUuid = "c87f7656-673a-7756-d100-281032a50731"; // version=7, variant=d
    const r = CreateTemplateSchema.safeParse({ ...valid, companyId: seedUuid });
    assert.equal(r.success, true);
  });

  it("accepts a valid rating scale enum value", () => {
    for (const scale of ["1-4", "1-5", "thumbs", "yes-no"] as const) {
      const r = CreateTemplateSchema.safeParse({ ...valid, ratingScale: scale });
      assert.equal(r.success, true, `scale ${scale} should parse`);
    }
  });

  it("rejects an unknown rating scale", () => {
    assert.equal(
      CreateTemplateSchema.safeParse({ ...valid, ratingScale: "0-100" }).success,
      false,
    );
  });
});

describe("StageInputSchema", () => {
  it("defaults durationMinutes to 60 when omitted", () => {
    const r = StageInputSchema.safeParse({ name: "Phone screen" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.durationMinutes, 60);
  });

  it("rejects durationMinutes outside 5..480 (8 hours)", () => {
    assert.equal(
      StageInputSchema.safeParse({ name: "x", durationMinutes: 4 }).success,
      false,
    );
    assert.equal(
      StageInputSchema.safeParse({ name: "x", durationMinutes: 481 }).success,
      false,
    );
  });
});

describe("CreateKitSchema", () => {
  const valid = {
    companyId: UUID,
    name: "SWE Loop",
    stages: [{ name: "Recruiter screen" }],
  };

  it("accepts minimum payload", () => {
    assert.equal(CreateKitSchema.safeParse(valid).success, true);
  });

  it("rejects empty stages array", () => {
    assert.equal(
      CreateKitSchema.safeParse({ ...valid, stages: [] }).success,
      false,
    );
  });

  it("rejects more than 15 stages", () => {
    const bigStages = Array.from({ length: 16 }, (_, i) => ({ name: `s${i}` }));
    assert.equal(
      CreateKitSchema.safeParse({ ...valid, stages: bigStages }).success,
      false,
    );
  });
});

describe("RatingInputSchema", () => {
  it("accepts a numeric rating 0..10", () => {
    assert.equal(RatingInputSchema.safeParse({ attributeId: UUID, rating: 4 }).success, true);
  });

  it("accepts an explicit null rating (deferred / cleared)", () => {
    assert.equal(RatingInputSchema.safeParse({ attributeId: UUID, rating: null }).success, true);
  });

  it("rejects rating > 10", () => {
    assert.equal(RatingInputSchema.safeParse({ attributeId: UUID, rating: 11 }).success, false);
  });
});

describe("CreateSubmissionSchema", () => {
  it("accepts a minimal draft submission (no ratings yet)", () => {
    const r = CreateSubmissionSchema.safeParse({
      templateId: UUID,
      applicationId: "candidate-resume-id",
    });
    assert.equal(r.success, true);
  });

  it("rejects when applicationId is empty", () => {
    assert.equal(
      CreateSubmissionSchema.safeParse({ templateId: UUID, applicationId: "" }).success,
      false,
    );
  });

  it("accepts an enum recommendation", () => {
    const r = CreateSubmissionSchema.safeParse({
      templateId: UUID,
      applicationId: "x",
      overallRecommendation: "strong_yes",
    });
    assert.equal(r.success, true);
  });

  it("rejects unknown recommendation values", () => {
    assert.equal(
      CreateSubmissionSchema.safeParse({
        templateId: UUID,
        applicationId: "x",
        overallRecommendation: "maybe",
      }).success,
      false,
    );
  });
});

describe("CreateDecisionSchema", () => {
  it("accepts each of approve/reject/hold/withdraw", () => {
    for (const decision of ["approve", "reject", "hold", "withdraw"] as const) {
      const r = CreateDecisionSchema.safeParse({
        companyId: UUID,
        applicationId: "x",
        decision,
      });
      assert.equal(r.success, true, `decision ${decision} should parse`);
    }
  });

  it("rejects unknown decisions", () => {
    assert.equal(
      CreateDecisionSchema.safeParse({
        companyId: UUID,
        applicationId: "x",
        decision: "maybe",
      }).success,
      false,
    );
  });
});
