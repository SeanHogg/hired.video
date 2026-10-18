/**
 * Version snapshot writes (entity_versions):
 *
 *   • inserts RETURN metadata only — never the (large) payload; the returned
 *     row carries the caller's in-memory payload instead;
 *   • insert + autosave prune share ONE round-trip (`db.batch`); a lost
 *     version-number race retries the insert alone (prune runs once);
 *   • the résumé snapshot's batched prune is ownership-guarded.
 *
 * Run: node --import tsx --test src/repositories/__tests__/entity-version-writes.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/neon-http";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { schema } from "../../db/index.js";
import {
  ENTITY_VERSION_META_COLUMNS,
  EntityVersionRepository,
  buildInsertNextVersion,
  buildPruneAutosaves,
  type NewEntityVersionInput,
} from "../entityVersionRepository.js";
import { ResumeVersionRepository, buildSnapshotInsertSql } from "../resumeVersionRepository.js";

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const mockDb = drizzle.mock({ schema });

const INPUT: NewEntityVersionInput = {
  subjectType: "studio_project",
  subjectId: SUBJECT_ID,
  userId: USER,
  label: "autosave",
  payload: { scenes: [{ id: "s1", text: "a big storyboard" }] },
  isAutosave: true,
};

describe("statement shapes", () => {
  it("the next-version INSERT returns every column except payload", () => {
    assert.ok(!("payload" in ENTITY_VERSION_META_COLUMNS));
    const { sql: text } = buildInsertNextVersion(mockDb, INPUT).toSQL();
    const returning = text.slice(text.indexOf("returning"));
    assert.ok(!returning.includes('"payload"'), returning);
    assert.match(returning, /"version_number"/);
    assert.match(text, /on conflict \("subject_type",\s*"subject_id",\s*"version_number"\) do nothing/);
  });

  it("the prune DELETE ANDs an optional guard", () => {
    const guard = sql`EXISTS (SELECT 1)`;
    const plain = buildPruneAutosaves(mockDb, "resume", SUBJECT_ID, { cap: 50, retentionDays: 30 }).toSQL().sql;
    const guarded = buildPruneAutosaves(mockDb, "resume", SUBJECT_ID, { cap: 50, retentionDays: 30 }, guard).toSQL().sql;
    assert.match(plain, /^delete from "entity_versions"/);
    assert.ok(!plain.includes("EXISTS"));
    assert.match(guarded, /EXISTS \(SELECT 1\)/);
    assert.match(guarded, /"entity_versions"\."is_autosave" = \$\d+/);
  });

  it("the résumé snapshot INSERT … SELECT copies content server-side and doesn't RETURN it", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      buildSnapshotInsertSql(SUBJECT_ID, USER, { label: null, isAutosave: true }),
    );
    const returning = text.slice(text.indexOf("RETURNING"));
    assert.match(text, /SELECT .*"resume_information"\."content"/s);
    assert.ok(!/payload/.test(returning), returning);
    assert.match(returning, /created_at AS "createdAt"/);
    assert.ok(params.includes(SUBJECT_ID) && params.includes(USER));
  });
});

// ─── Behaviour with a recording fake db ─────────────────────────────────────

type Pending = { kind: "insert" | "delete" | "raw"; result: unknown };

/** Chain fake: builders return tagged thenables; `batch` resolves the tags. */
function fakeDb(script: { inserts: unknown[][]; deleted?: unknown[] }) {
  const log: string[] = [];
  let insertN = 0;
  const thenable = (p: Pending) => ({
    ...p,
    then(resolve: (v: unknown) => void) {
      log.push(`await:${p.kind}`);
      resolve(p.result);
    },
  });
  const nextInsert = () => script.inserts[insertN++] ?? [];
  const chainSelect = () => {
    const c = { from: () => c, where: () => c, orderBy: () => c, limit: () => c };
    return c;
  };
  const db = {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => thenable({ kind: "insert", result: nextInsert() }) }),
      }),
    }),
    select: chainSelect,
    delete: () => ({ where: () => ({ returning: () => thenable({ kind: "delete", result: script.deleted ?? [] }) }) }),
    execute: () => thenable({ kind: "raw", result: { rows: nextInsert() } }),
    async batch(items: Pending[]) {
      log.push(`batch:${items.map((i) => i.kind).join("+")}`);
      return items.map((i) => i.result);
    },
  };
  return { db, log };
}

