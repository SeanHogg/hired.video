/**
 * xAPI data access for the authenticated learning surface:
 *   • LRS credentials (mig 0490) — owner-scoped Basic-auth keys external
 *     tools use against the conformant LRS.
 *   • Internal statement ingest (`xapi_statements`) from the lesson player.
 *   • External LRS targets (`external_lrs_targets`) — per-user forwarding.
 * The conformant LRS itself reads/writes through services/learning/lrs-service.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { LrsCredential } from "../db/schema/learning.js";

export { XAPI_VERBS } from "../db/schema/learning.js";

const { lrsCredentials, courseEnrollments, xapiStatements, externalLrsTargets } = schema;

// ── LRS credentials ──────────────────────────────────────────────────────────

export async function listLrsCredentialsByOwner(db: Db, ownerUserId: string): Promise<LrsCredential[]> {
  return db.select().from(lrsCredentials)
    .where(eq(lrsCredentials.ownerUserId, ownerUserId))
    .orderBy(desc(lrsCredentials.createdAt));
}

export async function findOwnedLrsCredential(db: Db, ownerUserId: string, id: string): Promise<LrsCredential | null> {
  const [row] = await db.select().from(lrsCredentials)
    .where(and(eq(lrsCredentials.id, id), eq(lrsCredentials.ownerUserId, ownerUserId)))
    .limit(1);
  return row ?? null;
}

export async function insertLrsCredential(
  db: Db,
  values: { ownerUserId: string; label: string; keyId: string; secretHash: string; permission: string; createdBy: string },
): Promise<LrsCredential> {
  const [row] = await db.insert(lrsCredentials).values(values as never).returning();
  return row as LrsCredential;
}

export async function updateOwnedLrsCredential(
  db: Db,
  ownerUserId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<LrsCredential | null> {
  const [row] = await db.update(lrsCredentials)
    .set({ ...patch, updatedAt: new Date() } as never)
    .where(and(eq(lrsCredentials.id, id), eq(lrsCredentials.ownerUserId, ownerUserId)))
    .returning();
  return (row as LrsCredential | undefined) ?? null;
}

// ── Internal statement ingest ────────────────────────────────────────────────

export async function enrollmentBelongsTo(db: Db, enrollmentId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.id, enrollmentId), eq(courseEnrollments.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function insertInternalStatement(db: Db, values: Record<string, unknown>): Promise<string> {
  const [row] = await db.insert(xapiStatements).values(values as never).returning({ id: xapiStatements.id });
  return row!.id;
}

// ── External LRS targets ─────────────────────────────────────────────────────

/** Safe projection — never returns the stored auth token. */
export async function listExternalLrsTargets(db: Db, userId: string) {
  return db.select({
    id: externalLrsTargets.id,
    endpoint: externalLrsTargets.endpoint,
    authMode: externalLrsTargets.authMode,
    customHeaders: externalLrsTargets.customHeaders,
    active: externalLrsTargets.active,
    lastSuccessAt: externalLrsTargets.lastSuccessAt,
    lastErrorAt: externalLrsTargets.lastErrorAt,
    lastError: externalLrsTargets.lastError,
    createdAt: externalLrsTargets.createdAt,
  })
    .from(externalLrsTargets)
    .where(eq(externalLrsTargets.userId, userId));
}

export async function insertExternalLrsTarget(db: Db, values: Record<string, unknown>) {
  const [row] = await db.insert(externalLrsTargets).values(values as never).returning();
  return row;
}

export async function updateOwnedExternalLrsTarget(
  db: Db,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const [row] = await db.update(externalLrsTargets)
    .set({ ...patch, updatedAt: new Date() } as never)
    .where(and(eq(externalLrsTargets.id, id), eq(externalLrsTargets.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteOwnedExternalLrsTarget(db: Db, userId: string, id: string): Promise<string | null> {
  const [row] = await db.delete(externalLrsTargets)
    .where(and(eq(externalLrsTargets.id, id), eq(externalLrsTargets.userId, userId)))
    .returning({ id: externalLrsTargets.id });
  return row?.id ?? null;
}
