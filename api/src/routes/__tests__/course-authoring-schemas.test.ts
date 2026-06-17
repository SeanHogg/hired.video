/**
 * Tests for the Zod schemas behind the course-authoring routes
 * (`course-authoring.ts`, gaps #162 / #200) — schema-test backfill for the
 * TK6 slice of gap #1528.
 *
 * Two validators gate writes here:
 *
 *   • CourseGenInputSchema  — POST /api/courses/generate. Exported from
 *                             `services/courses/course-generator.ts`, so it
 *                             is imported directly (the canonical source).
 *
 *   • PublishToLmsSchema    — POST /api/courses/:id/publish-to-lms. Declared
 *                             `const` (un-exported) inside the route module.
 *                             To keep every edit inside `__tests__/` (the
 *                             route file is intentionally NOT modified), it is
 *                             reconstructed here VERBATIM from course-authoring.ts:
 *                                 z.object({
 *                                   connectorId: UuidLikeSchema,
 *                                   scormPackageUrl: z.string().url(),
 *                                 })
 *                             If the route's shape changes, this mirror must
 *                             change with it.
 *
 * Per gap #1522 / feedback_tests_with_real_fixtures: `connectorId` references
 * an `lms_connectors` row id (UuidLikeSchema), so the fixtures exercise BOTH a
 * clean v4 UUID and a seed-derived (`md5(slug)::uuid`) one — not just
 * canonical UUIDs. Covers happy / boundary / exception per schema.
 *
 * Run: node --import tsx --test src/routes/__tests__/course-authoring-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { CourseGenInputSchema } from "../../services/courses/course-generator.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../shared/__tests__/uuid-fixtures.js";

// Verbatim mirror of the un-exported schema in `course-authoring.ts`. See the
// file header for why it is reconstructed rather than imported.
const PublishToLmsSchema = z.object({
  connectorId: UuidLikeSchema,
  scormPackageUrl: z.string().url(),
});

describe("CourseGenInputSchema", () => {
  // Happy path
  it("accepts a topic-only payload and applies all defaults", () => {
    const r = CourseGenInputSchema.safeParse({ topic: "Intro to TypeScript" });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.difficulty, "beginner");
      assert.equal(r.data.moduleCount, 4);
      assert.equal(r.data.lessonsPerModule, 3);
      assert.equal(r.data.includeKnowledgeChecks, true);
    }
  });

  it("accepts a full payload with an outline and overrides", () => {
    const r = CourseGenInputSchema.safeParse({
      topic: "Advanced Drizzle ORM",
      outline: ["Schemas", "Migrations", "Relations"],
      difficulty: "advanced",
      moduleCount: 6,
      lessonsPerModule: 5,
      includeKnowledgeChecks: false,
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.outline?.length, 3);
      assert.equal(r.data.includeKnowledgeChecks, false);
    }
  });

  // Boundary — topic length
  it("accepts a 4-char topic (min boundary)", () => {
    assert.equal(CourseGenInputSchema.safeParse({ topic: "abcd" }).success, true);
  });
  it("rejects a 3-char topic (below min)", () => {
    assert.equal(CourseGenInputSchema.safeParse({ topic: "abc" }).success, false);
  });
  it("accepts a 280-char topic (max boundary)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "x".repeat(280) }).success,
      true,
    );
  });
  it("rejects a 281-char topic (above max)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "x".repeat(281) }).success,
      false,
    );
  });

  // Boundary — outline items + count
  it("accepts a 20-item outline (max array length)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({
        topic: "Topic here",
        outline: Array.from({ length: 20 }, (_, i) => `Module ${i}`),
      }).success,
      true,
    );
  });
  it("rejects a 21-item outline (above max array length)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({
        topic: "Topic here",
        outline: Array.from({ length: 21 }, (_, i) => `Module ${i}`),
      }).success,
      false,
    );
  });
  it("rejects a 1-char outline item (below per-item min)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", outline: ["x"] }).success,
      false,
    );
  });
  it("rejects a 161-char outline item (above per-item max)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({
        topic: "Topic here",
        outline: ["y".repeat(161)],
      }).success,
      false,
    );
  });

  // Boundary — numeric ranges
  it("accepts moduleCount=1 and moduleCount=12 (range edges)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: 1 }).success,
      true,
    );
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: 12 }).success,
      true,
    );
  });
  it("rejects moduleCount=0 and moduleCount=13 (out of range)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: 0 }).success,
      false,
    );
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: 13 }).success,
      false,
    );
  });
  it("accepts lessonsPerModule=1 and =8 (range edges)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", lessonsPerModule: 1 }).success,
      true,
    );
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", lessonsPerModule: 8 }).success,
      true,
    );
  });
  it("rejects lessonsPerModule=9 (above max)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", lessonsPerModule: 9 }).success,
      false,
    );
  });

  // Exception
  it("rejects a missing topic (required field)", () => {
    assert.equal(CourseGenInputSchema.safeParse({}).success, false);
  });
  it("rejects an unknown difficulty (enum edge)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", difficulty: "expert" }).success,
      false,
    );
  });
  it("rejects a non-integer moduleCount (wrong type)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: 4.5 }).success,
      false,
    );
  });
  it("rejects a string moduleCount (wrong type)", () => {
    assert.equal(
      CourseGenInputSchema.safeParse({ topic: "Topic here", moduleCount: "4" }).success,
      false,
    );
  });
});

describe("PublishToLmsSchema", () => {
  // Happy path
  it("accepts a connectorId + https scormPackageUrl (clean v4)", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({
        connectorId: V4_UUID,
        scormPackageUrl: "https://cdn.example.com/pkg.zip",
      }).success,
      true,
    );
  });

  it("accepts a seed-derived connectorId (gap #1522 regression)", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({
        connectorId: SEED_DERIVED_UUID,
        scormPackageUrl: "https://cdn.example.com/pkg.zip",
      }).success,
      true,
    );
  });

  // Exception
  it("rejects a missing connectorId (required field)", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({
        scormPackageUrl: "https://cdn.example.com/pkg.zip",
      }).success,
      false,
    );
  });
  it("rejects a malformed connectorId", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({
        connectorId: "not-a-uuid",
        scormPackageUrl: "https://cdn.example.com/pkg.zip",
      }).success,
      false,
    );
  });
  it("rejects a missing scormPackageUrl (required field)", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({ connectorId: V4_UUID }).success,
      false,
    );
  });
  it("rejects a non-URL scormPackageUrl", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({
        connectorId: V4_UUID,
        scormPackageUrl: "not a url",
      }).success,
      false,
    );
  });
  it("rejects an empty scormPackageUrl", () => {
    assert.equal(
      PublishToLmsSchema.safeParse({ connectorId: V4_UUID, scormPackageUrl: "" }).success,
      false,
    );
  });
});
