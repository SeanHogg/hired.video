/**
 * #1344 — LearningPathService tests (prerequisite-DAG cycle detection +
 * unlock computation + path completion).
 *
 * This service is the ONLY writer allowed to insert into
 * `course_prerequisites`; Postgres can't enforce DAG-ness, so the cycle
 * check here is the sole guard against a prerequisite loop that would
 * permanently brick the looping courses (each waits on the other to be
 * passed, neither ever unlocks). #1344 named this as a high-risk path that
 * "runs silently" — these tests pin it.
 *
 * Regression note: the cycle BFS originally traversed the DEPENDENT
 * relation (`prerequisiteCourseId = frontier`), which let real cycles
 * through while wrongly rejecting harmless redundant edges. The fix walks
 * the requires-relation forward (`courseId = frontier`). The "rejects a
 * 2-cycle / transitive cycle" and "allows a redundant transitive edge"
 * cases below would all fail against the pre-fix logic.
 *
 * Driven through the shared fake-db (real WHERE/inArray predicate eval).
 *
 * Run: node --import tsx --test src/services/learning/__tests__/learning-path-service.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { LearningPathService } from "../learning-path-service.js";

// Seed-derived-shaped UUIDs for the four courses + learners/paths.
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const M = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // middle node
const USER = "11111111-1111-4111-8111-111111111111";
const PATH = "22222222-2222-4222-8222-222222222222";

/** Build a service over a seeded prerequisite-edge set.
 *  Edge `{ courseId, prerequisiteCourseId }` = "courseId requires prerequisiteCourseId". */
function svcWith(edges: Array<{ courseId: string; prerequisiteCourseId: string }>, extra = {}) {
  const { db, state } = buildFakeDb({ course_prerequisites: edges, ...extra });
  return { svc: new LearningPathService(db as never), state };
}

// ── addPrerequisite — cycle safety ───────────────────────────────────────

describe("LearningPathService.addPrerequisite — cycle detection", () => {
  it("rejects a course as its own prerequisite", async () => {
    const { svc } = svcWith([]);
    await assert.rejects(() => svc.addPrerequisite(A, A), /own prerequisite/);
  });

  it("allows a first prerequisite edge (empty graph, no cycle)", async () => {
    const { svc, state } = svcWith([]);
    const r = await svc.addPrerequisite(B, A); // "B requires A"
    assert.equal(r.created, true);
    assert.equal(state.course_prerequisites.length, 1);
  });

  it("rejects a direct 2-cycle (B requires A; adding A requires B)", async () => {
    // Existing: B requires A. Adding A requires B closes A → B → A.
    const { svc, state } = svcWith([{ courseId: B, prerequisiteCourseId: A }]);
    await assert.rejects(() => svc.addPrerequisite(A, B), /Cycle/);
    assert.equal(state.course_prerequisites.length, 1, "no edge inserted on cycle");
  });

  it("rejects a transitive cycle (C→B→A; adding A requires C)", async () => {
    // Existing: C requires B, B requires A. Adding A requires C closes
    // A → C → B → A. The BFS must walk C's prerequisites transitively.
    const { svc } = svcWith([
      { courseId: C, prerequisiteCourseId: B },
      { courseId: B, prerequisiteCourseId: A },
    ]);
    await assert.rejects(() => svc.addPrerequisite(A, C), /Cycle/);
  });

  it("allows a redundant transitive edge (A→M→B; adding A requires B is NOT a cycle)", async () => {
    // A already transitively requires B (A requires M, M requires B).
    // Adding the direct A→B edge is redundant but valid — there is no
    // path B → A, so no cycle. (The pre-fix dependent-walk wrongly threw
    // here.)
    const { svc, state } = svcWith([
      { courseId: A, prerequisiteCourseId: M },
      { courseId: M, prerequisiteCourseId: B },
    ]);
    const r = await svc.addPrerequisite(A, B);
    assert.equal(r.created, true);
    assert.equal(state.course_prerequisites.length, 3);
  });

  it("is idempotent — re-adding an existing edge returns created:false without a new row", async () => {
    const { svc, state } = svcWith([{ courseId: B, prerequisiteCourseId: A }]);
    const r = await svc.addPrerequisite(B, A);
    assert.equal(r.created, false);
    assert.equal(state.course_prerequisites.length, 1);
  });
});

