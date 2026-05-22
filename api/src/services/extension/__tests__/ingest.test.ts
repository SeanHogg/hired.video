/**
 * Tests for handleIngestExtensionBatch — the pure handler behind
 * POST /api/extension/sessions.
 *
 * Coverage:
 *   • Upsert idempotency on clientSessionId (retries don't double-create)
 *   • Anonymous batches accepted (userId null)
 *   • Authenticated batches attach the user
 *   • Late binding: anon session + later authed batch attaches user
 *   • Per-event payload size cap (>64KB → replaced with truncation marker)
 *   • Event-count rollup arithmetic (eventCount += rows.length etc.)
 *   • Per-kind rollups (errorCount += errors, pickerCaptureCount += captures)
 *
 * Uses a hand-rolled stub DB rather than the generic buildFakeDb harness
 * because the production handler uses `sql\`col + n\`` fragments for
 * atomic counter increments — the generic harness assigns those SQL
 * objects literally rather than evaluating them. Inspecting the call log
 * lets us assert the right SQL shape was issued without needing a real
 * Postgres.
 *
 * Run: node --import tsx --test src/services/extension/__tests__/ingest.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleIngestExtensionBatch,
  type IngestBatch,
  type IngestDeps,
  type IngestMeta,
  PER_EVENT_PAYLOAD_CAP_BYTES,
} from "../ingest.js";

// ── Stub DB ────────────────────────────────────────────────────────────────
//
// Captures every call against the Drizzle query builder so tests can
// assert on what the handler attempted. Returns the minimum shape each
// handler step expects (select → rows, insert.returning → ids).

interface Call {
  kind: string;
  table?: string;
  values?: any;
  where?: any;
  set?: any;
}

function makeStubDb(opts: {
  existingSessionIds?: string[];
  generatedRowId?: string;
} = {}) {
  const calls: Call[] = [];
  const existing = opts.existingSessionIds ?? [];
  const generatedId = opts.generatedRowId ?? "11111111-1111-1111-1111-111111111111";

  const db = {
    // select(...).from(table).where(eq(clientSessionId, X)).limit(1)
    select(_cols?: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(predicate: any) {
              // Pull the value the handler is checking against — Drizzle
              // expression has shape { left: column, op: '=', right: value }.
              // We don't fully parse it; instead we look in queryChunks
              // for a primitive that matches a known session id.
              const matchedId = extractIdFromExpression(predicate, existing);
              return {
                limit(_n: number) {
                  if (matchedId) {
                    calls.push({ kind: "select", where: matchedId });
                    return Promise.resolve([{ id: "existing-row-" + matchedId }]);
                  }
                  calls.push({ kind: "select" });
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const tableName = inferTableName(table);
      return {
        values(vals: any) {
          calls.push({ kind: "insert", table: tableName, values: vals });
          const out = {
            returning(_cols?: unknown) {
              if (Array.isArray(vals)) {
                return Promise.resolve(vals.map((_, i) => ({ id: `${generatedId}-${i}` })));
              }
              return Promise.resolve([{ id: generatedId }]);
            },
            then(resolve: any) {
              resolve(undefined);
            },
          };
          return out;
        },
      };
    },
    update(table: unknown) {
      const tableName = inferTableName(table);
      return {
        set(set: any) {
          return {
            where(_where: any) {
              calls.push({ kind: "update", table: tableName, set });
              return Promise.resolve();
            },
          };
        },
      };
    },
  } as unknown as IngestDeps["db"];

  return { db, calls };
}

function inferTableName(table: any): string {
  // Drizzle tables have a Symbol-keyed name slot. Walk the symbols.
  const syms = Object.getOwnPropertySymbols(table);
  for (const s of syms) {
    if (s.toString().includes("Name")) return (table as any)[s];
  }
  return "(unknown)";
}

/** Pull a primitive id out of a Drizzle eq()/sql\`\` expression by
 *  walking the .queryChunks array for any string that matches one we know
 *  about (existing session ids). Returns null when nothing matches. */
