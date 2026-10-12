/**
 * Tests for the Zod schemas in `advertising.ts` — schema-test backfill for the
 * PRIORITY slice of gap #1528.
 *
 * Every validator in advertising.ts is an un-exported route-local `const`, so
 * to keep all edits inside `__tests__/` (the route file is intentionally NOT
 * modified to add exports) the schemas are reconstructed here VERBATIM from
 * `api/src/routes/advertising.ts`:
 *
 *   CreateBoostSchema        = z.object({...})   (line 31)
 *   CreateCompanyBoostSchema = z.object({...})   (line 147)
 *   CreateCampaignSchema     = z.object({...})   (line 256)
 *   CreateAdSetSchema        = z.object({...})   (line 313)
 *   CreateAdSchema           = z.object({...})   (line 386)
 *
 * `UuidLikeSchema` (shared/validation.ts) IS exported and imported from the
 * real source of truth. `jobId` / `companyId` are DB-row ids, so the #1522
 * seed-derived-UUID regression is exercised on the boost schemas.
 *
 * Run: node --import tsx --test src/routes/__tests__/advertising-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { UuidLikeSchema } from "../../../../shared/validation.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../shared/__tests__/uuid-fixtures.js";

// Verbatim mirrors of the un-exported schemas in `advertising.ts`. See the
// file header for why they are reconstructed rather than imported.
const CreateBoostSchema = z.object({
  jobId: UuidLikeSchema,
  placementType: z.enum(["search_top", "discovery_feed", "both"]),
  pricingModel: z.enum(["cpm", "cpc"]),
  budgetCents: z.number().int().min(1000),
  durationDays: z.number().int().min(1).max(90),
});

const CreateCompanyBoostSchema = z.object({
  companyId: UuidLikeSchema,
  placementType: z.enum([
    "directory_featured",
    "dashboard_spotlight",
    "discovery_feed",
    "all",
  ]),
  pricingModel: z.enum(["flat", "cpm"]),
  budgetCents: z.number().int().min(1000),
  durationDays: z.number().int().min(1).max(90),
});

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z
    .enum(["AWARENESS", "TRAFFIC", "APPLICATIONS", "EMPLOYER_BRAND"])
    .default("TRAFFIC"),
  budgetCents: z.number().int().min(0).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

const CreateAdSetSchema = z.object({
  name: z.string().min(1).max(120),
  placementType: z
    .enum(["search_top", "discovery_feed", "both", "email", "push"])
    .default("search_top"),
  pricingModel: z.enum(["cpm", "cpc", "auto"]).default("cpc"),
  bidStrategy: z
    .enum(["manual", "maximize_clicks", "maximize_impressions", "target_cpa"])
    .default("manual"),
  bidAmountCents: z.number().int().min(1).optional(),
  budgetCents: z.number().int().min(0).optional(),
  targetingJson: z.record(z.string(), z.unknown()).optional().default({}),
  frequencyCapCount: z.number().int().min(1).max(100).optional(),
  frequencyCapHours: z.number().int().min(1).max(168).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
});

const CreateAdSchema = z.object({
  name: z.string().min(1).max(120),
  headline: z.string().min(1).max(150),
  description: z.string().max(300).optional(),
  ctaText: z
    .enum(["Apply Now", "Learn More", "Watch Our Story", "View Jobs", "Get Started"])
    .default("Apply Now"),
  ctaUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  destinationUrl: z.string().url().optional(),
  variantGroup: z.enum(["A", "B"]).optional(),
});

const validBoost = {
  jobId: V4_UUID,
  placementType: "search_top",
  pricingModel: "cpm",
  budgetCents: 1000,
  durationDays: 30,
} as const;

describe("CreateBoostSchema", () => {
  // Happy path
  it("accepts a valid boost", () => {
    assert.equal(CreateBoostSchema.safeParse(validBoost).success, true);
  });
  it("accepts a seed-derived jobId (gap #1522 regression)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, jobId: SEED_DERIVED_UUID }).success,
      true,
    );
  });

  // Boundary
  it("accepts budgetCents=1000 (min boundary)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, budgetCents: 1000 }).success,
      true,
    );
  });
  it("rejects budgetCents=999 (below min)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, budgetCents: 999 }).success,
      false,
    );
  });
  it("accepts durationDays=1 (min boundary)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, durationDays: 1 }).success,
      true,
    );
  });
  it("accepts durationDays=90 (max boundary)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, durationDays: 90 }).success,
      true,
    );
  });
  it("rejects durationDays=0 (below min)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, durationDays: 0 }).success,
      false,
    );
  });
  it("rejects durationDays=91 (above max)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, durationDays: 91 }).success,
      false,
    );
  });

  // Exception
  it("rejects a missing jobId (required field)", () => {
    const { jobId, ...rest } = validBoost;
    assert.equal(CreateBoostSchema.safeParse(rest).success, false);
  });
  it("rejects a malformed jobId", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, jobId: "bad" }).success,
      false,
    );
  });
  it("rejects an unknown placementType (enum edge)", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, placementType: "sidebar" }).success,
      false,
    );
  });
  it("rejects a non-integer budgetCents", () => {
    assert.equal(
      CreateBoostSchema.safeParse({ ...validBoost, budgetCents: 1000.5 }).success,
      false,
    );
  });
});

describe("CreateCompanyBoostSchema", () => {
  const valid = {
    companyId: V4_UUID,
    placementType: "directory_featured",
    pricingModel: "flat",
    budgetCents: 1000,
    durationDays: 30,
  } as const;

  it("accepts a valid company boost", () => {
    assert.equal(CreateCompanyBoostSchema.safeParse(valid).success, true);
  });
  it("accepts a seed-derived companyId (gap #1522 regression)", () => {
    assert.equal(
      CreateCompanyBoostSchema.safeParse({ ...valid, companyId: SEED_DERIVED_UUID }).success,
      true,
    );
  });
  it("accepts each placementType value", () => {
    for (const placementType of [
      "directory_featured",
      "dashboard_spotlight",
      "discovery_feed",
      "all",
    ]) {
      assert.equal(
        CreateCompanyBoostSchema.safeParse({ ...valid, placementType }).success,
        true,
        placementType,
      );
    }
  });
  it("rejects budgetCents=999 (below min)", () => {
    assert.equal(
      CreateCompanyBoostSchema.safeParse({ ...valid, budgetCents: 999 }).success,
      false,
    );
  });
  it("rejects an unknown pricingModel (enum edge)", () => {
    assert.equal(
      CreateCompanyBoostSchema.safeParse({ ...valid, pricingModel: "cpc" }).success,
      false,
    );
  });
  it("rejects a missing companyId (required field)", () => {
    const { companyId, ...rest } = valid;
    assert.equal(CreateCompanyBoostSchema.safeParse(rest).success, false);
  });
});

describe("CreateCampaignSchema", () => {
  it("accepts a name-only payload and defaults objective to 'TRAFFIC'", () => {
    const r = CreateCampaignSchema.safeParse({ name: "Q3 push" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.objective, "TRAFFIC");
  });
  it("accepts a fully-populated payload", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({
        name: "Big",
        objective: "AWARENESS",
        budgetCents: 50000,
        startAt: "2026-06-16T00:00:00.000Z",
        endAt: "2026-07-16T00:00:00.000Z",
        notes: "hello",
      }).success,
      true,
    );
  });
  it("accepts a 1-char name (min boundary)", () => {
    assert.equal(CreateCampaignSchema.safeParse({ name: "x" }).success, true);
  });
  it("rejects an empty name (below min)", () => {
    assert.equal(CreateCampaignSchema.safeParse({ name: "" }).success, false);
  });
  it("accepts a 120-char name (max boundary)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "n".repeat(120) }).success,
      true,
    );
  });
  it("rejects a 121-char name (above max)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "n".repeat(121) }).success,
      false,
    );
  });
  it("accepts budgetCents=0 (min boundary)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "x", budgetCents: 0 }).success,
      true,
    );
  });
  it("rejects a negative budgetCents (below min)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "x", budgetCents: -1 }).success,
      false,
    );
  });
  it("rejects a 501-char notes (above max)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "x", notes: "z".repeat(501) }).success,
      false,
    );
  });
  it("rejects a non-datetime startAt", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "x", startAt: "2026-06-16" }).success,
      false,
    );
  });
  it("rejects a missing name (required field)", () => {
    assert.equal(CreateCampaignSchema.safeParse({}).success, false);
  });
  it("rejects an unknown objective (enum edge)", () => {
    assert.equal(
      CreateCampaignSchema.safeParse({ name: "x", objective: "REVENUE" }).success,
      false,
    );
  });
});

describe("CreateAdSetSchema", () => {
  it("accepts a name-only payload and applies enum defaults", () => {
    const r = CreateAdSetSchema.safeParse({ name: "Set A" });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.placementType, "search_top");
      assert.equal(r.data.pricingModel, "cpc");
      assert.equal(r.data.bidStrategy, "manual");
      assert.deepEqual(r.data.targetingJson, {});
    }
  });
  it("accepts a fully-populated payload", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({
        name: "Full",
        placementType: "email",
        pricingModel: "auto",
        bidStrategy: "target_cpa",
        bidAmountCents: 100,
        budgetCents: 5000,
        targetingJson: { country: "US" },
        frequencyCapCount: 3,
        frequencyCapHours: 24,
        startAt: "2026-06-16T00:00:00.000Z",
        endAt: "2026-07-16T00:00:00.000Z",
      }).success,
      true,
    );
  });
  it("accepts frequencyCapCount=100 (max boundary)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", frequencyCapCount: 100 }).success,
      true,
    );
  });
  it("rejects frequencyCapCount=101 (above max)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", frequencyCapCount: 101 }).success,
      false,
    );
  });
  it("accepts frequencyCapHours=168 (max boundary)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", frequencyCapHours: 168 }).success,
      true,
    );
  });
  it("rejects frequencyCapHours=169 (above max)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", frequencyCapHours: 169 }).success,
      false,
    );
  });
  it("rejects bidAmountCents=0 (below min)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", bidAmountCents: 0 }).success,
      false,
    );
  });
  it("rejects a missing name (required field)", () => {
    assert.equal(CreateAdSetSchema.safeParse({}).success, false);
  });
  it("rejects an unknown bidStrategy (enum edge)", () => {
    assert.equal(
      CreateAdSetSchema.safeParse({ name: "x", bidStrategy: "auto_bid" }).success,
      false,
    );
  });
});

describe("CreateAdSchema", () => {
  const valid = { name: "Ad 1", headline: "Hire faster" } as const;

  it("accepts a minimal payload and defaults ctaText to 'Apply Now'", () => {
    const r = CreateAdSchema.safeParse(valid);
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.ctaText, "Apply Now");
  });
  it("accepts a fully-populated payload", () => {
    assert.equal(
      CreateAdSchema.safeParse({
        ...valid,
        description: "desc",
        ctaText: "Learn More",
        ctaUrl: "https://example.com",
        imageUrl: "https://example.com/i.png",
        videoUrl: "https://example.com/v.mp4",
        destinationUrl: "https://example.com/dest",
        variantGroup: "B",
      }).success,
      true,
    );
  });
  it("accepts a 150-char headline (max boundary)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, headline: "h".repeat(150) }).success,
      true,
    );
  });
  it("rejects a 151-char headline (above max)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, headline: "h".repeat(151) }).success,
      false,
    );
  });
  it("rejects an empty headline (below min)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, headline: "" }).success,
      false,
    );
  });
  it("rejects a 301-char description (above max)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, description: "d".repeat(301) }).success,
      false,
    );
  });
  it("rejects a non-URL ctaUrl", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, ctaUrl: "not-a-url" }).success,
      false,
    );
  });
  it("rejects a missing headline (required field)", () => {
    assert.equal(CreateAdSchema.safeParse({ name: "Ad" }).success, false);
  });
  it("rejects an unknown ctaText (enum edge)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, ctaText: "Buy Now" }).success,
      false,
    );
  });
  it("rejects an unknown variantGroup (enum edge)", () => {
    assert.equal(
      CreateAdSchema.safeParse({ ...valid, variantGroup: "C" }).success,
      false,
    );
  });
});