const META = {
  id: "v1",
  subjectType: "studio_project",
  subjectId: SUBJECT_ID,
  userId: USER,
  versionNumber: 4,
  label: "autosave",
  isAutosave: true,
  proposedByUserId: null,
  reviewId: null,
  proposalStatus: null,
  createdAt: new Date("2026-10-17T00:00:00Z"),
};

describe("EntityVersionRepository.insertNextAndPrune — one round-trip", () => {
  it("batches insert + prune, returns the input payload and the pruned count", async () => {
    const { db, log } = fakeDb({ inserts: [[META]], deleted: [{ id: "old1" }, { id: "old2" }] });
    const repo = new EntityVersionRepository(db);
    const { row, prunedCount } = await repo.insertNextAndPrune(INPUT, { cap: 50, retentionDays: 30 });
    assert.deepEqual(log, ["batch:insert+delete"], "exactly one round-trip");
    assert.equal(prunedCount, 2);
    assert.equal(row.versionNumber, 4);
    assert.deepEqual(row.payload, INPUT.payload, "payload comes from the caller, not RETURNING");
  });

  it("a lost version-number race retries the INSERT alone — the prune ran once", async () => {
    const { db, log } = fakeDb({ inserts: [[], [META]], deleted: [] });
    const { row, prunedCount } = await new EntityVersionRepository(db).insertNextAndPrune(INPUT, {
      cap: 50,
      retentionDays: 30,
    });
    assert.deepEqual(log, ["batch:insert+delete", "await:insert"]);
    assert.equal(prunedCount, 0);
    assert.equal(row.id, "v1");
  });

  it("insertNext (no prune) is a single plain INSERT", async () => {
    const { db, log } = fakeDb({ inserts: [[META]] });
    const row = await new EntityVersionRepository(db).insertNext({ ...INPUT, isAutosave: false });
    assert.deepEqual(log, ["await:insert"]);
    assert.deepEqual(row.payload, INPUT.payload);
  });

  it("throws after exhausting retries", async () => {
    const { db } = fakeDb({ inserts: [[], [], []] });
    await assert.rejects(new EntityVersionRepository(db).insertNext(INPUT), /could not allocate a version number/);
  });
});

describe("ResumeVersionRepository.insertSnapshot", () => {
  const RAW_META = { ...META, resumeId: SUBJECT_ID, createdAt: "2026-10-17T00:00:00.000Z" };

  it("autosave + policy → ONE batch (insert + guarded prune); metadata only, Date-normalised", async () => {
    const { db, log } = fakeDb({ inserts: [[RAW_META]] });
    const out = await new ResumeVersionRepository(db).insertSnapshot(
      SUBJECT_ID,
      USER,
      { label: null, isAutosave: true },
      { cap: 50, retentionDays: 30 },
    );
    assert.deepEqual(log, ["batch:raw+delete"]);
    assert.ok(out);
    assert.ok(out.createdAt instanceof Date);
    assert.ok(!("resumeData" in out));
  });

  it("a labelled snapshot never prunes", async () => {
    const { db, log } = fakeDb({ inserts: [[RAW_META]] });
    await new ResumeVersionRepository(db).insertSnapshot(
      SUBJECT_ID,
      USER,
      { label: "v1", isAutosave: false },
      { cap: 50, retentionDays: 30 },
    );
    assert.deepEqual(log, ["await:raw"]);
  });

  it("returns null when the résumé is missing / not theirs (no rows after retries)", async () => {
    const { db } = fakeDb({ inserts: [[], [], []] });
    const out = await new ResumeVersionRepository(db).insertSnapshot(SUBJECT_ID, USER, { label: null, isAutosave: true }, {
      cap: 50,
      retentionDays: 30,
    });
    assert.equal(out, null);
  });
});
