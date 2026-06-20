/**
 * Tests for the Zod schemas in `admin-articles.ts` — PRIORITY slice of the
 * schema-test backfill (#1528). The validators are route-local `const`s, so
 * (per the established pattern, e.g. recruiter-schemas.test.ts) they are
 * mirrored here VERBATIM rather than exported from the route file. `ids` are
 * DB-row UUIDs, so the #1522 seed-derived-UUID regression is exercised.
 *
 * Run: node --import tsx --test src/routes/__tests__/admin-articles-schemas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { SEED_DERIVED_UUID, V4_UUID } from "../../../../shared/__tests__/uuid-fixtures.js";

// Verbatim mirrors of admin-articles.ts.
const IdsSchema = z.object({ ids: z.array(UuidLikeSchema).min(1).max(100) });
const RejectSchema = IdsSchema.extend({ reason: z.string().min(1).max(2000) });
const QueueQuerySchema = z.object({
  status: z.enum(["submitted", "rejected", "published"]).default("submitted"),
  kind: z.enum(["article", "faq", "guide"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

describe("IdsSchema", () => {
  it("accepts 1..100 ids incl. a seed-derived UUID (#1522)", () => {
    assert.ok(IdsSchema.safeParse({ ids: [V4_UUID] }).success);
    assert.ok(IdsSchema.safeParse({ ids: [SEED_DERIVED_UUID, V4_UUID] }).success);
  });
  it("rejects empty, over-cap, and non-uuid", () => {
    assert.equal(IdsSchema.safeParse({ ids: [] }).success, false);
    assert.equal(IdsSchema.safeParse({ ids: Array(101).fill(V4_UUID) }).success, false);
    assert.equal(IdsSchema.safeParse({ ids: ["not-a-uuid"] }).success, false);
  });
});

describe("RejectSchema", () => {
  it("requires a non-empty reason ≤ 2000 chars on top of ids", () => {
    assert.ok(RejectSchema.safeParse({ ids: [V4_UUID], reason: "spam" }).success);
    assert.equal(RejectSchema.safeParse({ ids: [V4_UUID], reason: "" }).success, false);
    assert.equal(RejectSchema.safeParse({ ids: [V4_UUID], reason: "x".repeat(2001) }).success, false);
    assert.equal(RejectSchema.safeParse({ ids: [V4_UUID] }).success, false);
  });
});

describe("QueueQuerySchema", () => {
  it("defaults status=submitted, limit=50", () => {
    const out = QueueQuerySchema.parse({});
    assert.equal(out.status, "submitted");
    assert.equal(out.limit, 50);
  });
  it("coerces limit and clamps the range", () => {
    assert.equal(QueueQuerySchema.parse({ limit: "10" }).limit, 10);
    assert.equal(QueueQuerySchema.safeParse({ limit: 0 }).success, false);
    assert.equal(QueueQuerySchema.safeParse({ limit: 201 }).success, false);
  });
  it("rejects unknown status / kind enums", () => {
    assert.equal(QueueQuerySchema.safeParse({ status: "archived" }).success, false);
    assert.equal(QueueQuerySchema.safeParse({ kind: "video" }).success, false);
  });
});