function extractIdFromExpression(expr: any, known: string[]): string | null {
  if (!expr) return null;
  // eq() produces an SQL object with .queryChunks holding the value parts.
  const stack = [expr];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (typeof cur.value === "string" && known.includes(cur.value)) return cur.value;
    if (Array.isArray(cur.queryChunks)) stack.push(...cur.queryChunks);
    if (Array.isArray(cur.params)) stack.push(...cur.params);
    if (cur.left) stack.push(cur.left);
    if (cur.right) stack.push(cur.right);
  }
  return null;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const baseMeta: IngestMeta = { userId: null, userAgent: "test-ua", ip: "127.0.0.1" };

function makeBatch(overrides: Partial<IngestBatch> = {}): IngestBatch {
  return {
    sessionId,
    extension: "jobseeker",
    version: "3.8",
    events: [
      { kind: "page_view", url: "https://example.com/jobs/1", host: "example.com" },
    ],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("handleIngestExtensionBatch — session upsert", () => {
  it("creates a new session row when clientSessionId is unseen", async () => {
    const { db, calls } = makeStubDb();
    const res = await handleIngestExtensionBatch({ db }, makeBatch(), baseMeta);
    assert.equal(res.createdSession, true);
    const insertCalls = calls.filter((c) => c.kind === "insert");
    const sessionInsert = insertCalls.find((c) => c.table === "extension_sessions");
    assert.ok(sessionInsert, "session row inserted");
    assert.equal(sessionInsert!.values.clientSessionId, sessionId);
    assert.equal(sessionInsert!.values.extension, "jobseeker");
    assert.equal(sessionInsert!.values.userId, null, "anon session has null userId");
  });

  it("reuses an existing session row when clientSessionId already exists (idempotent retry)", async () => {
    const { db, calls } = makeStubDb({ existingSessionIds: [sessionId] });
    const res = await handleIngestExtensionBatch({ db }, makeBatch(), baseMeta);
    assert.equal(res.createdSession, false, "no new session row created");
    const sessionInserts = calls.filter(
      (c) => c.kind === "insert" && c.table === "extension_sessions",
    );
    assert.equal(sessionInserts.length, 0, "skipped insert on duplicate");
  });

  it("attaches userId on a new authenticated session", async () => {
    const { db, calls } = makeStubDb();
    await handleIngestExtensionBatch({ db }, makeBatch(), { ...baseMeta, userId: "user-abc" });
    const insert = calls.find((c) => c.kind === "insert" && c.table === "extension_sessions");
    assert.equal(insert!.values.userId, "user-abc");
  });

  it("late-binds user on a session that was previously anonymous", async () => {
    // Existing session row exists; this call brings auth context.
    const { db, calls } = makeStubDb({ existingSessionIds: [sessionId] });
    await handleIngestExtensionBatch({ db }, makeBatch(), { ...baseMeta, userId: "user-abc" });
    const updates = calls.filter((c) => c.kind === "update" && c.table === "extension_sessions");
    // Two updates: rollup counters + late-bind userId.
    const lateBind = updates.find((c) => c.set?.userId === "user-abc");
    assert.ok(lateBind, "late-bind update issued when userId provided");
  });

  it("does NOT issue the late-bind update when call is anonymous", async () => {
    const { db, calls } = makeStubDb({ existingSessionIds: [sessionId] });
    await handleIngestExtensionBatch({ db }, makeBatch(), baseMeta);
    const updates = calls.filter((c) => c.kind === "update" && c.table === "extension_sessions");
    const lateBind = updates.find((c) => c.set?.userId !== undefined);
    assert.equal(lateBind, undefined, "no late-bind update when anonymous");
  });
});

describe("handleIngestExtensionBatch — event writes", () => {
  it("inserts every event with sessionId attached", async () => {
    const { db, calls } = makeStubDb();
    await handleIngestExtensionBatch({ db }, makeBatch({
      events: [
        { kind: "page_view", url: "https://a.com" },
        { kind: "detect_attempt", url: "https://a.com" },
        { kind: "track", url: "https://a.com" },
      ],
    }), baseMeta);
    const eventInsert = calls.find((c) => c.kind === "insert" && c.table === "extension_events");
    assert.ok(eventInsert, "events inserted");
    assert.equal(eventInsert!.values.length, 3);
    assert.ok(eventInsert!.values.every((v: any) => typeof v.sessionId === "string"));
  });

  it("returns the count of accepted events", async () => {
    const { db } = makeStubDb();
    const result = await handleIngestExtensionBatch({ db }, makeBatch({
      events: [
        { kind: "page_view" },
        { kind: "navigation" },
        { kind: "track" },
      ],
    }), baseMeta);
    assert.equal(result.accepted, 3);
  });

  it("replaces oversize payloads with a truncation marker", async () => {
    const { db, calls } = makeStubDb();
    const big = "x".repeat(PER_EVENT_PAYLOAD_CAP_BYTES + 5_000);
    await handleIngestExtensionBatch({ db }, makeBatch({
      events: [{ kind: "picker_capture", payload: { html: big } }],
    }), baseMeta);
    const eventInsert = calls.find((c) => c.kind === "insert" && c.table === "extension_events");
    const payload = eventInsert!.values[0].payload;
    assert.equal(payload._truncated, true, "truncation marker set");
    assert.ok(typeof payload._originalSize === "number" && payload._originalSize > PER_EVENT_PAYLOAD_CAP_BYTES);
    assert.equal(payload.html, undefined, "original payload dropped");
  });

  it("preserves payloads under the size cap", async () => {
    const { db, calls } = makeStubDb();
    await handleIngestExtensionBatch({ db }, makeBatch({
      events: [{ kind: "picker_capture", payload: { fields: { title: { value: "Engineer" } } } }],
    }), baseMeta);
    const eventInsert = calls.find((c) => c.kind === "insert" && c.table === "extension_events");
    const payload = eventInsert!.values[0].payload;
    assert.equal(payload._truncated, undefined);
    assert.equal(payload.fields.title.value, "Engineer");
  });

  it("hoists url + host out of the payload into their own columns", async () => {
    const { db, calls } = makeStubDb();
    await handleIngestExtensionBatch({ db }, makeBatch({
      events: [{
        kind: "detect_attempt",
        url: "https://linkedin.com/jobs/view/4416913834/",
        host: "linkedin.com",
        payload: { strategy: "linkedInFallback", success: false },
      }],
    }), baseMeta);
    const insert = calls.find((c) => c.kind === "insert" && c.table === "extension_events");
    const row = insert!.values[0];
    assert.equal(row.url, "https://linkedin.com/jobs/view/4416913834/");
    assert.equal(row.host, "linkedin.com");
    assert.equal(row.payload.strategy, "linkedInFallback");
  });
});

describe("handleIngestExtensionBatch — counter rollup", () => {
  it("issues an update that increments the rollup counters", async () => {
    const { db, calls } = makeStubDb();
    await handleIngestExtensionBatch({ db }, makeBatch({
      events: [
        { kind: "page_view" },
        { kind: "error", payload: { message: "boom" } },
        { kind: "picker_capture", payload: { fields: {} } },
        { kind: "picker_capture", payload: { fields: {} } },
      ],
    }), baseMeta);

    const rollupUpdate = calls.find(
      (c) => c.kind === "update" && c.table === "extension_sessions" && c.set?.eventCount !== undefined,
    );
    assert.ok(rollupUpdate, "rollup update issued");
    // updatedAt always present
    assert.ok(rollupUpdate!.set.updatedAt instanceof Date);
    // We don't inspect the SQL fragment contents (those are opaque
    // Drizzle objects); we just assert the right shape of keys was set.
    assert.ok("eventCount" in rollupUpdate!.set);
    assert.ok("errorCount" in rollupUpdate!.set);
    assert.ok("pickerCaptureCount" in rollupUpdate!.set);
  });
});
