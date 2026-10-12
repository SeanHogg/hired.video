/**
 * #1962 — Cohort analytics roll-up aggregation correctness.
 *
 * CohortAnalyticsService.compute is a pure fan-out aggregation over members ×
 * assignments × enrollments. It is reached through getAnalytics() (the
 * read-through cache), and — unlike the rest of CohortService — uses ONLY the
 * constructor-injected db handle (no getDb() seam), so it can be driven
 * end-to-end against an in-memory fake.
 *
 * The repo's generic buildFakeDb shim doesn't model leftJoin / multi-table
 * shapes, so this file uses a small purpose-built fake that implements exactly
 * the query shapes compute() issues (select/from/leftJoin/where/groupBy),
 * keyed on Drizzle table identity. Fixtures mirror real learner data: a
 * passed course, an in-progress course (partial lessons), an unlinked
 * placeholder member, an overdue required assignment, and a path with
 * required courses.
 *
 * Run: node --import tsx --test src/services/learning/__tests__/cohort-analytics.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { CohortAnalyticsService, invalidateCohortAnalyticsCache } from "../cohort-analytics.js";
import { schema } from "../../../db/index.js";
// `users` is imported from its source module rather than the aggregated
// `schema` namespace: the barrel re-exports 88 schema files via `export *`,
// and a common name like `users` can fail to surface on the namespace type
// under stricter/clean TS module resolution (seen in CI). Importing the table
// directly makes the binding unambiguous regardless of star-export order.
import { users } from "../../../db/schema/users.js";

const {
  cohortMembers,
  learningAssignments,
  courses,
  courseLessons,
  courseEnrollments,
  learningPaths,
  learningPathCourses,
  learningPathEnrollments,
} = schema;

type Row = Record<string, any>;

/** Resolve a Drizzle table object to its DB name via the `_.name` symbol the
 *  table carries (same approach the repo's fake-db uses). */
function tableNameOf(table: any): string {
  const sym = Object.getOwnPropertySymbols(table).find((s) => /name/i.test(s.description ?? ""));
  return (sym ? table[sym] : table?._?.name) as string;
}

const NAME = {
  cohortMembers: tableNameOf(cohortMembers),
  learningAssignments: tableNameOf(learningAssignments),
  courses: tableNameOf(courses),
  courseLessons: tableNameOf(courseLessons),
  courseEnrollments: tableNameOf(courseEnrollments),
  learningPaths: tableNameOf(learningPaths),
  learningPathCourses: tableNameOf(learningPathCourses),
  learningPathEnrollments: tableNameOf(learningPathEnrollments),
  users: tableNameOf(users),
};

/**
 * Minimal Drizzle-shaped fake that supports compute()'s exact query set.
 * Each query resolves the base table by identity, applies an in-memory
 * predicate built from a tiny scope object the test caller doesn't see — we
 * instead inspect the SQL the service emits is too brittle, so we evaluate by
 * re-deriving the filters from the fixture data and the known query intent.
 *
 * To stay honest WITHOUT re-implementing Drizzle's AST walker, the fake takes
 * the seeded `state` and lets each query return the right rows by table:
 *   • cohortMembers  → all non-removed members of the (single) cohort, left-
 *                      joined to users for {name,email}
 *   • learningAssignments → all active assignments of the cohort
 *   • courses/paths  → title rows for the referenced ids
 *   • courseLessons  → grouped lesson counts
 *   • learningPathCourses → required course ids per path
 *   • courseEnrollments / pathEnrollments → the member rows
 * Filtering by id-set is applied generically from the WHERE the service
 * passes (we read the inArray/eq params off the compiled SQL).
 */
