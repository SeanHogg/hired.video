/**
 * Tests for the Zod schemas in `learning-goals.ts` — schema-test backfill for
 * the TK6 slice of gap #1528.
 *
 * Both validators (`CreateGoalSchema`, `UpdateGoalSchema`) are declared
 * un-exported inside the route module. To keep every edit inside `__tests__/`
 * (the route file is intentionally NOT modified to add exports), they are
 * reconstructed here VERBATIM from learning-goals.ts:
 *
 *     CreateGoalSchema = z.object({
 *       goalText: z.string().min(2).max(280),
 *       source: z.enum(["onboarding", "manual"]).default("manual"),
 *     });
 *     UpdateGoalSchema = z.object({
 *       goalText: z.string().min(2).max(280).optional(),
 *       status: z.enum(LEARNING_GOAL_STATUSES).optional(),
 *     });
 *
 * The status enum is imported from the live schema module
 * (`db/schema/learning.ts`) rather than re-typed, so the enum edge tests stay
 * coupled to the real source of truth. If the inline schemas change, these
 * mirrors must change with them.
 *
 * These schemas don't carry any id fields, so there's no #1522 UUID surface
 * here; coverage is happy / boundary (min/max length, defaults, optionality)
 * / exception (missing required, wrong type, enum edge).
 *
 * Run: node --import tsx --test src/routes/__tests__/learning-goals-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { LEARNING_GOAL_STATUSES } from "../../db/schema/learning.js";

// Verbatim mirrors of the un-exported schemas in `learning-goals.ts`. See the
// file header for why they are reconstructed rather than imported.
const CreateGoalSchema = z.object({
  goalText: z.string().min(2).max(280),
  source: z.enum(["onboarding", "manual"]).default("manual"),
});

const UpdateGoalSchema = z.object({
  goalText: z.string().min(2).max(280).optional(),
  status: z.enum(LEARNING_GOAL_STATUSES).optional(),
});

describe("CreateGoalSchema", () => {
  // Happy path
  it("accepts goalText only and defaults source to 'manual'", () => {
    const r = CreateGoalSchema.safeParse({ goalText: "Learn React" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.source, "manual");
  });

  it("accepts an explicit onboarding source", () => {
    const r = CreateGoalSchema.safeParse({
      goalText: "Become a recruiter",
      source: "onboarding",
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.source, "onboarding");
  });

  // Boundary — goalText length
  it("accepts a 2-char goalText (min boundary)", () => {
    assert.equal(CreateGoalSchema.safeParse({ goalText: "Go" }).success, true);
  });
  it("rejects a 1-char goalText (below min)", () => {
    assert.equal(CreateGoalSchema.safeParse({ goalText: "x" }).success, false);
  });
  it("accepts a 280-char goalText (max boundary)", () => {
    assert.equal(
      CreateGoalSchema.safeParse({ goalText: "y".repeat(280) }).success,
      true,
    );
  });
  it("rejects a 281-char goalText (above max)", () => {
    assert.equal(
      CreateGoalSchema.safeParse({ goalText: "y".repeat(281) }).success,
      false,
    );
  });

  // Exception
  it("rejects a missing goalText (required field)", () => {
    assert.equal(CreateGoalSchema.safeParse({}).success, false);
  });
  it("rejects a non-string goalText (wrong type)", () => {
    assert.equal(CreateGoalSchema.safeParse({ goalText: 42 }).success, false);
  });
  it("rejects an unknown source (enum edge)", () => {
    assert.equal(
      CreateGoalSchema.safeParse({ goalText: "Learn React", source: "import" }).success,
      false,
    );
  });
});

describe("UpdateGoalSchema", () => {
  // Happy path — every field optional, so an empty object is valid.
  it("accepts an empty payload (all fields optional)", () => {
    assert.equal(UpdateGoalSchema.safeParse({}).success, true);
  });
  it("accepts a goalText-only edit", () => {
    assert.equal(
      UpdateGoalSchema.safeParse({ goalText: "Updated goal" }).success,
      true,
    );
  });
  it("accepts each valid status transition", () => {
    for (const status of LEARNING_GOAL_STATUSES) {
      assert.equal(
        UpdateGoalSchema.safeParse({ status }).success,
        true,
        `expected status '${status}' to be accepted`,
      );
    }
  });
  it("accepts goalText + status together", () => {
    assert.equal(
      UpdateGoalSchema.safeParse({ goalText: "Done", status: "completed" }).success,
      true,
    );
  });

  // Boundary — goalText length (same bounds as CreateGoalSchema)
  it("accepts a 2-char goalText (min boundary)", () => {
    assert.equal(UpdateGoalSchema.safeParse({ goalText: "Go" }).success, true);
  });
  it("rejects a 1-char goalText (below min)", () => {
    assert.equal(UpdateGoalSchema.safeParse({ goalText: "x" }).success, false);
  });
  it("rejects a 281-char goalText (above max)", () => {
    assert.equal(
      UpdateGoalSchema.safeParse({ goalText: "y".repeat(281) }).success,
      false,
    );
  });

  // Exception
  it("rejects an unknown status (enum edge)", () => {
    assert.equal(
      UpdateGoalSchema.safeParse({ status: "deleted" }).success,
      false,
    );
  });
  it("rejects a non-string goalText (wrong type)", () => {
    assert.equal(UpdateGoalSchema.safeParse({ goalText: true }).success, false);
  });
});
