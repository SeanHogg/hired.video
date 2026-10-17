/**
 * Candidate video consent (migration 0534): the SQL, the Drizzle schema and
 * the shared vocabulary agree, and the shared request / respond schemas
 * accept real-shaped bodies, hold their boundaries and reject junk.
 *
 * Run: node --import tsx --test src/db/__tests__/candidate-video-consent-schema.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { candidateVideoConsents } from "../schema/candidate-video-consents.js";
import {
  CANDIDATE_VIDEO_CONSENT_STATUSES,
  RequestCandidateVideoConsentSchema,
  RespondCandidateVideoConsentSchema,
} from "../../../../shared/candidate-video-consent.js";
import { STUDIO_SUBJECT_KINDS, STUDIO_SUBJECT_LABEL, studioSubjectHref } from "../../../../shared/studio-subject.js";

const SQL_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle/0534_candidate_video_consents.sql");
const sql = readFileSync(SQL_PATH, "utf8").replace(/--[^\n]*/g, "");

const quotedList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

describe("0534_candidate_video_consents.sql", () => {
  it("is idempotent and has no BEGIN/COMMIT", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS candidate_video_consents/);
    assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'candidate_video_consents_status_check'\)/);
    assert.doesNotMatch(sql, /^\s*BEGIN\s*;/m);
    assert.doesNotMatch(sql, /^\s*COMMIT\s*;/m);
    for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX (\S+)/g)) {
      assert.equal(m[1], "IF", `index without IF NOT EXISTS: ${m[0]}`);
    }
  });

  it("status CHECK lists exactly the shared statuses (SQL + Drizzle)", () => {
    assert.ok(sql.includes(`CHECK (status IN (${quotedList(CANDIDATE_VIDEO_CONSENT_STATUSES)}))`));
    const checks = getTableConfig(candidateVideoConsents).checks;
    assert.deepEqual(checks.map((c) => c.name), ["candidate_video_consents_status_check"]);
  });

  it("stores a sha256 hex hash, never a raw token column", () => {
    assert.match(sql, /token_hash varchar\(64\) NOT NULL/);
    assert.doesNotMatch(sql, /\btoken varchar|\btoken text/);
    const cols = getTableConfig(candidateVideoConsents).columns.map((c) => c.name);
    assert.ok(cols.includes("token_hash"));
    assert.ok(!cols.includes("token"));
  });

  it("FKs: project + recruiter cascade, talent-pool row + approved video set null", () => {
    assert.match(sql, /project_id uuid NOT NULL REFERENCES studio_projects\(id\) ON DELETE CASCADE/);
    assert.match(sql, /recruiter_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    assert.match(sql, /talent_pool_candidate_id uuid REFERENCES talent_pool_candidates\(id\) ON DELETE SET NULL/);
    assert.match(sql, /approved_video_id uuid REFERENCES videos\(id\) ON DELETE SET NULL/);
    const fks = getTableConfig(candidateVideoConsents).foreignKeys.map((fk) => fk.onDelete).sort();
    assert.deepEqual(fks, ["cascade", "cascade", "set null", "set null"]);
  });

  it("SQL and Drizzle declare the same columns (approval pin + withdrawal included)", () => {
    const body = sql.match(/CREATE TABLE IF NOT EXISTS candidate_video_consents \(([\s\S]*?)\r?\n\);/)?.[1] ?? "";
    const sqlCols = [...body.matchAll(/^\s+([a-z0-9_]+) /gm)].map((m) => m[1]).sort();
    const drizzleCols = getTableConfig(candidateVideoConsents).columns.map((c) => c.name).sort();
    assert.deepEqual(sqlCols, drizzleCols);
    for (const col of ["approved_video_id", "approved_video_r2_key", "approved_revision", "withdrawn_at"]) {
      assert.ok(drizzleCols.includes(col), col);
    }
  });

  it("every index it creates is declared in the schema under the same name", () => {
    const declared = new Map(getTableConfig(candidateVideoConsents).indexes.map((i) => [i.config.name, i.config]));
    const created = [...sql.matchAll(/CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+)/g)].map((m) => ({ unique: !!m[1], name: m[2] }));
    // Later migrations may add more (0547 adds the FK indexes), so 0534's set
    // must be a subset of what the schema declares — push --force drops the rest.
    for (const c of created) {
      assert.ok(declared.has(c.name), `${c.name} is declared`);
      assert.equal(!!declared.get(c.name)?.unique, c.unique, c.name);
    }
  });
});

describe("talent_pool_candidate studio subject", () => {
  it("is a subject kind with a label and an owner-only href", () => {
    assert.ok((STUDIO_SUBJECT_KINDS as readonly string[]).includes("talent_pool_candidate"));
    assert.equal(STUDIO_SUBJECT_LABEL.talent_pool_candidate, "Candidate Reel");
    assert.equal(
      studioSubjectHref({ kind: "talent_pool_candidate", id: "4b5c6d7e-8f90-4a1b-9c2d-3e4f5a6b7c8d" }),
      "/services/candidates/4b5c6d7e-8f90-4a1b-9c2d-3e4f5a6b7c8d",
    );
  });
});

describe("RequestCandidateVideoConsentSchema", () => {
  const projectId = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

  it("accepts a pool-backed request and a manual one (email normalised)", () => {
    assert.ok(RequestCandidateVideoConsentSchema.safeParse({ projectId, talentPoolCandidateId: "4b5c6d7e-8f90-4a1b-9c2d-3e4f5a6b7c8d" }).success);
    const manual = RequestCandidateVideoConsentSchema.parse({
      projectId,
      candidateName: "  Dana Whitfield ",
      candidateEmail: " Dana.Whitfield@Example.com ",
      message: "Thanks for the great conversation about the analyst role!",
    });
    assert.equal(manual.candidateName, "Dana Whitfield");
    assert.equal(manual.candidateEmail, "dana.whitfield@example.com");
  });

  it("holds its boundaries (name 255, message 1000)", () => {
    assert.ok(RequestCandidateVideoConsentSchema.safeParse({ projectId, candidateName: "a".repeat(255) }).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({ projectId, candidateName: "a".repeat(256) }).success);
    assert.ok(RequestCandidateVideoConsentSchema.safeParse({ projectId, message: "m".repeat(1000) }).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({ projectId, message: "m".repeat(1001) }).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({ projectId, candidateName: "   " }).success);
  });

  it("rejects a missing / malformed project id and a bad email", () => {
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({}).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({ projectId: "project-1" }).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse({ projectId, candidateEmail: "dana@" }).success);
    assert.ok(!RequestCandidateVideoConsentSchema.safeParse(null).success);
  });
});

describe("RespondCandidateVideoConsentSchema", () => {
  it("accepts approve / decline / revoke only", () => {
    assert.ok(RespondCandidateVideoConsentSchema.safeParse({ decision: "approve" }).success);
    assert.ok(RespondCandidateVideoConsentSchema.safeParse({ decision: "decline" }).success);
    assert.ok(RespondCandidateVideoConsentSchema.safeParse({ decision: "revoke" }).success);
    for (const bad of [{ decision: "approved" }, { decision: "withdraw" }, { decision: "" }, {}, null]) {
      assert.ok(!RespondCandidateVideoConsentSchema.safeParse(bad).success, JSON.stringify(bad));
    }
  });
});
