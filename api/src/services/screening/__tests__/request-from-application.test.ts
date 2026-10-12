// resolveApplicationForScreening (#1855) — assembles the candidate + company
// context needed to send a screening straight from a job application, so the
// recruiter doesn't re-type the email. The fake-db ignores WHERE clauses and
// returns seeded rows by table, so each case seeds exactly one row per table.

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveApplicationForScreening } from "../request-service.js";
import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";

describe("resolveApplicationForScreening (#1855)", () => {
  it("returns null when the application doesn't exist", async () => {
    const { db } = buildFakeDb({ job_applications: [] });
    const out = await resolveApplicationForScreening(db as any, "missing-id");
    assert.equal(out, null);
  });

  it("assembles candidate email + name + company from the application's job", async () => {
    const { db } = buildFakeDb({
      job_applications: [{ id: "app-1", userId: "user-1", jobId: "job-1" }],
      users: [{ id: "user-1", email: "cand@example.com", name: "Cand Idate" }],
      job_items: [{ id: "job-1", companyId: "co-1" }],
    });
    const out = await resolveApplicationForScreening(db as any, "app-1");
    assert.ok(out);
    assert.equal(out!.applicationId, "app-1");
    assert.equal(out!.jobId, "job-1");
    assert.equal(out!.companyId, "co-1");
    assert.equal(out!.candidateUserId, "user-1");
    assert.equal(out!.candidateEmail, "cand@example.com");
    assert.equal(out!.candidateName, "Cand Idate");
  });

  it("companyId is null when the job has no company (legacy posting → route 409s)", async () => {
    const { db } = buildFakeDb({
      job_applications: [{ id: "app-2", userId: "user-2", jobId: "job-2" }],
      users: [{ id: "user-2", email: "x@y.com", name: "X" }],
      job_items: [{ id: "job-2", companyId: null }],
    });
    const out = await resolveApplicationForScreening(db as any, "app-2");
    assert.ok(out);
    assert.equal(out!.companyId, null);
  });
});
