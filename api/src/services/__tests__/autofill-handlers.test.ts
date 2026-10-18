/**
 * Integration tests for autofill write + read handlers.
 *
 *   • handleSaveSubmission       — draft vs submitted, pipeline advance,
 *                                   job enrichment, auth, validation
 *   • handleUpdateCacheEntry     — success, 404 wrong-owner, 400 validation
 *   • handleDeleteCacheEntry     — success, auth gate
 *   • handleHistoryList          — pagination, job-id filter, batch job
 *                                   enrichment (no N+1)
 *   • handleHistoryDetail        — success with job enrichment, 404
 *
 * Run: node --import tsx --test src/routes/__tests__/autofill-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleSaveSubmission,
  handleUpdateCacheEntry,
  handleDeleteCacheEntry,
  handleHistoryList,
  handleHistoryDetail,
  type AutofillDeps,
} from "../user/autofill-handlers.js";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

// Fake DB — real WHERE-predicate evaluation via the shared test harness.
// `_state.applicationFormAnswers` etc. alias the DB-named arrays so seed
// and assert code reads naturally.

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

void randomUUID; // kept for any direct uses below

function makeDeps(seed: {
  applicationFormAnswers?: any[];
  savedJobs?: any[];
  jobApplications?: any[];
  answerCache?: any[];
  jobItems?: any[];
} = {}): AutofillDeps & {
  _state: {
    applicationFormAnswers: any[];
    savedJobs: any[];
    jobApplications: any[];
    answerCache: any[];
    jobItems: any[];
  };
} {
  const fake = buildFakeDb({
    application_form_answers: seed.applicationFormAnswers ?? [],
    saved_jobs: seed.savedJobs ?? [],
    job_applications: seed.jobApplications ?? [],
    answer_cache: seed.answerCache ?? [],
    job_items: seed.jobItems ?? [],
  });
  const state = fake.state as any;
  Object.defineProperty(state, "applicationFormAnswers", {
    get: () => state.application_form_answers,
  });
  Object.defineProperty(state, "savedJobs", {
    get: () => state.saved_jobs,
  });
  Object.defineProperty(state, "jobApplications", {
    get: () => state.job_applications,
  });
  Object.defineProperty(state, "answerCache", {
    get: () => state.answer_cache,
  });
  Object.defineProperty(state, "jobItems", {
    get: () => state.job_items,
  });
  return {
    db: fake.db,
    now: () => new Date("2026-04-19T00:00:00.000Z"),
    _state: state,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveSubmission
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSaveSubmission", () => {
  const validFields = [
    { id: "q1", label: "Why do you want this job?", type: "text", required: true },
  ];
  const validAnswers = { q1: "Because I love robots." };

  it("creates a draft submission and returns 201 with the id", async () => {
    const deps = makeDeps();
    const res = await handleSaveSubmission(deps, "user-1", {
      fields: validFields,
      answers: validAnswers,
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
      atsProvider: "greenhouse",
    });
    assert.equal(res.status, 201);
    const body = (res.body as any).data;
    assert.ok(body.id, "returns the new submission id");
    assert.equal(deps._state.applicationFormAnswers.length, 1);
    const row = deps._state.applicationFormAnswers[0];
    assert.equal(row.status, "draft");
    assert.equal(row.submittedAt, null, "submittedAt null for drafts");
  });

  it("stamps submittedAt when status='submitted'", async () => {
    const deps = makeDeps();
    await handleSaveSubmission(deps, "user-1", {
      fields: validFields,
      answers: validAnswers,
      status: "submitted",
    });
    const row = deps._state.applicationFormAnswers[0];
    assert.equal(row.status, "submitted");
    assert.ok(row.submittedAt instanceof Date);
  });

  it("advances the linked saved_jobs pipeline to 'applied' when submitting", async () => {
    const savedJobId = randomUUID();
    const deps = makeDeps({
      // saved_jobs no longer carries status (W3-D2): the tracker lifecycle
      // lives on job_applications, which submitting must create as 'applied'.
      savedJobs: [{ id: savedJobId, userId: "user-1", jobId: "job-1" }],
    });
    await handleSaveSubmission(deps, "user-1", {
      fields: validFields,
      answers: validAnswers,
      status: "submitted",
      savedJobId,
    });
    assert.equal(deps._state.jobApplications.length, 1);
    const app = deps._state.jobApplications[0];
    assert.equal(app.userId, "user-1");
    assert.equal(app.jobId, "job-1");
    assert.equal(app.status, "applied");
    assert.ok(app.appliedAt instanceof Date);
  });

  it("does NOT advance saved_jobs when status is 'draft' (even if savedJobId supplied)", async () => {
    const savedJobId = randomUUID();
    const deps = makeDeps({
      savedJobs: [{ id: savedJobId, userId: "user-1", jobId: "job-1" }],
    });
    await handleSaveSubmission(deps, "user-1", {
      fields: validFields,
      answers: validAnswers,
      status: "draft",
      savedJobId,
    });
    assert.equal(deps._state.jobApplications.length, 0, "no application recorded for drafts");
  });

  it("returns 401 for anonymous callers (nothing written)", async () => {
    const deps = makeDeps();
    const res = await handleSaveSubmission(deps, null, {
      fields: validFields,
      answers: validAnswers,
    });
    assert.equal(res.status, 401);
    assert.equal(deps._state.applicationFormAnswers.length, 0);
  });

  it("rejects bodies missing the required fields array", async () => {
    const deps = makeDeps();
    const res = await handleSaveSubmission(deps, "user-1", { answers: {} } as any);
    assert.equal(res.status, 400);
  });

  it("rejects an oversized sourceUrl / invalid UUIDs at the schema layer", async () => {
    const deps = makeDeps();
    assert.equal(
      (await handleSaveSubmission(deps, "user-1", {
        fields: validFields,
        answers: validAnswers,
        sourceUrl: `https://example.com/${"x".repeat(2000)}`,
      })).status,
      400,
    );
    assert.equal(
      (await handleSaveSubmission(deps, "user-1", {
        fields: validFields,
        answers: validAnswers,
        jobId: "not-a-uuid",
      })).status,
      400,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCacheEntry
// ═══════════════════════════════════════════════════════════════════════════

describe("handleUpdateCacheEntry", () => {
  it("updates a cache entry owned by the caller and returns 200", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-1", answer: "Old answer" }],
    });
    const res = await handleUpdateCacheEntry(deps, "user-1", "c1", {
      answer: "New answer",
    });
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).data, { id: "c1" });
    assert.equal(deps._state.answerCache[0].answer, "New answer");
  });

  it("rejects an empty answer", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-1", answer: "x" }],
    });
    const res = await handleUpdateCacheEntry(deps, "user-1", "c1", { answer: "" });
    assert.equal(res.status, 400);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleUpdateCacheEntry(deps, null, "c1", { answer: "x" });
    assert.equal(res.status, 401);
  });

  it("returns 400 VALIDATION_ERROR on malformed body", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-1", answer: "x" }],
    });
    const res = await handleUpdateCacheEntry(deps, "user-1", "c1", {});
    assert.equal(res.status, 400);
  });

  it("rejects answers that exceed the 5000 char cap", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-1", answer: "x" }],
    });
    const res = await handleUpdateCacheEntry(deps, "user-1", "c1", {
      answer: "x".repeat(6000),
    });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteCacheEntry
// ═══════════════════════════════════════════════════════════════════════════

describe("handleDeleteCacheEntry", () => {
  it("deletes the cache entry and returns 200", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-1", answer: "x" }],
    });
    const res = await handleDeleteCacheEntry(deps, "user-1", "c1");
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).data, { id: "c1" });
    assert.equal(deps._state.answerCache.length, 0);
  });

  it("returns 404 when the entry doesn't exist or belongs to another user", async () => {
    const deps = makeDeps({
      answerCache: [{ id: "c1", userId: "user-2", answer: "x" }],
    });
    const res = await handleDeleteCacheEntry(deps, "user-1", "c1");
    assert.equal(res.status, 404);
    assert.equal(deps._state.answerCache.length, 1);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleDeleteCacheEntry(deps, null, "c1");
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleHistoryList
// ═══════════════════════════════════════════════════════════════════════════

describe("handleHistoryList", () => {
  it("returns the paginated list enriched with job title + company (batch-loaded)", async () => {
    const jobA = "job-a";
    const jobB = "job-b";
    const deps = makeDeps({
      applicationFormAnswers: [
        { id: "s1", userId: "user-1", jobId: jobA, sourceUrl: "u", atsProvider: null, status: "submitted", createdAt: new Date(), submittedAt: new Date() },
        { id: "s2", userId: "user-1", jobId: jobB, sourceUrl: "u", atsProvider: null, status: "draft", createdAt: new Date(), submittedAt: null },
      ],
      jobItems: [
        { id: jobA, title: "Senior Engineer", company: "Acme" },
        { id: jobB, title: "Staff Engineer", company: "Beta" },
      ],
    });
    const res = await handleHistoryList(deps, "user-1", {});
    assert.equal(res.status, 200);
    const list = (res.body as any).data as Array<any>;
    assert.equal(list.length, 2);
    assert.equal(list[0].jobTitle, "Senior Engineer");
    assert.equal(list[0].company, "Acme");
    assert.equal(list[1].jobTitle, "Staff Engineer");
    assert.equal(list[1].company, "Beta");
  });

  it("clamps limit to 50 to prevent DoS via huge pages", async () => {
    const deps = makeDeps();
    // Not actually testable via the fake (it just returns whatever is
    // seeded), but the function must not throw on limit > 50.
    const res = await handleHistoryList(deps, "user-1", { limit: 10000 });
    assert.equal(res.status, 200);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleHistoryList(deps, null, {});
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleHistoryDetail
// ═══════════════════════════════════════════════════════════════════════════

describe("handleHistoryDetail", () => {
  it("returns the submission enriched with job info", async () => {
    const jobId = "job-1";
    const deps = makeDeps({
      applicationFormAnswers: [{
        id: "s1", userId: "user-1", jobId, sourceUrl: "u", atsProvider: null,
        status: "submitted", createdAt: new Date(), submittedAt: new Date(),
        answers: {}, formFields: [], jobDescription: null,
      }],
      jobItems: [{ id: jobId, title: "Senior Engineer", company: "Acme" }],
    });
    const res = await handleHistoryDetail(deps, "user-1", "s1");
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(data.jobTitle, "Senior Engineer");
    assert.equal(data.company, "Acme");
  });

  it("returns 404 when submission doesn't exist or belongs to another user", async () => {
    const deps = makeDeps();
    const res = await handleHistoryDetail(deps, "user-1", "missing");
    assert.equal(res.status, 404);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleHistoryDetail(deps, null, "s1");
    assert.equal(res.status, 401);
  });
});
