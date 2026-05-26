/**
 * Tests for the Zod schemas in `learning-paths.ts`.
 *
 * `AttachCourseSchema` is the only public schema today (the rest of the
 * file uses inline `z.object` literals). Same gap #1522 regression
 * applies here: a learning path's attached courseId references a
 * `courses` row, and any of those rows can be md5-seed-derived from
 * `0131_seed_platform_learning_library.sql`.
 *
 * Run: node --import tsx --test src/routes/__tests__/learning-paths-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AttachCourseSchema } from "../learning-paths.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../../shared/__tests__/uuid-fixtures.js";

describe("AttachCourseSchema", () => {
  it("accepts the minimal payload (courseId only)", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: V4_UUID }).success,
      true,
    );
  });

  it("accepts a seed-derived courseId (gap #1522 regression)", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: SEED_DERIVED_UUID }).success,
      true,
    );
  });

  it("accepts displayOrder + isRequired together", () => {
    const r = AttachCourseSchema.safeParse({
      courseId: V4_UUID,
      displayOrder: 3,
      isRequired: false,
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.displayOrder, 3);
      assert.equal(r.data.isRequired, false);
    }
  });

  it("rejects when courseId is missing", () => {
    assert.equal(AttachCourseSchema.safeParse({}).success, false);
  });

  it("rejects malformed courseId", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: "not-a-uuid" }).success,
      false,
    );
  });

  it("rejects empty courseId", () => {
    assert.equal(AttachCourseSchema.safeParse({ courseId: "" }).success, false);
  });

  it("rejects negative displayOrder", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: V4_UUID, displayOrder: -1 }).success,
      false,
    );
  });

  it("rejects non-integer displayOrder", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: V4_UUID, displayOrder: 1.5 }).success,
      false,
    );
  });

  it("rejects non-boolean isRequired", () => {
    assert.equal(
      AttachCourseSchema.safeParse({ courseId: V4_UUID, isRequired: "yes" }).success,
      false,
    );
  });
});
