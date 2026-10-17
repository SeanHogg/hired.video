/**
 * Conformant xAPI 1.0.3 LRS service tests (mig 0490).
 *
 * Covers the security-critical + spec-critical surface of the platform LRS:
 *   - actor IFI canonicalization (the ?agent= filter + document key),
 *   - buildStatementRow LRS stamping (id / stored / version / authority) and
 *     field extraction (verb / object / registration),
 *   - Basic-auth resolve: valid read/write, wrong secret, permission scoping,
 *     inactive credential,
 *   - storeStatements: id minting, voiding, id-conflict (identical ok / diff 409),
 *   - document resources: put/get/delete round-trip, POST merge, key listing.
 *
 * DB is the shared fake-db (real WHERE evaluation). No network (no LRS targets
 * seeded → the forwarder is a no-op).
 *
 * Run: node --import tsx --test src/services/learning/__tests__/lrs-service.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { sha256Hex } from "../../../utils/crypto.js";
import {
  actorIfi,
  buildStatementRow,
  generateLrsSecret,
  basicAuthValue,
  resolveLrsBasicAuth,
  LrsAuthError,
  storeStatements,
  queryStatements,
  putDocument,
  getDocument,
  deleteDocument,
  listDocumentKeys,
  type ResolvedLrsCredential,
} from "../lrs-service.js";

const CRED: ResolvedLrsCredential = {
  credentialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  ownerCompanyId: null,
  permission: "read_write",
};

// ── actor IFI ───────────────────────────────────────────────────────────────
describe("actorIfi", () => {
  it("canonicalizes an mbox actor (lowercased)", () => {
    assert.equal(actorIfi({ mbox: "mailto:Alice@Example.com" }), "mbox::mailto:alice@example.com");
  });
  it("canonicalizes an account actor as homePage::name", () => {
    assert.equal(
      actorIfi({ account: { homePage: "https://lms.acme.com", name: "u-42" } }),
      "account::https://lms.acme.com::u-42",
    );
  });
  it("canonicalizes mbox_sha1sum and openid", () => {
    assert.equal(actorIfi({ mbox_sha1sum: "ABC123" }), "sha1::abc123");
    assert.equal(actorIfi({ openid: "https://openid/u" }), "openid::https://openid/u");
  });
  it("prefers mbox when multiple IFIs are present (deterministic)", () => {
    assert.equal(actorIfi({ mbox: "mailto:a@b.com", openid: "x" }), "mbox::mailto:a@b.com");
  });
  it("returns '' for an anonymous group / null", () => {
    assert.equal(actorIfi({ member: [] }), "");
    assert.equal(actorIfi(null), "");
  });
});

// ── buildStatementRow ─────────────────────────────────────────────────────────
describe("buildStatementRow", () => {
  const at = new Date("2026-07-04T12:00:00.000Z");

  it("stamps id, stored, version, and authority when id is absent", () => {
    const row = buildStatementRow(
      {
        actor: { mbox: "mailto:a@b.com" },
        verb: { id: "http://adlnet.gov/expapi/verbs/completed" },
        object: { id: "https://act/1", objectType: "Activity" },
      },
      CRED,
      at,
    );
    assert.match(row.id, /^[0-9a-f-]{36}$/i);
    const st = row.statement as Record<string, any>;
    assert.equal(st.version, "1.0.3");
    assert.equal(st.stored, at.toISOString());
    assert.equal(st.timestamp, at.toISOString());
    assert.equal(st.authority.objectType, "Agent");
    assert.equal(st.authority.account.name, CRED.credentialId);
  });

  it("preserves a client-provided UUID id", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const row = buildStatementRow({ id, verb: { id: "v" }, object: { id: "o" } }, CRED, at);
    assert.equal(row.id, id);
  });

  it("extracts verbId, objectId, objectType, and registration", () => {
    const reg = "33333333-3333-4333-8333-333333333333";
    const row = buildStatementRow(
      {
        actor: { mbox: "mailto:a@b.com" },
        verb: { id: "http://adlnet.gov/expapi/verbs/passed" },
        object: { id: "https://act/2", objectType: "Activity" },
        context: { registration: reg },
      },
      CRED,
      at,
    );
    assert.equal(row.verbId, "http://adlnet.gov/expapi/verbs/passed");
    assert.equal(row.objectId, "https://act/2");
    assert.equal(row.objectType, "Activity");
    assert.equal(row.registration, reg);
    assert.equal(row.actorIfi, "mbox::mailto:a@b.com");
  });

  it("null objectId when the object has no id (Agent/StatementRef)", () => {
    const row = buildStatementRow(
      { verb: { id: "v" }, object: { objectType: "Agent", mbox: "mailto:x@y.com" } },
      CRED,
      at,
    );
    assert.equal(row.objectId, null);
  });
});

// ── key minting + hashing ─────────────────────────────────────────────────────
describe("credential minting", () => {
  it("sha256Hex is deterministic and 64 hex chars", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });
  it("generateLrsSecret returns lrs_-prefixed keyId and a matching hash", async () => {
    const { keyId, secret, secretHash } = await generateLrsSecret();
    assert.match(keyId, /^lrs_[0-9a-f]{24}$/);
    assert.equal(secretHash, await sha256Hex(secret));
  });
  it("basicAuthValue base64-encodes keyId:secret", () => {
    assert.equal(basicAuthValue("lrs_abc", "sec"), `Basic ${btoa("lrs_abc:sec")}`);
  });
});

// ── Basic-auth resolve ─────────────────────────────────────────────────────────
async function seedCred(over: Record<string, unknown> = {}) {
  const secret = "s3cr3t-value";
  const secretHash = await sha256Hex(secret);
  const row = {
    id: CRED.credentialId,
    ownerUserId: CRED.ownerUserId,
    ownerCompanyId: null,
    keyId: "lrs_deadbeef",
    secretHash,
    permission: "read_write",
    active: true,
    ...over,
  };
  return { secret, row };
}

describe("resolveLrsBasicAuth", () => {
  it("accepts a valid credential for read and write", async () => {
    const { secret, row } = await seedCred();
    const { db } = buildFakeDb({ lrs_credentials: [row] });
    const header = basicAuthValue(row.keyId, secret);
    const w = await resolveLrsBasicAuth(header, "write", db as never);
    assert.equal(w.credentialId, CRED.credentialId);
    const r = await resolveLrsBasicAuth(header, "read", db as never);
    assert.equal(r.ownerUserId, CRED.ownerUserId);
  });

  it("rejects a wrong secret", async () => {
    const { row } = await seedCred();
    const { db } = buildFakeDb({ lrs_credentials: [row] });
    await assert.rejects(
      () => resolveLrsBasicAuth(basicAuthValue(row.keyId, "wrong"), "read", db as never),
      (e) => e instanceof LrsAuthError && e.status === 401,
    );
  });

  it("rejects a missing / non-Basic header", async () => {
    const { db } = buildFakeDb({ lrs_credentials: [] });
    await assert.rejects(() => resolveLrsBasicAuth(undefined, "read", db as never), LrsAuthError);
    await assert.rejects(() => resolveLrsBasicAuth("Bearer x", "read", db as never), LrsAuthError);
  });

  it("rejects an inactive credential", async () => {
    const { secret, row } = await seedCred({ active: false });
    const { db } = buildFakeDb({ lrs_credentials: [row] });
    await assert.rejects(
      () => resolveLrsBasicAuth(basicAuthValue(row.keyId, secret), "read", db as never),
      LrsAuthError,
    );
  });

  it("enforces permission scoping (read-only rejects write, 403)", async () => {
    const { secret, row } = await seedCred({ permission: "read" });
    const { db } = buildFakeDb({ lrs_credentials: [row] });
    const header = basicAuthValue(row.keyId, secret);
    await resolveLrsBasicAuth(header, "read", db as never); // ok
    await assert.rejects(
      () => resolveLrsBasicAuth(header, "write", db as never),
      (e) => e instanceof LrsAuthError && e.status === 403,
    );
  });
});

// ── statement storage + query ─────────────────────────────────────────────────
describe("storeStatements + queryStatements", () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    actor: { mbox: "mailto:learner@acme.com" },
    verb: { id: "http://adlnet.gov/expapi/verbs/completed" },
    object: { id: "https://act/course-1", objectType: "Activity" },
    ...over,
  });

  it("stores a statement, mints an id, and reads it back by the agent filter", async () => {
    const { db, state } = buildFakeDb({ lrs_statements: [] });
    const { ids } = await storeStatements(CRED, [mk()], db as never);
    assert.equal(ids.length, 1);
    assert.equal(state.lrs_statements.length, 1);
    const { result } = await queryStatements(
      CRED,
      { agent: "mbox::mailto:learner@acme.com" },
      db as never,
    );
    assert.equal(result.statements.length, 1);
  });

  it("id-conflict with identical content is a no-op (idempotent PUT)", async () => {
    const { db, state } = buildFakeDb({ lrs_statements: [] });
    const id = "44444444-4444-4444-8444-444444444444";
    await storeStatements(CRED, [mk({ id })], db as never);
    await storeStatements(CRED, [mk({ id })], db as never);
    assert.equal(state.lrs_statements.length, 1, "no duplicate row for identical re-PUT");
  });

  it("id-conflict with different content throws 409", async () => {
    const { db } = buildFakeDb({ lrs_statements: [] });
    const id = "55555555-5555-4555-8555-555555555555";
    await storeStatements(CRED, [mk({ id })], db as never);
    await assert.rejects(
      () => storeStatements(CRED, [mk({ id, verb: { id: "http://adlnet.gov/expapi/verbs/failed" } })], db as never),
      (e) => e instanceof LrsAuthError && (e.status as number) === 409,
    );
  });

  it("a voiding statement flips `voided` on its target and hides it from GET", async () => {
    const { db, state } = buildFakeDb({ lrs_statements: [] });
    const targetId = "66666666-6666-4666-8666-666666666666";
    await storeStatements(CRED, [mk({ id: targetId })], db as never);
    await storeStatements(
      CRED,
      [{
        actor: { mbox: "mailto:admin@acme.com" },
        verb: { id: "http://adlnet.gov/expapi/verbs/voided" },
        object: { objectType: "StatementRef", id: targetId },
      }],
      db as never,
    );
    const voidedRow = state.lrs_statements.find((r) => r.id === targetId)!;
    assert.equal(voidedRow.voided, true);
    // The default GET (voided=false) excludes it.
    const { result } = await queryStatements(CRED, { agent: "mbox::mailto:learner@acme.com" }, db as never);
    assert.equal(result.statements.length, 0);
  });

  it("scopes reads to the credential (no cross-tenant leak)", async () => {
    const { db } = buildFakeDb({ lrs_statements: [] });
    await storeStatements(CRED, [mk()], db as never);
    const otherCred = { ...CRED, credentialId: "99999999-9999-4999-8999-999999999999" };
    const { result } = await queryStatements(otherCred, {}, db as never);
    assert.equal(result.statements.length, 0);
  });
});

// ── document resources ────────────────────────────────────────────────────────
describe("document resources (state / activity_profile / agent_profile)", () => {
  it("put → get → delete round-trip for a state document", async () => {
    const { db } = buildFakeDb({ lrs_documents: [] });
    const key = { docType: "state" as const, activityId: "https://act/1", agentIfi: "mbox::mailto:a@b.com", registration: "", documentKey: "bookmark" };
    const { etag } = await putDocument(CRED.credentialId, key, JSON.stringify({ page: 3 }), "application/json", false, db as never);
    assert.match(etag, /^[0-9a-f]{64}$/);
    const got = await getDocument(CRED.credentialId, key, db as never);
    assert.equal(got?.content, JSON.stringify({ page: 3 }));
    assert.equal(await deleteDocument(CRED.credentialId, key, db as never), true);
    assert.equal(await getDocument(CRED.credentialId, key, db as never), null);
  });

  it("POST merges JSON documents (shallow); PUT replaces", async () => {
    const { db } = buildFakeDb({ lrs_documents: [] });
    const key = { docType: "activity_profile" as const, activityId: "https://act/2", documentKey: "prefs" };
    await putDocument(CRED.credentialId, key, JSON.stringify({ a: 1, b: 2 }), "application/json", false, db as never);
    await putDocument(CRED.credentialId, key, JSON.stringify({ b: 9, c: 3 }), "application/json", true, db as never);
    const merged = JSON.parse((await getDocument(CRED.credentialId, key, db as never))!.content);
    assert.deepEqual(merged, { a: 1, b: 9, c: 3 });
    await putDocument(CRED.credentialId, key, JSON.stringify({ only: true }), "application/json", false, db as never);
    assert.deepEqual(JSON.parse((await getDocument(CRED.credentialId, key, db as never))!.content), { only: true });
  });

  it("listDocumentKeys returns the stateIds in scope", async () => {
    const { db } = buildFakeDb({ lrs_documents: [] });
    const base = { docType: "state" as const, activityId: "https://act/3", agentIfi: "mbox::mailto:c@d.com", registration: "" };
    await putDocument(CRED.credentialId, { ...base, documentKey: "s1" }, "x", "text/plain", false, db as never);
    await putDocument(CRED.credentialId, { ...base, documentKey: "s2" }, "y", "text/plain", false, db as never);
    const ids = await listDocumentKeys(CRED.credentialId, "state", { activityId: "https://act/3", agentIfi: "mbox::mailto:c@d.com", registration: "" }, db as never);
    assert.deepEqual([...ids].sort(), ["s1", "s2"]);
  });
});
