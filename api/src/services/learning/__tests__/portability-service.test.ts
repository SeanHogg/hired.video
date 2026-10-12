/**
 * Tenant learning portability tests (#2281) — export/import migration story.
 *
 * Covers: manifest shape + per-course aggregation + owner scoping; results CSV
 * (escaping, empty case, email/title resolution); statements export combining
 * the platform LRS + internal store with owner scoping and the truncation flag;
 * bulk import round-tripping through the shared LRS write core.
 *
 * Run: node --import tsx --test src/services/learning/__tests__/portability-service.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import {
  exportManifest,
  exportResultsCsv,
  exportStatements,
  importStatements,
  csvCell,
  toCsv,
} from "../portability-service.js";
import type { ResolvedLrsCredential } from "../lrs-service.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-0000-4000-8000-000000000001";
const C2 = "aaaaaaaa-0000-4000-8000-000000000002";

const AT = "2026-07-04T00:00:00.000Z";

function seed() {
  return buildFakeDb({
    courses: [
      { id: C1, userId: OWNER, slug: "safety-101", title: "Safety, 101", status: "published" },
      { id: C2, userId: OWNER, slug: "ethics", title: "Ethics", status: "draft" },
      { id: "zzzz", userId: OTHER, slug: "other", title: "Other Co Course", status: "published" },
    ],
    course_enrollments: [
      { id: "e1", courseId: C1, userId: "u-a", enrolledAt: new Date(AT), completedAt: new Date(AT), finalScorePct: 90, passed: true },
      { id: "e2", courseId: C1, userId: "u-b", enrolledAt: new Date(AT), completedAt: null, finalScorePct: 40, passed: false },
      { id: "e3", courseId: C2, userId: "u-a", enrolledAt: new Date(AT), completedAt: null, finalScorePct: null, passed: false },
      { id: "e-other", courseId: "zzzz", userId: "u-c", enrolledAt: new Date(AT), completedAt: null, finalScorePct: 10, passed: false },
    ],
    course_certificates: [{ id: "cert1", courseId: C1, userId: "u-a", certNumber: "CN-1" }],
    users: [
      { id: "u-a", email: "a@acme.com" },
      { id: "u-b", email: "b@acme.com" },
      { id: "u-c", email: "c@other.com" },
    ],
    lrs_credentials: [
      { id: "cred-owner", ownerUserId: OWNER, ownerCompanyId: null, permission: "read_write", active: true },
      { id: "cred-other", ownerUserId: OTHER, ownerCompanyId: null, permission: "read_write", active: true },
    ],
    lrs_statements: [
      { id: "s1", credentialId: "cred-owner", actorIfi: "mbox::mailto:a@acme.com", verbId: "v", voided: false, statement: { id: "s1", verb: { id: "v" } } },
      { id: "s2", credentialId: "cred-owner", actorIfi: "mbox::mailto:a@acme.com", verbId: "v", voided: true, statement: { id: "s2" } },
      { id: "s3", credentialId: "cred-other", actorIfi: "x", verbId: "v", voided: false, statement: { id: "s3" } },
    ],
    xapi_statements: [
      { id: "i1", userId: "u-a", courseId: C1, verbId: "v", statement: { id: "i1", verb: { id: "v" } } },
      { id: "i2", userId: "u-c", courseId: "zzzz", verbId: "v", statement: { id: "i2" } },
    ],
  });
}

// ── pure CSV helpers ──────────────────────────────────────────────────────────
describe("csv helpers", () => {
  it("quotes cells with commas, quotes, or newlines", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
    assert.equal(csvCell(null), "");
  });
  it("toCsv joins header + rows with CRLF", () => {
    assert.equal(toCsv(["a", "b"], [[1, 2], [3, 4]]), "a,b\r\n1,2\r\n3,4");
  });
});

// ── manifest ──────────────────────────────────────────────────────────────────
describe("exportManifest", () => {
  it("summarizes only the owner's courses with per-course aggregation", async () => {
    const { db } = seed();
    const m = await exportManifest(OWNER, AT, db as never);
    assert.equal(m.format, "hired.video/learning-export");
    assert.equal(m.exportedAt, AT);
    assert.equal(m.courses.length, 2, "excludes the other owner's course");
    const safety = m.courses.find((c) => c.id === C1)!;
    assert.equal(safety.enrollments, 2);
    assert.equal(safety.passed, 1);
    const ethics = m.courses.find((c) => c.id === C2)!;
    assert.equal(ethics.enrollments, 1);
    assert.equal(ethics.passed, 0);
    assert.deepEqual(m.totals, { courses: 2, enrollments: 3, certificates: 1 });
  });

  it("returns an empty manifest for an owner with no courses", async () => {
    const { db } = seed();
    const m = await exportManifest("nobody", AT, db as never);
    assert.equal(m.courses.length, 0);
    assert.deepEqual(m.totals, { courses: 0, enrollments: 0, certificates: 0 });
  });
});

// ── results CSV ───────────────────────────────────────────────────────────────
describe("exportResultsCsv", () => {
  it("emits a header + one row per enrollment across the owner's courses, escaped", async () => {
    const { db } = seed();
    const csv = await exportResultsCsv(OWNER, db as never);
    const lines = csv.split("\r\n");
    assert.equal(lines[0], "course_id,course_title,learner_user_id,learner_email,enrolled_at,completed_at,final_score_pct,passed");
    assert.equal(lines.length, 4, "header + 3 owner enrollments (other-co excluded)");
    // "Safety, 101" contains a comma → must be quoted.
    assert.ok(lines.some((l) => l.includes('"Safety, 101"')));
    assert.ok(lines.some((l) => l.includes("a@acme.com") && l.endsWith(",true")));
  });

  it("returns just the header for an owner with no courses", async () => {
    const { db } = seed();
    const csv = await exportResultsCsv("nobody", db as never);
    assert.equal(csv.split("\r\n").length, 1);
  });
});

// ── statements export ─────────────────────────────────────────────────────────
describe("exportStatements", () => {
  it("combines the owner's LRS statements (non-voided) + internal store, scoped", async () => {
    const { db } = seed();
    const out = await exportStatements(OWNER, db as never);
    const ids = out.statements.map((s) => (s as any).id).sort();
    // s1 (owner LRS, non-voided) + i1 (internal, owner course). s2 voided, s3/i2 other owner.
    assert.deepEqual(ids, ["i1", "s1"]);
    assert.equal(out.count, 2);
    assert.equal(out.truncated, false);
  });

  it("scopes strictly to the owner (no cross-tenant leak)", async () => {
    const { db } = seed();
    const out = await exportStatements(OTHER, db as never);
    const ids = out.statements.map((s) => (s as any).id).sort();
    assert.deepEqual(ids, ["i2", "s3"]);
  });
});

// ── bulk import ───────────────────────────────────────────────────────────────
describe("importStatements", () => {
  const CRED: ResolvedLrsCredential = {
    credentialId: "cred-owner", ownerUserId: OWNER, ownerCompanyId: null, permission: "read_write",
  };
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
    actor: { mbox: `mailto:l${i}@acme.com` },
    verb: { id: "http://adlnet.gov/expapi/verbs/completed" },
    object: { id: `https://act/${i}`, objectType: "Activity" },
  }));

  it("ingests an xAPI array through the shared LRS write core", async () => {
    const { db, state } = buildFakeDb({ lrs_statements: [] });
    const res = await importStatements(CRED, mk(3), db as never);
    assert.equal(res.imported, 3);
    assert.equal(state.lrs_statements.length, 3);
    assert.equal(state.lrs_statements[0]!.credentialId, "cred-owner");
  });

  it("chunks a large import (> chunk size) without dropping any", async () => {
    const { db, state } = buildFakeDb({ lrs_statements: [] });
    const res = await importStatements(CRED, mk(1200), db as never);
    assert.equal(res.imported, 1200);
    assert.equal(state.lrs_statements.length, 1200);
  });
});
