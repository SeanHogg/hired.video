/**
 * Tests for the Zod schemas in `cohorts.ts` (#1887/#1888).
 *
 * Per gap #1522 / feedback_tests_with_real_fixtures: assignment subjectIds
 * reference `courses` / `learning_paths` rows, and those can be
 * md5-seed-derived (0131_seed_platform_learning_library.sql) — so the
 * fixtures exercise BOTH a clean v4 UUID and a seed-derived one, not just
 * canonical UUIDs. Covers happy / boundary / exception per schema.
 *
 * Run: node --import tsx --test src/routes/__tests__/cohorts-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CreateCohortSchema,
  UpdateCohortSchema,
  AddMemberSchema,
  CreateAssignmentSchema,
  JoinSchema,
} from "../cohorts.js";
import { SEED_DERIVED_UUID, V4_UUID } from "../../../../shared/__tests__/uuid-fixtures.js";

describe("CreateCohortSchema", () => {
  it("accepts a name-only payload", () => {
    assert.equal(CreateCohortSchema.safeParse({ name: "Fall Cohort A" }).success, true);
  });
  it("accepts name + description + companyId", () => {
    assert.equal(
      CreateCohortSchema.safeParse({ name: "A", description: "d", companyId: V4_UUID }).success,
      true,
    );
  });
  it("rejects an empty name", () => {
    assert.equal(CreateCohortSchema.safeParse({ name: "" }).success, false);
  });
  it("rejects a name over 200 chars", () => {
    assert.equal(CreateCohortSchema.safeParse({ name: "x".repeat(201) }).success, false);
  });
  it("rejects a malformed companyId", () => {
    assert.equal(CreateCohortSchema.safeParse({ name: "A", companyId: "nope" }).success, false);
  });
});

describe("UpdateCohortSchema", () => {
  it("accepts a nullable description (clear it)", () => {
    assert.equal(UpdateCohortSchema.safeParse({ description: null }).success, true);
  });
  it("accepts archive transition", () => {
    assert.equal(UpdateCohortSchema.safeParse({ status: "archived" }).success, true);
  });
  it("rejects an unknown status", () => {
    assert.equal(UpdateCohortSchema.safeParse({ status: "deleted" }).success, false);
  });
});

describe("AddMemberSchema", () => {
  it("accepts a native userId (seed-derived — gap #1522 regression)", () => {
    assert.equal(AddMemberSchema.safeParse({ userId: SEED_DERIVED_UUID }).success, true);
  });
  it("accepts an email invite", () => {
    assert.equal(AddMemberSchema.safeParse({ invitedEmail: "s@x.com" }).success, true);
  });
  it("accepts a placeholder displayName", () => {
    assert.equal(AddMemberSchema.safeParse({ displayName: "Row 12" }).success, true);
  });
  it("accepts the co_educator role", () => {
    assert.equal(AddMemberSchema.safeParse({ userId: V4_UUID, role: "co_educator" }).success, true);
  });
  it("rejects an empty payload (none of the three identity fields)", () => {
    assert.equal(AddMemberSchema.safeParse({}).success, false);
  });
  it("rejects a malformed email", () => {
    assert.equal(AddMemberSchema.safeParse({ invitedEmail: "not-an-email" }).success, false);
  });
  it("rejects an unknown role", () => {
    assert.equal(AddMemberSchema.safeParse({ userId: V4_UUID, role: "teacher" }).success, false);
  });
});

describe("CreateAssignmentSchema", () => {
  it("accepts a course assignment (clean v4)", () => {
    assert.equal(
      CreateAssignmentSchema.safeParse({ subjectType: "course", subjectId: V4_UUID }).success,
      true,
    );
  });
  it("accepts a path assignment to a seed-derived id with due date + required", () => {
    const r = CreateAssignmentSchema.safeParse({
      subjectType: "path",
      subjectId: SEED_DERIVED_UUID,
      required: false,
      dueAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.required, false);
  });
  it("accepts a member-targeted assignment", () => {
    assert.equal(
      CreateAssignmentSchema.safeParse({ subjectType: "course", subjectId: V4_UUID, memberId: V4_UUID }).success,
      true,
    );
  });
  it("rejects an unknown subjectType", () => {
    assert.equal(
      CreateAssignmentSchema.safeParse({ subjectType: "video", subjectId: V4_UUID }).success,
      false,
    );
  });
  it("rejects a non-ISO dueAt", () => {
    assert.equal(
      CreateAssignmentSchema.safeParse({ subjectType: "course", subjectId: V4_UUID, dueAt: "next friday" }).success,
      false,
    );
  });
  it("rejects a missing subjectId", () => {
    assert.equal(CreateAssignmentSchema.safeParse({ subjectType: "course" }).success, false);
  });
});

describe("JoinSchema", () => {
  it("accepts an 8-char code", () => {
    assert.equal(JoinSchema.safeParse({ joinCode: "H7K2MNPQ" }).success, true);
  });
  it("rejects a too-short code", () => {
    assert.equal(JoinSchema.safeParse({ joinCode: "AB" }).success, false);
  });
  it("rejects a missing code", () => {
    assert.equal(JoinSchema.safeParse({}).success, false);
  });
});