// ── listPrerequisites ────────────────────────────────────────────────────

describe("LearningPathService.listPrerequisites", () => {
  it("returns only the direct prerequisites of a course", async () => {
    const { svc } = svcWith([
      { courseId: C, prerequisiteCourseId: A },
      { courseId: C, prerequisiteCourseId: B },
      { courseId: B, prerequisiteCourseId: A }, // not a direct prereq of C
    ]);
    const prereqs = await svc.listPrerequisites(C);
    assert.deepEqual([...prereqs].sort(), [A, B].sort());
  });

  it("returns an empty list for a course with no prerequisites", async () => {
    const { svc } = svcWith([{ courseId: C, prerequisiteCourseId: A }]);
    assert.deepEqual(await svc.listPrerequisites(A), []);
  });
});

// ── computeUnlockState ───────────────────────────────────────────────────

describe("LearningPathService.computeUnlockState", () => {
  it("returns empty sets for an empty course list", async () => {
    const { svc } = svcWith([]);
    const state = await svc.computeUnlockState(USER, []);
    assert.equal(state.passed.size, 0);
    assert.equal(state.unlocked.size, 0);
    assert.equal(state.locked.size, 0);
  });

  it("unlocks a course with no prerequisites", async () => {
    const { svc } = svcWith([]);
    const state = await svc.computeUnlockState(USER, [A]);
    assert.ok(state.unlocked.has(A));
    assert.equal(state.locked.size, 0);
  });

  it("locks a course whose prerequisite the user hasn't passed, with the missing prereq listed", async () => {
    const { svc } = svcWith(
      [{ courseId: B, prerequisiteCourseId: A }],
      { course_enrollments: [] },
    );
    const state = await svc.computeUnlockState(USER, [B]);
    assert.equal(state.unlocked.has(B), false);
    assert.deepEqual(state.locked.get(B), [A]);
  });

  it("unlocks a course once its direct prerequisite is passed", async () => {
    const { svc } = svcWith(
      [{ courseId: B, prerequisiteCourseId: A }],
      { course_enrollments: [{ courseId: A, userId: USER, passed: true }] },
    );
    const state = await svc.computeUnlockState(USER, [B]);
    assert.ok(state.passed.has(A));
    assert.ok(state.unlocked.has(B));
    assert.equal(state.locked.size, 0);
  });

  it("gates a transitive chain by DIRECT prereqs only (C→B→A, user passed A)", async () => {
    // B's direct prereq (A) is passed → B unlocked. C's direct prereq (B)
    // is NOT passed → C stays locked even though A is passed.
    const { svc } = svcWith(
      [
        { courseId: C, prerequisiteCourseId: B },
        { courseId: B, prerequisiteCourseId: A },
      ],
      { course_enrollments: [{ courseId: A, userId: USER, passed: true }] },
    );
    const state = await svc.computeUnlockState(USER, [B, C]);
    assert.ok(state.unlocked.has(B), "B unlocks once A is passed");
    assert.equal(state.unlocked.has(C), false, "C stays locked until B is passed");
    assert.deepEqual(state.locked.get(C), [B]);
  });

  it("does not count another user's passed enrollment", async () => {
    const { svc } = svcWith(
      [{ courseId: B, prerequisiteCourseId: A }],
      { course_enrollments: [{ courseId: A, userId: "someone-else", passed: true }] },
    );
    const state = await svc.computeUnlockState(USER, [B]);
    assert.equal(state.unlocked.has(B), false);
    assert.deepEqual(state.locked.get(B), [A]);
  });

  it("ignores a non-passed enrollment (enrolled but not completed)", async () => {
    const { svc } = svcWith(
      [{ courseId: B, prerequisiteCourseId: A }],
      { course_enrollments: [{ courseId: A, userId: USER, passed: false }] },
    );
    const state = await svc.computeUnlockState(USER, [B]);
    assert.equal(state.unlocked.has(B), false);
  });
});

