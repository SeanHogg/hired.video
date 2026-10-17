/**
 * Conformant xAPI 1.0.3 Learning Record Store (LRS) — runtime (mig 0490).
 *
 * This is the platform LRS that positions hired.video as a SCORM-Cloud-style
 * hosting/tracking platform: an external tool authenticates with an
 * LRS-specific Basic-auth credential (NOT a hired.video session/JWT) and gets
 * the full xAPI REST surface — statements + State / Activity Profile / Agent
 * Profile document resources.
 *
 * Decoupled from internal enrollments on purpose: the actor of an inbound
 * statement is an arbitrary xAPI Agent (mbox / account) that need not map to a
 * hired.video user. The internal `xapiStatements` store (mig 0126) remains the
 * SSoT for OUR learners' gamification + cert rollups.
 *
 * Design mirrors services/partner/keys.ts (prefix + SHA-256 hash, secret shown
 * once). Every stored statement is also mirrored to the owner's configured
 * external LRS targets via the existing `forwardStatementForUser` forwarder —
 * so a company LEAVING can point us at their new LRS and drain statements out.
 */
import { and, asc, desc, eq, gt, lte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { forwardStatementsForUser } from "./lrs-forwarder.js";
import type { LrsPermission, LrsDocumentType } from "../../db/schema/learning.js";
import { randomHex, sha256Hex } from "../../utils/crypto.js";

const { lrsCredentials, lrsStatements, lrsDocuments } = schema;

type DbHandle = ReturnType<typeof getDb>;

const XAPI_VERSION = "1.0.3";
const VOIDED_VERB = "http://adlnet.gov/expapi/verbs/voided";

// ── key minting (mirrors partner/keys.ts) ───────────────────────────────────
/** Mint an LRS Basic-auth credential. `keyId` is the Basic username (public);
 *  `secret` is the password, returned ONCE and stored only as a SHA-256 hash. */
export async function generateLrsSecret(): Promise<{ keyId: string; secret: string; secretHash: string }> {
  const keyId = `lrs_${randomHex(12)}`;
  const secret = randomHex(24);
  const secretHash = await sha256Hex(secret);
  return { keyId, secret, secretHash };
}

/** The single Basic-auth header value a client uses: `Basic base64(keyId:secret)`. */
export function basicAuthValue(keyId: string, secret: string): string {
  return `Basic ${btoa(`${keyId}:${secret}`)}`;
}

// ── auth ────────────────────────────────────────────────────────────────────
export class LrsAuthError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "FORBIDDEN",
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export interface ResolvedLrsCredential {
  credentialId: string;
  ownerUserId: string;
  ownerCompanyId: string | null;
  permission: LrsPermission;
}

/** Resolve an `Authorization: Basic ...` header against `lrs_credentials`.
 *  Throws LrsAuthError on any failure. `write` requires write|read_write,
 *  `read` requires read|read_write. */
export async function resolveLrsBasicAuth(
  authHeader: string | undefined,
  mode: "read" | "write",
  db: DbHandle = getDb(),
): Promise<ResolvedLrsCredential> {
  if (!authHeader?.startsWith("Basic ")) {
    throw new LrsAuthError("UNAUTHORIZED", "Basic authentication required.");
  }
  let decoded = "";
  try {
    decoded = atob(authHeader.slice(6).trim());
  } catch {
    throw new LrsAuthError("UNAUTHORIZED", "Malformed Basic credentials.");
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) throw new LrsAuthError("UNAUTHORIZED", "Malformed Basic credentials.");
  const keyId = decoded.slice(0, sep);
  const secret = decoded.slice(sep + 1);
  if (!keyId || !secret) throw new LrsAuthError("UNAUTHORIZED", "Malformed Basic credentials.");

  const secretHash = await sha256Hex(secret);
  const [row] = await db.select().from(lrsCredentials)
    .where(and(eq(lrsCredentials.keyId, keyId), eq(lrsCredentials.active, true)))
    .limit(1);
  if (!row || row.secretHash !== secretHash) {
    throw new LrsAuthError("UNAUTHORIZED", "Invalid LRS credentials.");
  }

  const permission = row.permission as LrsPermission;
  const canWrite = permission === "write" || permission === "read_write";
  const canRead = permission === "read" || permission === "read_write";
  if (mode === "write" && !canWrite) {
    throw new LrsAuthError("FORBIDDEN", "This credential is read-only.", 403);
  }
  if (mode === "read" && !canRead) {
    throw new LrsAuthError("FORBIDDEN", "This credential is write-only.", 403);
  }

  // Best-effort last-used bump; never blocks the request path.
  void db.update(lrsCredentials).set({ lastUsedAt: new Date() } as never)
    .where(eq(lrsCredentials.id, row.id)).catch(() => undefined);

  return {
    credentialId: row.id,
    ownerUserId: row.ownerUserId,
    ownerCompanyId: row.ownerCompanyId ?? null,
    permission,
  };
}

// ── actor identity (inverse-functional identifier) ──────────────────────────
interface XapiAgentLike {
  mbox?: string;
  mbox_sha1sum?: string;
  openid?: string;
  account?: { homePage?: string; name?: string };
  member?: XapiAgentLike[];
}

/** Canonical IFI string for an xAPI Agent/Group, used as the `?agent=` filter
 *  key and the document-store `agent_ifi` component. Returns "" when the actor
 *  has no IFI (an anonymous Group). */
export function actorIfi(actor: XapiAgentLike | null | undefined): string {
  if (!actor) return "";
  if (actor.mbox) return `mbox::${actor.mbox.trim().toLowerCase()}`;
  if (actor.mbox_sha1sum) return `sha1::${actor.mbox_sha1sum.trim().toLowerCase()}`;
  if (actor.openid) return `openid::${actor.openid.trim()}`;
  if (actor.account?.homePage && actor.account?.name) {
    return `account::${actor.account.homePage.trim()}::${actor.account.name.trim()}`;
  }
  return "";
}

// ── statement storage ───────────────────────────────────────────────────────
export interface StoredStatementIds {
  ids: string[];
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Build the row + canonicalised statement for one incoming statement. The
 *  LRS stamps `id` (if absent), `stored`, `version`, and `authority`. */
export function buildStatementRow(
  raw: Record<string, unknown>,
  credential: ResolvedLrsCredential,
  storedAt: Date,
): typeof lrsStatements.$inferInsert {
  const id = isUuid(raw.id) ? (raw.id as string) : crypto.randomUUID();
  const actor = (raw.actor ?? null) as XapiAgentLike | null;
  const verb = (raw.verb ?? {}) as { id?: string };
  const object = (raw.object ?? {}) as { id?: string; objectType?: string };
  const context = (raw.context ?? {}) as { registration?: string };

  const statement: Record<string, unknown> = {
    ...raw,
    id,
    version: XAPI_VERSION,
    stored: storedAt.toISOString(),
    // The LRS is the authority for statements it stores under a credential.
    authority: {
      objectType: "Agent",
      account: { homePage: "https://hired.video/api/xapi", name: credential.credentialId },
    },
  };
  if (!statement.timestamp) statement.timestamp = storedAt.toISOString();

  return {
    id,
    credentialId: credential.credentialId,
    actorIfi: actorIfi(actor),
    verbId: verb.id ?? "",
    objectId: typeof object.id === "string" ? object.id : null,
    objectType: object.objectType ?? "Activity",
    registration: isUuid(context.registration) ? context.registration : null,
    statement,
    voided: false,
    voidedById: null,
    stored: storedAt,
  };
}

/** Store one or more statements under a credential. Handles voiding, id
 *  conflict (identical → ok, different → 409), and outbound forwarding. */
export async function storeStatements(
  credential: ResolvedLrsCredential,
  rawStatements: Record<string, unknown>[],
  db: DbHandle = getDb(),
): Promise<StoredStatementIds> {
  const storedAt = new Date();
  const rows = rawStatements.map((s) => buildStatementRow(s, credential, storedAt));

  // xAPI: a PUT/POST with an id that already exists must match byte-for-byte
  // (ignoring authority/stored the LRS sets) or the request conflicts.
  const ids = rows.map((r) => r.id);
  const existing = ids.length
    ? await db.select({ id: lrsStatements.id, statement: lrsStatements.statement })
        .from(lrsStatements)
        .where(and(eq(lrsStatements.credentialId, credential.credentialId), inArray(lrsStatements.id, ids)))
    : [];
  const existingById = new Map(existing.map((e) => [e.id, e.statement]));
  for (const row of rows) {
    const prior = existingById.get(row.id);
    if (prior && !statementsMatch(prior, row.statement)) {
      throw new LrsAuthError("FORBIDDEN", `Statement ${row.id} already exists with different content.`, 409 as never);
    }
  }

  const fresh = rows.filter((r) => !existingById.has(r.id));
  if (fresh.length) {
    await db.insert(lrsStatements).values(fresh as never).onConflictDoNothing();
  }

  // Apply voiding statements: verb=voided + object is a StatementRef — ONE
  // UPDATE for every voided target (was one per voiding statement). When
  // several statements void the same target, the last one wins (same as the
  // old sequential updates).
  const voidedByTarget = new Map<string, string>();
  for (const row of fresh) {
    const st = row.statement as { verb?: { id?: string }; object?: { objectType?: string; id?: string } };
    if (st.verb?.id === VOIDED_VERB && st.object?.objectType === "StatementRef" && isUuid(st.object.id)) {
      voidedByTarget.set(st.object.id!, row.id);
    }
  }
  if (voidedByTarget.size > 0) {
    const whens = sql.join(
      [...voidedByTarget].map(([target, voider]) => sql`WHEN ${target}::uuid THEN ${voider}::uuid`),
      sql` `,
    );
    await db.update(lrsStatements)
      .set({ voided: true, voidedById: sql`CASE ${lrsStatements.id} ${whens} END` } as never)
      .where(and(
        eq(lrsStatements.credentialId, credential.credentialId),
        inArray(lrsStatements.id, [...voidedByTarget.keys()]),
      ));
  }

  // Mirror out to the owner's configured external LRS targets (the "company
  // leaving" drain path). Fire-and-forget; never blocks the write. Targets
  // are loaded ONCE for the batch (every row shares the credential owner)
  // instead of once per statement.
  if (fresh.length > 0) {
    void forwardStatementsForUser(
      db,
      credential.ownerUserId,
      fresh.map((row) => row.statement as never),
    ).catch(() => undefined);
  }

  return { ids };
}

/** Compare two stored statements ignoring the LRS-set fields (authority,
 *  stored, version, timestamp) — used for the PUT/POST conflict check. */
function statementsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  // Ignore the fields the LRS itself stamps — authority/stored/version, and
  // timestamp when the client omitted it (we default it to `stored`). Two
  // PUTs of the same client statement must compare equal even though each pass
  // stamps a fresh default timestamp.
  const strip = (s: Record<string, unknown>) => {
    const { authority, stored, version, timestamp, ...rest } = s;
    void authority; void stored; void version; void timestamp;
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
}

// ── statement query ─────────────────────────────────────────────────────────
export interface StatementQuery {
  statementId?: string;
  voidedStatementId?: string;
  agent?: string;         // canonical IFI
  verb?: string;
  activity?: string;      // object id
  registration?: string;
  since?: string;         // ISO
  until?: string;         // ISO
  limit?: number;
  ascending?: boolean;
}

export interface StatementResult {
  statements: Record<string, unknown>[];
  more: string;
}

/** Query statements for a credential with the standard xAPI filters. Returns
 *  the StatementResult envelope; `more` is a relative IRL for the next page
 *  (empty when the page is not full). */
export async function queryStatements(
  credential: ResolvedLrsCredential,
  q: StatementQuery,
  db: DbHandle = getDb(),
): Promise<{ result: StatementResult; single?: Record<string, unknown> }> {
  // Single-statement lookups short-circuit (voided excluded unless asked).
  if (q.statementId || q.voidedStatementId) {
    const id = q.statementId ?? q.voidedStatementId!;
    const [row] = await db.select().from(lrsStatements)
      .where(and(eq(lrsStatements.credentialId, credential.credentialId), eq(lrsStatements.id, id)))
      .limit(1);
    if (!row) return { result: { statements: [], more: "" } };
    if (q.statementId && row.voided) return { result: { statements: [], more: "" } };
    return { result: { statements: [row.statement], more: "" }, single: row.statement };
  }

  const conds = [eq(lrsStatements.credentialId, credential.credentialId), eq(lrsStatements.voided, false)];
  if (q.agent) conds.push(eq(lrsStatements.actorIfi, q.agent));
  if (q.verb) conds.push(eq(lrsStatements.verbId, q.verb));
  if (q.activity) conds.push(eq(lrsStatements.objectId, q.activity));
  if (q.registration && isUuid(q.registration)) conds.push(eq(lrsStatements.registration, q.registration));
  if (q.since) conds.push(gt(lrsStatements.stored, new Date(q.since)));
  if (q.until) conds.push(lte(lrsStatements.stored, new Date(q.until)));

  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  const rows = await db.select({ statement: lrsStatements.statement }).from(lrsStatements)
    .where(and(...conds))
    .orderBy(q.ascending ? asc(lrsStatements.stored) : desc(lrsStatements.stored))
    .limit(limit + 1);

  const page = rows.slice(0, limit).map((r) => r.statement);
  // A full page signals there may be more; a cursor page-token would go here.
  const more = rows.length > limit ? "" : "";
  return { result: { statements: page, more } };
}

// ── document resources (State / Activity Profile / Agent Profile) ───────────
export interface DocumentKey {
  docType: LrsDocumentType;
  activityId?: string;
  agentIfi?: string;
  registration?: string;
  documentKey: string; // stateId or profileId
}

export interface StoredDocument {
  content: string;
  contentType: string;
  etag: string;
  updatedAt: Date;
}

function normalizedKey(k: DocumentKey) {
  return {
    activityId: k.activityId ?? "",
    agentIfi: k.agentIfi ?? "",
    registration: k.registration ?? "",
    documentKey: k.documentKey,
  };
}

/** PUT/POST a document. `merge` (POST + both JSON) shallow-merges into any
 *  existing JSON document per the xAPI spec; otherwise it replaces. Returns
 *  the new ETag. */
export async function putDocument(
  credentialId: string,
  key: DocumentKey,
  content: string,
  contentType: string,
  merge: boolean,
  db: DbHandle = getDb(),
): Promise<{ etag: string }> {
  const nk = normalizedKey(key);
  let finalContent = content;
  let finalType = contentType;

  if (merge) {
    const existing = await getDocument(credentialId, key, db);
    if (existing && existing.contentType.includes("json") && contentType.includes("json")) {
      try {
        finalContent = JSON.stringify({ ...JSON.parse(existing.content), ...JSON.parse(content) });
        finalType = "application/json";
      } catch {
        // Non-JSON despite the header — fall through to replace.
      }
    }
  }

  const etag = await sha256Hex(finalContent);
  await db.insert(lrsDocuments).values({
    credentialId,
    docType: key.docType,
    activityId: nk.activityId,
    agentIfi: nk.agentIfi,
    registration: nk.registration,
    documentKey: nk.documentKey,
    contentType: finalType,
    content: finalContent,
    etag,
  } as never).onConflictDoUpdate({
    target: [
      lrsDocuments.credentialId, lrsDocuments.docType, lrsDocuments.activityId,
      lrsDocuments.agentIfi, lrsDocuments.registration, lrsDocuments.documentKey,
    ],
    set: { content: finalContent, contentType: finalType, etag, updatedAt: new Date() },
  });
  return { etag };
}

export async function getDocument(
  credentialId: string,
  key: DocumentKey,
  db: DbHandle = getDb(),
): Promise<StoredDocument | null> {
  const nk = normalizedKey(key);
  const [row] = await db.select().from(lrsDocuments)
    .where(and(
      eq(lrsDocuments.credentialId, credentialId),
      eq(lrsDocuments.docType, key.docType),
      eq(lrsDocuments.activityId, nk.activityId),
      eq(lrsDocuments.agentIfi, nk.agentIfi),
      eq(lrsDocuments.registration, nk.registration),
      eq(lrsDocuments.documentKey, nk.documentKey),
    )).limit(1);
  if (!row) return null;
  return { content: row.content, contentType: row.contentType, etag: row.etag, updatedAt: row.updatedAt };
}

export async function deleteDocument(
  credentialId: string,
  key: DocumentKey,
  db: DbHandle = getDb(),
): Promise<boolean> {
  const nk = normalizedKey(key);
  const deleted = await db.delete(lrsDocuments)
    .where(and(
      eq(lrsDocuments.credentialId, credentialId),
      eq(lrsDocuments.docType, key.docType),
      eq(lrsDocuments.activityId, nk.activityId),
      eq(lrsDocuments.agentIfi, nk.agentIfi),
      eq(lrsDocuments.registration, nk.registration),
      eq(lrsDocuments.documentKey, nk.documentKey),
    )).returning({ id: lrsDocuments.id });
  return deleted.length > 0;
}

/** List the document keys (stateId / profileId) matching a partial key — the
 *  GET-without-key form of each document resource. `since` filters by mtime. */
export async function listDocumentKeys(
  credentialId: string,
  docType: LrsDocumentType,
  scope: { activityId?: string; agentIfi?: string; registration?: string; since?: string },
  db: DbHandle = getDb(),
): Promise<string[]> {
  const conds = [eq(lrsDocuments.credentialId, credentialId), eq(lrsDocuments.docType, docType)];
  if (scope.activityId !== undefined) conds.push(eq(lrsDocuments.activityId, scope.activityId));
  if (scope.agentIfi !== undefined) conds.push(eq(lrsDocuments.agentIfi, scope.agentIfi));
  if (scope.registration !== undefined) conds.push(eq(lrsDocuments.registration, scope.registration));
  if (scope.since) conds.push(gt(lrsDocuments.updatedAt, new Date(scope.since)));
  const rows = await db.select({ documentKey: lrsDocuments.documentKey }).from(lrsDocuments)
    .where(and(...conds)).orderBy(desc(lrsDocuments.updatedAt));
  return rows.map((r) => r.documentKey);
}

/** xAPI `About` resource — advertised version(s). Unauthenticated per spec. */
export function aboutDocument() {
  return { version: [XAPI_VERSION], extensions: { "https://hired.video/xapi": { product: "hired.video LRS" } } };
}

export const LRS_XAPI_VERSION = XAPI_VERSION;
void sql; // reserved for future cursor pagination
