/**
 * #1962 — Cohort / classroom service tests.
 *
 * Three layers are covered here:
 *
 *  1. THE GATE. Every cohort + assignment mutation routes through the Studio
 *     `canActFor` / `assertCanWrite` seam (CohortService.getManageable calls
 *     it; AssignmentService delegates to getManageable). That seam is the
 *     authorisation SSoT, so we test it directly with the repo's buildFakeDb
 *     — forbidden vs allowed across self / company-member / delegated-grant —
 *     against real Drizzle predicates. (CohortService can't be driven
 *     end-to-end here because getManageable reaches getDb() internally rather
 *     than the constructor-injected db — see "Deferred" note at the bottom.)
 *
 *  2. AUTHOR ELIGIBILITY. resolveAuthorEligibility — the single seam deciding
 *     who may author cohorts/courses/paths — is db-injected and tested
 *     directly: employer role, active creator-program, and the refusal path.
 *
 *  3. DATA OPS that don't touch the getDb() seam: CohortService.joinByCode
 *     (self-service, idempotent) and activeMemberUserIds (assignment fan-out
 *     source), driven through the constructor-injected fake-db.
 *
 * Cohort-analytics aggregation correctness lives in cohort-analytics.test.ts.
 *
 * Run: node --import tsx --test src/services/learning/__tests__/cohort-classroom.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { canActFor, assertCanWrite, WorkspaceForbiddenError } from "../../studio/workspace.js";
import { resolveAuthorEligibility } from "../author-eligibility.js";
import { CohortService } from "../cohort-service.js";
import { USER_ROLES } from "../../../../../shared/user-roles.js";

// Seed-derived-shaped UUIDs (the columns canActFor/joinByCode actually read).
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_COMPANY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// ── 1. THE GATE — canActFor / assertCanWrite ─────────────────────────────

describe("cohort gate — canActFor (the seam every cohort mutation routes through)", () => {
  it("ALLOWS the owner acting on their own personal cohort (self)", async () => {
    const { db } = buildFakeDb({});
    const ok = await canActFor(ACTOR, ACTOR, null, { db: db as never });
    assert.equal(ok, true);
  });

  it("FORBIDS a stranger acting on someone else's personal cohort", async () => {
    const { db } = buildFakeDb({ workspace_grants: [] });
    const ok = await canActFor(ACTOR, OWNER, null, { db: db as never });
    assert.equal(ok, false);
  });

  it("ALLOWS a company member to manage a company-owned cohort (owner of company)", async () => {
    const { db } = buildFakeDb({
      company_profiles: [{ id: COMPANY, ownerId: ACTOR }],
      user_company_role_associations: [],
    });
    const ok = await canActFor(ACTOR, OWNER, COMPANY, { db: db as never });
    assert.equal(ok, true);
  });

  it("ALLOWS a company member via an active role association", async () => {
    const { db } = buildFakeDb({
      company_profiles: [{ id: COMPANY, ownerId: "someone-else" }],
      user_company_role_associations: [
        { id: "uca-1", userId: ACTOR, companyId: COMPANY, isActive: true },
      ],
    });
    const ok = await canActFor(ACTOR, OWNER, COMPANY, { db: db as never });
    assert.equal(ok, true);
  });

  it("FORBIDS a non-member on a company-owned cohort (membership is the gate)", async () => {
    const { db } = buildFakeDb({
      company_profiles: [{ id: COMPANY, ownerId: "someone-else" }],
      user_company_role_associations: [
        // active membership but for a DIFFERENT company
        { id: "uca-2", userId: ACTOR, companyId: OTHER_COMPANY, isActive: true },
      ],
      workspace_grants: [],
    });
    const ok = await canActFor(ACTOR, OWNER, COMPANY, { db: db as never });
    assert.equal(ok, false);
  });

  it("FORBIDS a member whose association is INACTIVE", async () => {
    const { db } = buildFakeDb({
      company_profiles: [{ id: COMPANY, ownerId: "someone-else" }],
      user_company_role_associations: [
        { id: "uca-3", userId: ACTOR, companyId: COMPANY, isActive: false },
      ],
      workspace_grants: [],
    });
    const ok = await canActFor(ACTOR, OWNER, COMPANY, { db: db as never });
    assert.equal(ok, false);
  });

  it("ALLOWS a delegated editor via an active studio workspace grant", async () => {
    const { db } = buildFakeDb({
      workspace_grants: [
        {
          id: "g-1",
          subjectUserId: OWNER,
          contributorUserId: ACTOR,
          scope: "studio",
          isActive: true,
          expiresAt: null,
        },
      ],
    });
    const ok = await canActFor(ACTOR, OWNER, null, { db: db as never });
    assert.equal(ok, true);
  });

  it("FORBIDS a delegated grant for the WRONG scope / contributor / when inactive", async () => {
    const base = {
      id: "g-2",
      subjectUserId: OWNER,
      contributorUserId: ACTOR,
      scope: "studio",
      isActive: true,
      expiresAt: null,
    };
    // wrong scope
    let { db } = buildFakeDb({ workspace_grants: [{ ...base, scope: "resume" }] });
    assert.equal(await canActFor(ACTOR, OWNER, null, { db: db as never }), false);
    // wrong contributor
    ({ db } = buildFakeDb({ workspace_grants: [{ ...base, contributorUserId: "someone-else" }] }));
    assert.equal(await canActFor(ACTOR, OWNER, null, { db: db as never }), false);
    // inactive
    ({ db } = buildFakeDb({ workspace_grants: [{ ...base, isActive: false }] }));
    assert.equal(await canActFor(ACTOR, OWNER, null, { db: db as never }), false);
  });
});

describe("cohort gate — assertCanWrite (throws WorkspaceForbiddenError on deny)", () => {
  it("throws for a stranger and is silent for the owner", async () => {
    const { db } = buildFakeDb({ workspace_grants: [] });
    await assert.rejects(
      () => assertCanWrite(ACTOR, OWNER, null, { db: db as never }),
      (e) => e instanceof WorkspaceForbiddenError && e.code === "WORKSPACE_FORBIDDEN",
    );
    // owner is allowed — resolves without throwing
    await assertCanWrite(ACTOR, ACTOR, null, { db: db as never });
  });
});

// ── 2. AUTHOR ELIGIBILITY — resolveAuthorEligibility ──────────────────────

describe("resolveAuthorEligibility — who may author a cohort/course/path", () => {
  it("REFUSES an anonymous (null userId) caller", async () => {
    const { db } = buildFakeDb({ creator_profiles: [] });
    const r = await resolveAuthorEligibility(db as never, null, []);
    assert.deepEqual(r, { ok: false });
  });

  it("ALLOWS an employer and stamps isEmployerAuthored=true (no DB read needed)", async () => {
    const { db } = buildFakeDb({ creator_profiles: [] });
    const r = await resolveAuthorEligibility(db as never, ACTOR, [USER_ROLES.EMPLOYER]);
    assert.deepEqual(r, { ok: true, isEmployerAuthored: true });
  });

  it("ALLOWS an active creator-program (courses) author as NON-employer-authored", async () => {
    const { db } = buildFakeDb({
      creator_profiles: [
        { id: "cp-1", userId: ACTOR, endedAt: null, coursesActive: true },
      ],
    });
    const r = await resolveAuthorEligibility(db as never, ACTOR, [USER_ROLES.JOB_SEEKER]);
    assert.deepEqual(r, { ok: true, isEmployerAuthored: false });
  });

  it("REFUSES a creator whose courses program is NOT active", async () => {
    const { db } = buildFakeDb({
      creator_profiles: [
        { id: "cp-2", userId: ACTOR, endedAt: null, coursesActive: false },
      ],
    });
    const r = await resolveAuthorEligibility(db as never, ACTOR, [USER_ROLES.JOB_SEEKER]);
    assert.deepEqual(r, { ok: false });
  });

  it("REFUSES a non-employer, non-creator user", async () => {
    const { db } = buildFakeDb({ creator_profiles: [] });
    const r = await resolveAuthorEligibility(db as never, ACTOR, [USER_ROLES.RECRUITER]);
    assert.deepEqual(r, { ok: false });
  });
});

// ── 3. DATA OPS — joinByCode + activeMemberUserIds (no getDb seam) ────────

const COHORT_ID = "11111111-1111-4111-8111-111111111111";
const LEARNER = "22222222-2222-4222-8222-222222222222";
const LEARNER_2 = "33333333-3333-4333-8333-333333333333";

describe("CohortService.joinByCode — self-service enrolment", () => {
  it("creates an active membership when a learner joins by a valid code", async () => {
    const { db, state } = buildFakeDb({
      learning_cohorts: [
        { id: COHORT_ID, ownerUserId: OWNER, ownerCompanyId: null, name: "Algebra I", joinCode: "ABCD2345", status: "active" },
      ],
      cohort_members: [],
    });
    const svc = new CohortService(db as never);
    const { cohort, member } = await svc.joinByCode(LEARNER, "abcd2345"); // lower-cased input is upper-cased
    assert.equal(cohort.id, COHORT_ID);
    assert.equal(member.userId, LEARNER);
    assert.equal(member.status, "active");
    assert.equal(member.role, "student");
    assert.equal(state.cohort_members.length, 1);
  });

  it("rejects an unknown / inactive join code (CohortNotFoundError)", async () => {
    const { db } = buildFakeDb({
      learning_cohorts: [
        { id: COHORT_ID, ownerUserId: OWNER, ownerCompanyId: null, name: "Archived", joinCode: "ZZZZ9999", status: "archived" },
      ],
      cohort_members: [],
    });
    const svc = new CohortService(db as never);
    await assert.rejects(() => svc.joinByCode(LEARNER, "NOPE0000"), /No active cohort matches that join code/);
    // The right code but an archived cohort is ALSO rejected (status gate).
    await assert.rejects(() => svc.joinByCode(LEARNER, "ZZZZ9999"), /No active cohort/);
  });

  it("is idempotent — re-joining an already-active membership is a no-op (no duplicate row)", async () => {
    const { db, state } = buildFakeDb({
      learning_cohorts: [
        { id: COHORT_ID, ownerUserId: OWNER, ownerCompanyId: null, name: "Algebra I", joinCode: "ABCD2345", status: "active" },
      ],
      cohort_members: [
        { id: "m-1", cohortId: COHORT_ID, userId: LEARNER, role: "student", status: "active", joinedAt: new Date() },
      ],
    });
    const svc = new CohortService(db as never);
    const { member } = await svc.joinByCode(LEARNER, "ABCD2345");
    assert.equal(member.id, "m-1");
    assert.equal(state.cohort_members.length, 1, "no duplicate membership created");
  });

  it("reactivates a previously-removed membership rather than inserting a new one", async () => {
    const { db, state } = buildFakeDb({
      learning_cohorts: [
        { id: COHORT_ID, ownerUserId: OWNER, ownerCompanyId: null, name: "Algebra I", joinCode: "ABCD2345", status: "active" },
      ],
      cohort_members: [
        { id: "m-removed", cohortId: COHORT_ID, userId: LEARNER, role: "student", status: "removed", joinedAt: null },
      ],
    });
    const svc = new CohortService(db as never);
    const { member } = await svc.joinByCode(LEARNER, "ABCD2345");
    assert.equal(member.id, "m-removed");
    assert.equal(member.status, "active");
    assert.equal(state.cohort_members.length, 1, "reactivated in place");
  });
});

describe("CohortService.activeMemberUserIds — assignment fan-out source", () => {
  it("returns only the active, identity-linked member userIds", async () => {
    const { db } = buildFakeDb({
      cohort_members: [
        { id: "m1", cohortId: COHORT_ID, userId: LEARNER, status: "active" },
        { id: "m2", cohortId: COHORT_ID, userId: LEARNER_2, status: "active" },
        { id: "m3", cohortId: COHORT_ID, userId: "removed-user", status: "removed" },
        { id: "m4", cohortId: COHORT_ID, userId: "invited-user", status: "invited" },
        // active but unlinked placeholder (userId null) — excluded from fan-out
        { id: "m5", cohortId: COHORT_ID, userId: null, status: "active" },
      ],
    });
    const svc = new CohortService(db as never);
    const ids = await svc.activeMemberUserIds(COHORT_ID);
    assert.deepEqual([...ids].sort(), [LEARNER, LEARNER_2].sort());
  });

  it("returns an empty list for a cohort with no active members", async () => {
    const { db } = buildFakeDb({ cohort_members: [] });
    const svc = new CohortService(db as never);
    assert.deepEqual(await svc.activeMemberUserIds(COHORT_ID), []);
  });
});