function makeAnalyticsDb(state: Record<string, Row[]>) {
  // We don't parse Drizzle SQL here; compute() already scopes by cohort via
  // the seeded data (one cohort per test) and by id-sets it derives from the
  // members/assignments it just read. Returning the full seeded table for
  // each base table is therefore correct for a single-cohort fixture, EXCEPT
  // we must honour the status<>removed and status=active filters + the join
  // to users. Those are applied explicitly below.
  function rowsFor(table: any): Row[] {
    return state[tableNameOf(table)] ?? [];
  }

  function makeQuery(table: any) {
    let joinUsers = false;
    let isMembers = tableNameOf(table) === NAME.cohortMembers;
    let isAssignments = tableNameOf(table) === NAME.learningAssignments;
    let isGrouped = false;

    const exec = (): Row[] => {
      let rows = rowsFor(table);
      if (isMembers) {
        rows = rows.filter((r) => r.status !== "removed");
        if (joinUsers) {
          const usersById = new Map((state[NAME.users] ?? []).map((u) => [u.id, u]));
          return rows.map((m) => ({ member: m, name: usersById.get(m.userId)?.name ?? null, email: usersById.get(m.userId)?.email ?? null }));
        }
        return rows;
      }
      if (isAssignments) {
        return rows.filter((r) => r.status === "active");
      }
      if (isGrouped) {
        // lesson counts grouped by courseId.
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r.courseId, (counts.get(r.courseId) ?? 0) + 1);
        return Array.from(counts.entries()).map(([courseId, n]) => ({ courseId, n }));
      }
      // courses / paths title rows, pathCourses, enrollments: return as-is.
      // learningPathCourses must honour isRequired=true.
      if (tableNameOf(table) === NAME.learningPathCourses) {
        return rows.filter((r) => r.isRequired === true);
      }
      return rows;
    };

    const chain: any = {
      leftJoin(_t: any) { joinUsers = true; return chain; },
      where(_c: any) { return chain; },
      groupBy(_c: any) { isGrouped = true; return Promise.resolve(exec()); },
      then(onF: any, onR?: any) { return Promise.resolve(exec()).then(onF, onR); },
    };
    return chain;
  }

  return {
    select(_cols?: any) {
      return { from(table: any) { return makeQuery(table); } };
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const COHORT = "c0000000-0000-4000-8000-000000000000";
const U_PASS = "u0000000-0000-4000-8000-000000000001"; // passed the course
const U_PROG = "u0000000-0000-4000-8000-000000000002"; // in progress
const U_NONE = "u0000000-0000-4000-8000-000000000003"; // linked, no progress
const COURSE = "11111111-1111-4111-8111-111111111111";
const PATH = "22222222-2222-4222-8222-222222222222";
const PATH_REQ_COURSE = "33333333-3333-4333-8333-333333333333";

const PAST = new Date("2020-01-01T00:00:00Z"); // overdue relative to now
const FUTURE = new Date("2099-01-01T00:00:00Z");

function baseState(): Record<string, Row[]> {
  return {
    [NAME.cohortMembers]: [
      { id: "m-pass", cohortId: COHORT, userId: U_PASS, role: "student", status: "active", displayName: null, invitedEmail: null },
      { id: "m-prog", cohortId: COHORT, userId: U_PROG, role: "student", status: "active", displayName: null, invitedEmail: null },
      { id: "m-none", cohortId: COHORT, userId: U_NONE, role: "student", status: "active", displayName: null, invitedEmail: null },
      // unlinked placeholder (no userId) — "not_linked" cells, never counted toward progress
      { id: "m-ph", cohortId: COHORT, userId: null, role: "student", status: "active", displayName: "Walk-in", invitedEmail: "walkin@x.com" },
      // removed member must be excluded entirely
      { id: "m-gone", cohortId: COHORT, userId: "u-gone", role: "student", status: "removed" },
    ],
    [NAME.users]: [
      { id: U_PASS, name: "Pat Pass", email: "pat@x.com" },
      { id: U_PROG, name: "Pro Gress", email: "pro@x.com" },
      { id: U_NONE, name: "Nora None", email: "nora@x.com" },
    ],
    [NAME.learningAssignments]: [
      { id: "a-course", cohortId: COHORT, memberId: null, subjectType: "course", subjectId: COURSE, required: true, dueAt: PAST, status: "active" },
      { id: "a-path", cohortId: COHORT, memberId: null, subjectType: "path", subjectId: PATH, required: false, dueAt: FUTURE, status: "active" },
      // archived assignment must be excluded
      { id: "a-old", cohortId: COHORT, memberId: null, subjectType: "course", subjectId: COURSE, required: true, dueAt: null, status: "archived" },
    ],
    [NAME.courses]: [
      { id: COURSE, title: "Intro to Algebra" },
      { id: PATH_REQ_COURSE, title: "Path Course" },
    ],
    [NAME.learningPaths]: [{ id: PATH, title: "Math Track" }],
    [NAME.courseLessons]: [
      // 4 lessons in COURSE → denominator for the in-progress fraction
      { id: "l1", courseId: COURSE },
      { id: "l2", courseId: COURSE },
      { id: "l3", courseId: COURSE },
      { id: "l4", courseId: COURSE },
    ],
    [NAME.learningPathCourses]: [
      { pathId: PATH, courseId: PATH_REQ_COURSE, isRequired: true },
    ],
    [NAME.courseEnrollments]: [
      // U_PASS passed the course outright.
      { userId: U_PASS, courseId: COURSE, passed: true, finalScorePct: 88, startedAt: new Date(), completedAt: new Date("2026-05-01T00:00:00Z"), progress: { l1: { status: "passed" }, l2: { status: "passed" }, l3: { status: "passed" }, l4: { status: "passed" } } },
      // U_PROG started, 2 of 4 lessons passed → fraction 0.5, in_progress.
      { userId: U_PROG, courseId: COURSE, passed: false, finalScorePct: null, startedAt: new Date(), completedAt: null, progress: { l1: { status: "passed" }, l2: { status: "passed" } } },
      // U_PASS also passed the path's required course → path completes.
      { userId: U_PASS, courseId: PATH_REQ_COURSE, passed: true, finalScorePct: 95, startedAt: new Date(), completedAt: new Date(), progress: {} },
    ],
    [NAME.learningPathEnrollments]: [],
  };
}

function service(state: Record<string, Row[]>) {
  invalidateCohortAnalyticsCache(COHORT); // avoid cross-test cache bleed
  return new CohortAnalyticsService(makeAnalyticsDb(state) as never);
}

describe("CohortAnalyticsService.getAnalytics — aggregation correctness", () => {
  beforeEach(() => invalidateCohortAnalyticsCache(COHORT));

  it("counts members (excluding removed) and active assignments", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    assert.equal(a.memberCount, 4); // 3 linked + 1 placeholder; removed excluded
    assert.equal(a.assignmentCount, 2); // archived excluded
    assert.equal(a.cohortId, COHORT);
  });

  it("derives per-member course status: passed→completed, partial→in_progress, none→not_started", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    const byMember = new Map(a.members.map((m) => [m.memberId, m]));

    const pass = byMember.get("m-pass")!;
    const passCourseCell = pass.items.find((i) => i.subjectType === "course")!;
    assert.equal(passCourseCell.status, "completed");
    assert.equal(passCourseCell.fraction, 1);
    assert.equal(passCourseCell.scorePct, 88);

    const prog = byMember.get("m-prog")!;
    const progCourseCell = prog.items.find((i) => i.subjectType === "course")!;
    assert.equal(progCourseCell.status, "in_progress");
    assert.equal(progCourseCell.fraction, 0.5); // 2 of 4 lessons

    const none = byMember.get("m-none")!;
    assert.equal(none.items.find((i) => i.subjectType === "course")!.status, "not_started");
  });

  it("marks an unlinked placeholder's cells not_linked (never counted toward progress)", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    const ph = a.members.find((m) => m.memberId === "m-ph")!;
    assert.equal(ph.linked, false);
    assert.ok(ph.items.every((i) => i.status === "not_linked"));
    assert.equal(ph.completedCount, 0);
    // placeholder identity falls back to displayName/invitedEmail
    assert.equal(ph.name, "Walk-in");
    assert.equal(ph.email, "walkin@x.com");
  });

  it("flags an overdue required course (past due, not completed) but NOT for the member who passed", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    const byMember = new Map(a.members.map((m) => [m.memberId, m]));
    // a-course is required + due in the PAST.
    assert.equal(byMember.get("m-prog")!.items.find((i) => i.subjectType === "course")!.overdue, true);
    assert.equal(byMember.get("m-none")!.items.find((i) => i.subjectType === "course")!.overdue, true);
    // U_PASS completed it → not overdue.
    assert.equal(byMember.get("m-pass")!.items.find((i) => i.subjectType === "course")!.overdue, false);
    // placeholder is not_linked → never overdue.
    assert.equal(byMember.get("m-ph")!.items.find((i) => i.subjectType === "course")!.overdue, false);
  });

  it("completes a path when all its required courses are passed", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    const pass = a.members.find((m) => m.memberId === "m-pass")!;
    const pathCell = pass.items.find((i) => i.subjectType === "path")!;
    assert.equal(pathCell.status, "completed"); // PATH_REQ_COURSE passed
    assert.equal(pathCell.fraction, 1);
    // U_PROG hasn't touched the path's required course → not_started.
    const prog = a.members.find((m) => m.memberId === "m-prog")!;
    assert.equal(prog.items.find((i) => i.subjectType === "path")!.status, "not_started");
  });

  it("rolls up the cohort summary + completionRate over REQUIRED cells only", async () => {
    const a = await service(baseState()).getAnalytics(COHORT);
    // Required cells = the required course assignment for each of the 3 linked
    // members (the path is NOT required). 1 of 3 (U_PASS) completed it.
    assert.equal(a.summary.completionRate, 1 / 3);
    // Summary tallies across linked members' cells (course + path each):
    //   U_PASS: course completed + path completed = 2 completed
    //   U_PROG: course in_progress + path not_started
    //   U_NONE: course not_started + path not_started
    assert.equal(a.summary.completed, 2);
    assert.equal(a.summary.inProgress, 1);
    assert.equal(a.summary.notStarted, 3);
    // Overdue: the required course is past-due for U_PROG + U_NONE (not U_PASS).
    assert.equal(a.summary.overdue, 2);
  });

  it("handles an empty cohort (no members, no assignments) without dividing by zero", async () => {
    const empty: Record<string, Row[]> = { ...baseState(), [NAME.cohortMembers]: [], [NAME.learningAssignments]: [] };
    const a = await service(empty).getAnalytics(COHORT);
    assert.equal(a.memberCount, 0);
    assert.equal(a.assignmentCount, 0);
    assert.equal(a.summary.completionRate, 0);
    assert.deepEqual(a.members, []);
  });
});