// ── isPathComplete ───────────────────────────────────────────────────────

describe("LearningPathService.isPathComplete", () => {
  it("is complete when every required course is passed", async () => {
    const { svc } = svcWith([], {
      learning_path_courses: [
        { pathId: PATH, courseId: A, isRequired: true },
        { pathId: PATH, courseId: B, isRequired: true },
      ],
      course_enrollments: [
        { courseId: A, userId: USER, passed: true },
        { courseId: B, userId: USER, passed: true },
      ],
    });
    const r = await svc.isPathComplete(USER, PATH);
    assert.equal(r.complete, true);
    assert.deepEqual(r.missing, []);
  });

  it("is incomplete and lists the missing required course", async () => {
    const { svc } = svcWith([], {
      learning_path_courses: [
        { pathId: PATH, courseId: A, isRequired: true },
        { pathId: PATH, courseId: B, isRequired: true },
      ],
      course_enrollments: [{ courseId: A, userId: USER, passed: true }],
    });
    const r = await svc.isPathComplete(USER, PATH);
    assert.equal(r.complete, false);
    assert.deepEqual(r.missing, [B]);
  });

  it("ignores optional courses — only required ones gate completion", async () => {
    const { svc } = svcWith([], {
      learning_path_courses: [
        { pathId: PATH, courseId: A, isRequired: true },
        { pathId: PATH, courseId: B, isRequired: false }, // optional
      ],
      course_enrollments: [{ courseId: A, userId: USER, passed: true }],
    });
    const r = await svc.isPathComplete(USER, PATH);
    assert.equal(r.complete, true);
  });

  it("returns not-complete for a path with zero required courses", async () => {
    const { svc } = svcWith([], {
      learning_path_courses: [{ pathId: PATH, courseId: A, isRequired: false }],
      course_enrollments: [{ courseId: A, userId: USER, passed: true }],
    });
    const r = await svc.isPathComplete(USER, PATH);
    assert.equal(r.complete, false);
    assert.deepEqual(r.missing, []);
  });
});

// ── maybeCompletePathEnrollment — early-return paths ──────────────────────
// (The success path mutates `learning_paths.completion_count` via an
//  `.update(...).catch(...)` the fake-db chain doesn't model; coverage of
//  the flip itself is left to an integration harness — see #1344 residual.)

describe("LearningPathService.maybeCompletePathEnrollment — guard paths", () => {
  it("no-ops when the learner has no path enrollment", async () => {
    const { svc } = svcWith([], { learning_path_enrollments: [] });
    const r = await svc.maybeCompletePathEnrollment(USER, PATH);
    assert.deepEqual(r, { enrollmentId: null, newlyCompleted: false });
  });

  it("no-ops when the enrollment is already completed (idempotent)", async () => {
    const { svc } = svcWith([], {
      learning_path_enrollments: [
        { id: "enr-1", pathId: PATH, userId: USER, completedAt: new Date() },
      ],
    });
    const r = await svc.maybeCompletePathEnrollment(USER, PATH);
    assert.deepEqual(r, { enrollmentId: "enr-1", newlyCompleted: false });
  });

  it("does not flip when a required course is still unpassed", async () => {
    const { svc } = svcWith([], {
      learning_path_enrollments: [
        { id: "enr-2", pathId: PATH, userId: USER, completedAt: null },
      ],
      learning_path_courses: [{ pathId: PATH, courseId: A, isRequired: true }],
      course_enrollments: [], // A not passed
    });
    const r = await svc.maybeCompletePathEnrollment(USER, PATH);
    assert.deepEqual(r, { enrollmentId: "enr-2", newlyCompleted: false });
  });
});
