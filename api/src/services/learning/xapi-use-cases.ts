/**
 * Authenticated xAPI use cases behind /api/learning/xapi:
 *   • LRS credential management (owner-scoped; secret returned once)
 *   • internal statement ingest from the lesson player / SCORM runtimes
 *   • external LRS forwarding targets
 *   • resolving an owned credential as the target of a statement import
 * The conformant LRS itself (Basic-auth) lives in lrs-service.ts.
 */
import { getDb } from "../../db/index.js";
import type { LrsCredential } from "../../db/schema/learning.js";
import * as repo from "../../repositories/learningXapiRepository.js";
import { generateLrsSecret, basicAuthValue, type ResolvedLrsCredential } from "./lrs-service.js";
import { forwardStatementForUser } from "./lrs-forwarder.js";

export { LRS_PERMISSIONS } from "../../db/schema/learning.js";

/**
 * Canonical base URL of the conformant xAPI LRS — the value shown to users to
 * paste into external xAPI tools. `/api/xapi` remains mounted as an alias for
 * tools configured before the move (see app.ts).
 */
export const LRS_ENDPOINT_PATH = "/api/learning/xapi/lrs";

// ── LRS credentials ──────────────────────────────────────────────────────────

/** Safe projection — never leaks secret_hash. */
export function toCredentialView(row: LrsCredential) {
  return {
    id: row.id,
    label: row.label,
    keyId: row.keyId,
    permission: row.permission,
    active: row.active,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export async function listCredentials(ownerUserId: string) {
  const rows = await repo.listLrsCredentialsByOwner(getDb(), ownerUserId);
  return { endpoint: LRS_ENDPOINT_PATH, credentials: rows.map(toCredentialView) };
}

/** Issue a credential. Secret + ready-to-use Basic header returned ONCE. */
export async function createCredential(ownerUserId: string, label: string, permission: string) {
  const { keyId, secret, secretHash } = await generateLrsSecret();
  const row = await repo.insertLrsCredential(getDb(), {
    ownerUserId,
    label,
    keyId,
    secretHash,
    permission,
    createdBy: ownerUserId,
  });
  return {
    credential: toCredentialView(row),
    secret,
    basicAuth: basicAuthValue(keyId, secret),
    endpoint: LRS_ENDPOINT_PATH,
  };
}

/** Mint a fresh secret for an existing credential (old one stops working). */
export async function rotateCredential(ownerUserId: string, id: string) {
  const { keyId, secret, secretHash } = await generateLrsSecret();
  const row = await repo.updateOwnedLrsCredential(getDb(), ownerUserId, id, { keyId, secretHash });
  if (!row) return null;
  return {
    credential: toCredentialView(row),
    secret,
    basicAuth: basicAuthValue(keyId, secret),
    endpoint: LRS_ENDPOINT_PATH,
  };
}

export async function updateCredential(
  ownerUserId: string,
  id: string,
  patch: { label?: string; permission?: string; active?: boolean },
) {
  const row = await repo.updateOwnedLrsCredential(getDb(), ownerUserId, id, patch);
  return row ? toCredentialView(row) : null;
}

/** Soft-revoke (active=false); statements + documents are retained. */
export async function revokeCredential(ownerUserId: string, id: string): Promise<string | null> {
  const row = await repo.updateOwnedLrsCredential(getDb(), ownerUserId, id, { active: false });
  return row?.id ?? null;
}

/** The owner's credential shaped as the LRS write principal, or null. */
export async function resolveOwnedCredential(ownerUserId: string, id: string): Promise<ResolvedLrsCredential | null> {
  const cred = await repo.findOwnedLrsCredential(getDb(), ownerUserId, id);
  if (!cred) return null;
  return {
    credentialId: cred.id,
    ownerUserId: cred.ownerUserId,
    ownerCompanyId: cred.ownerCompanyId ?? null,
    permission: cred.permission as ResolvedLrsCredential["permission"],
  };
}

// ── Internal statement ingest ────────────────────────────────────────────────

export interface InternalStatementInput {
  enrollmentId?: string;
  lessonId?: string;
  courseId?: string;
  verb: { id: string; display?: string };
  object: { id: string; objectType?: string };
  result?: {
    score?: { scaled?: number; raw?: number };
    success?: boolean;
    completion?: boolean;
    duration?: string;
  };
  context?: Record<string, unknown>;
  timestamp?: string;
}

/** Persist one statement for the signed-in learner, then mirror it to every
 *  active external LRS target (fire-and-forget — a slow/down customer LRS
 *  never affects the internal write path). Null when the enrollment given
 *  isn't the learner's. */
export async function ingestInternalStatement(userId: string, data: InternalStatementInput): Promise<string | null> {
  const db = getDb();
  if (data.enrollmentId && !(await repo.enrollmentBelongsTo(db, data.enrollmentId, userId))) return null;

  const resultScore = data.result?.score?.scaled ?? data.result?.score?.raw ?? null;
  const id = await repo.insertInternalStatement(db, {
    userId,
    enrollmentId: data.enrollmentId ?? null,
    lessonId: data.lessonId ?? null,
    courseId: data.courseId ?? null,
    verbId: data.verb.id,
    verbDisplay: data.verb.display ?? null,
    objectId: data.object.id,
    objectType: data.object.objectType ?? "Activity",
    resultScore,
    resultSuccess: data.result?.success ?? null,
    statement: data as unknown as Record<string, unknown>,
  });

  void forwardStatementForUser(db, userId, data as never).catch(() => undefined);
  return id;
}

// ── External LRS targets ─────────────────────────────────────────────────────

export function listTargets(userId: string) {
  return repo.listExternalLrsTargets(getDb(), userId);
}

export function createTarget(
  userId: string,
  input: { endpoint: string; authMode: string; authToken?: string; customHeaders?: Record<string, string>; active: boolean },
) {
  return repo.insertExternalLrsTarget(getDb(), {
    userId,
    endpoint: input.endpoint,
    authMode: input.authMode,
    authToken: input.authToken ?? null,
    customHeaders: input.customHeaders ?? null,
    active: input.active,
  });
}

export function updateTarget(userId: string, id: string, patch: Record<string, unknown>) {
  return repo.updateOwnedExternalLrsTarget(getDb(), userId, id, patch);
}

export function deleteTarget(userId: string, id: string): Promise<string | null> {
  return repo.deleteOwnedExternalLrsTarget(getDb(), userId, id);
}
