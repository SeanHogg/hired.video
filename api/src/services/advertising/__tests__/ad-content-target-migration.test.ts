/**
 * #176 — mig 0516 (ads target any content) + the one target resolver.
 *
 * Guards:
 *   • the CHECK lists in the migration and the Drizzle schema are exactly
 *     AD_SUBJECT_TYPES, under the same constraint names;
 *   • the migration is additive: it never drops or rewrites job_id /
 *     company_id, and its backfill writes only the new columns of rows that
 *     are still unstamped (idempotent);
 *   • the backfill, applied to fixtures shaped like production rows,
 *     leaves every row resolving to the same target it resolved to before.
 *
 * Run: node --import tsx --test src/services/advertising/__tests__/ad-content-target-migration.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AD_SUBJECT_TYPES } from "../../../../../shared/ad-content-target.js";
import { adSubjectColumns, resolveAdContentTarget, type AdTargetRow } from "../content-target.js";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const migration = readFileSync(join(API_ROOT, "drizzle", "0516_ad_polymorphic_target.sql"), "utf8");
const schemaSrc = readFileSync(join(API_ROOT, "src", "db", "schema", "advertising.ts"), "utf8");
const code = migration.replace(/--[^\n]*/g, "");

function inListAfter(text: string, anchor: string): string[] {
  const at = text.indexOf(anchor);
  assert.ok(at >= 0, `anchor ${anchor} not found`);
  const m = text.slice(at).match(/IN \(([^)]*)\)/);
  assert.ok(m, `no IN list after ${anchor}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe("0516 CHECK constraints", () => {
  it("ads_subject_check lists exactly AD_SUBJECT_TYPES in the migration", () => {
    assert.deepEqual(inListAfter(code, "ADD CONSTRAINT ads_subject_check"), [...AD_SUBJECT_TYPES]);
  });

  it("ads_subject_check lists exactly AD_SUBJECT_TYPES in the Drizzle schema", () => {
    assert.deepEqual(inListAfter(schemaSrc, '"ads_subject_check"'), [...AD_SUBJECT_TYPES]);
  });

  for (const name of ["ads_subject_check", "job_boosts_subject_check", "company_boosts_subject_check"]) {
    it(`${name} is declared in the schema and gated + NOT VALID in the migration`, () => {
      assert.match(schemaSrc, new RegExp(`"${name}"`));
      assert.match(code, new RegExp(`conname = '${name}'`));
      assert.match(code, new RegExp(`ADD CONSTRAINT ${name}[\\s\\S]*?NOT VALID;`));
    });
  }

  for (const name of ["idx_ads_subject_created", "idx_job_boosts_subject_created", "idx_company_boosts_subject_created"]) {
    it(`${name} is IF NOT EXISTS and declared in the schema`, () => {
      assert.match(code, new RegExp(`CREATE INDEX IF NOT EXISTS ${name}`));
      assert.match(schemaSrc, new RegExp(`"${name}"`));
    });
  }
});

describe("0516 is additive and idempotent", () => {
  it("never drops, retypes or deletes anything", () => {
    assert.doesNotMatch(code, /\bDROP\b/i);
    assert.doesNotMatch(code, /ALTER COLUMN/i);
    assert.doesNotMatch(code, /\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("adds every column IF NOT EXISTS", () => {
    const adds = [...code.matchAll(/ADD COLUMN (IF NOT EXISTS )?(\w+)/g)];
    assert.equal(adds.length, 6);
    for (const a of adds) assert.ok(a[1], `ADD COLUMN ${a[2]} must be IF NOT EXISTS`);
  });

  it("backfill UPDATEs set only the new columns, only on unstamped rows", () => {
    const updates = [...code.matchAll(/UPDATE (\w+) SET ([^;]*?)\s+WHERE ([^;]*);/g)];
    assert.deepEqual(updates.map((u) => u[1]), ["job_boosts", "company_boosts"]);
    for (const [, , set, where] of updates) {
      const cols = set!.split(",").map((p) => p.split("=")[0]!.trim()).sort();
      assert.deepEqual(cols, ["subject_id", "subject_type"]);
      assert.match(where!, /subject_type IS NULL/);
    }
  });
});

// ── Backfill on production-shaped fixtures ───────────────────────────────

interface BoostFixture extends AdTargetRow {
  id: string;
  userId: string;
  placementType: string;
  pricingModel: string;
  budgetCents: number;
  status: string;
}

/** TS mirror of the 0516 UPDATE: stamp only rows whose subject_type is NULL. */
function backfill(row: BoostFixture): BoostFixture {
  if (row.subjectType != null) return row;
  if (row.jobId) return { ...row, subjectType: "job", subjectId: row.jobId };
  if (row.companyId) return { ...row, subjectType: "company", subjectId: row.companyId };
  return row;
}

/** TS mirror of the job_boosts / company_boosts CHECKs. */
function satisfiesCheck(row: BoostFixture): boolean {
  if (row.subjectType == null) return true;
  if (row.jobId !== undefined) return row.subjectType === "job" && row.subjectId === row.jobId;
  return row.subjectType === "company" && row.subjectId === row.companyId;
}

const JOB_ID = "4f2c9a7e-1b3d-4e8f-9a6b-2c5d7e9f1a3b";
const COMPANY_ID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const USER_ID = "c0ffee00-1234-4abc-8def-0123456789ab";

const legacyJobBoost: BoostFixture = {
  id: "b1000000-0000-4000-8000-000000000001", userId: USER_ID, jobId: JOB_ID,
  placementType: "search_top", pricingModel: "cpc", budgetCents: 5000, status: "active",
  subjectType: null, subjectId: null,
};
const legacyCompanyBoost: BoostFixture = {
  id: "b2000000-0000-4000-8000-000000000002", userId: USER_ID, companyId: COMPANY_ID,
  placementType: "directory_featured", pricingModel: "flat", budgetCents: 2500, status: "paused",
  subjectType: null, subjectId: null,
};
const alreadyStamped: BoostFixture = {
  ...legacyJobBoost, id: "b3000000-0000-4000-8000-000000000003", subjectType: "job", subjectId: JOB_ID,
};

describe("0516 backfill on fixture rows", () => {
  it("stamps legacy job and company boosts from their FK", () => {
    assert.deepEqual(resolveAdContentTarget(backfill(legacyJobBoost)), { subjectType: "job", subjectId: JOB_ID });
    const c = backfill(legacyCompanyBoost);
    assert.equal(c.subjectType, "company");
    assert.equal(c.subjectId, COMPANY_ID);
    assert.equal(c.companyId, COMPANY_ID, "legacy FK untouched");
  });

  it("is idempotent (a second run changes nothing; stamped rows are skipped)", () => {
    const once = backfill(legacyJobBoost);
    assert.deepEqual(backfill(once), once);
    assert.deepEqual(backfill(alreadyStamped), alreadyStamped);
  });

  it("every backfilled row satisfies its CHECK and resolves to the same target as before", () => {
    for (const row of [legacyJobBoost, legacyCompanyBoost, alreadyStamped]) {
      const after = backfill(row);
      assert.ok(satisfiesCheck(after), `CHECK fails for ${row.id}`);
      assert.deepEqual(resolveAdContentTarget(after), resolveAdContentTarget(row));
    }
  });
});

describe("resolveAdContentTarget / adSubjectColumns", () => {
  it("prefers the polymorphic pair over the legacy FK", () => {
    assert.deepEqual(
      resolveAdContentTarget({ subjectType: "video", subjectId: JOB_ID, jobId: null }),
      { subjectType: "video", subjectId: JOB_ID },
    );
  });

  it("returns null for an untargeted ad and ignores an unknown subject type", () => {
    assert.equal(resolveAdContentTarget({ subjectType: null, subjectId: null }), null);
    assert.equal(resolveAdContentTarget({ subjectType: "spaceship", subjectId: JOB_ID }), null);
  });

  it("writes the legacy FK alongside the pair for job and company targets only", () => {
    assert.deepEqual(adSubjectColumns({ subjectType: "job", subjectId: JOB_ID }), { subjectType: "job", subjectId: JOB_ID, jobId: JOB_ID });
    assert.deepEqual(adSubjectColumns({ subjectType: "company", subjectId: COMPANY_ID }), { subjectType: "company", subjectId: COMPANY_ID, companyId: COMPANY_ID });
    assert.deepEqual(adSubjectColumns({ subjectType: "article", subjectId: JOB_ID }), { subjectType: "article", subjectId: JOB_ID });
  });
});
