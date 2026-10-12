/**
 * Regression test for register gap #2137 (quality):
 *   "`course` review eligibility gate behavior under no-enrollment reviewer."
 *
 * The `course` review descriptor is `eligibility: "buyer_only"` +
 * `verification: "was_buyer"`. Unlike single-buyer subjects (e.g.
 * `promo_project`, which always carries a `buyerId` column), a `course`'s
 * buyer is identified by a `course_enrollments` row. `resolveSubject` leaves
 * `buyerId` UNDEFINED when the reviewer has no enrollment.
 *
 * This pins that the buyer_only gate FAILS CLOSED: an undefined `buyerId`
 * must be rejected (403), because `undefined !== reviewerId`. The
 * undefined-buyer path was previously unexercised — single-buyer subjects
 * never hit it.
 *
 * We drive the REAL units that enforce the gate:
 *   • resolveSubject() against the shared fake-db (real WHERE evaluation of
 *     the enrollment lookup) → confirms buyerId is/ isn't populated.
 *   • checkEligibility() → the single source of truth the upsert handler
 *     delegates to. No duplicated gate logic in the test.
 *
 * Run: node --import tsx --test src/routes/__tests__/reviews-course-eligibility.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { resolveSubject, checkEligibility } from "../reviews.js";
import { getSubjectDescriptor } from "../../../../shared/reviews/subject-descriptors.js";

const COURSE_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const REVIEWER_ID = "33333333-3333-3333-3333-333333333333";

const COURSE_DESCRIPTOR = getSubjectDescriptor("course");

function seedCourse(enrollments: Array<{ courseId: string; userId: string }> = []) {
  return buildFakeDb({
    courses: [{ id: COURSE_ID, userId: OWNER_ID }],
    course_enrollments: enrollments.map((e) => ({
      id: `enrol-${e.userId}`,
      courseId: e.courseId,
      userId: e.userId,
    })),
  }).db;
}

describe("course review descriptor — gap #2137 preconditions", () => {
  it("is buyer_only + was_buyer (the combination that can fail open)", () => {
    assert.equal(COURSE_DESCRIPTOR.eligibility, "buyer_only");
    assert.equal(COURSE_DESCRIPTOR.verification, "was_buyer");
  });
});

describe("resolveSubject(course) — buyerId resolution", () => {
  it("leaves buyerId undefined when the reviewer has NO enrollment row", async () => {
    const db = seedCourse(/* no enrollments */);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    assert.ok(subject, "course subject should resolve");
    assert.equal(subject!.ownerId, OWNER_ID);
    assert.equal(subject!.buyerId, undefined);
  });

  it("populates buyerId when the reviewer HAS an enrollment row", async () => {
    const db = seedCourse([{ courseId: COURSE_ID, userId: REVIEWER_ID }]);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    assert.ok(subject, "course subject should resolve");
    assert.equal(subject!.buyerId, REVIEWER_ID);
  });

  it("does NOT treat a different user's enrollment as the reviewer's buyer status", async () => {
    const db = seedCourse([{ courseId: COURSE_ID, userId: "99999999-9999-9999-9999-999999999999" }]);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    assert.ok(subject);
    assert.equal(subject!.buyerId, undefined);
  });
});

describe("checkEligibility(course) — buyer_only gate fails closed", () => {
  it("REJECTS (403) a reviewer with no enrollment (buyerId undefined)", async () => {
    const db = seedCourse(/* no enrollments */);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    const decision = checkEligibility(COURSE_DESCRIPTOR, subject!, REVIEWER_ID);
    // Non-null decision = a rejection (null = eligible).
    assert.ok(decision, "no-enrollment reviewer must be rejected");
    assert.equal(decision!.status, 403);
    assert.equal(decision!.code, "FORBIDDEN");
  });

  it("ALLOWS a reviewer who has an enrollment (buyer check passes)", async () => {
    const db = seedCourse([{ courseId: COURSE_ID, userId: REVIEWER_ID }]);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    const decision = checkEligibility(COURSE_DESCRIPTOR, subject!, REVIEWER_ID);
    assert.equal(decision, null);
  });

  it("REJECTS even when the reviewer is also a different user with an enrollment", async () => {
    // Owner-of-course with no enrollment is still rejected by buyer_only.
    const db = seedCourse([{ courseId: COURSE_ID, userId: "99999999-9999-9999-9999-999999999999" }]);
    const subject = await resolveSubject(db as any, "course", COURSE_ID, REVIEWER_ID);
    const decision = checkEligibility(COURSE_DESCRIPTOR, subject!, REVIEWER_ID);
    assert.ok(decision, "still rejected — a different user's enrollment doesn't satisfy buyer_only");
    assert.equal(decision!.status, 403);
  });
});
