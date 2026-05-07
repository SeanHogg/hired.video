/**
 * Vendor Sync — `profile_sync_runs` persistence layer.
 *
 * Single entry point for every write/read against the audit table, so the
 * routes and the (deferred) variant-effectiveness analytics never have to
 * agree on the row shape independently. Mirrors the lifecycle described
 * in migration 0079_profile_sync_runs.sql:
 *
 *   pending → success | failed | cancelled
 *
 * `recordImport` is called BEFORE the LLM extract so we capture failures.
 * `finalizeImport` flips the row to success once the user commits the
 * merge or cancels — stale `pending` rows older than ~1 day can be
 * swept by a future cron, not in this PR.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ProfileSyncRun } from "../../db/schema/vendor-sync.js";

export type SyncDirection = "import" | "export";
export type SyncStatus = "pending" | "success" | "failed" | "cancelled";

export interface RecordImportInput {
  userId: string;
  connectorId: string;
  targetResumeId: string;
  sourceUrl: string;
}

export interface RecordExportInput {
  userId: string;
  connectorId: string;
  sourceResumeId: string;
  notes?: string | null;
}

export interface FinalizeInput {
  runId: string;
  userId: string;
  status: Exclude<SyncStatus, "pending">;
  analysisSnapshot?: unknown;
  decisionsSnapshot?: unknown;
  resultSnapshot?: unknown;
  errorMessage?: string | null;
}

export async function recordImportStart(input: RecordImportInput): Promise<ProfileSyncRun> {
  const db = getDb();
  const [row] = await db
    .insert(schema.profileSyncRuns)
    .values({
      userId: input.userId,
      connectorId: input.connectorId,
      direction: "import" as SyncDirection,
      status: "pending" as SyncStatus,
      targetResumeId: input.targetResumeId,
      sourceUrl: input.sourceUrl,
    })
    .returning();
  return row;
}

export async function recordExportRun(input: RecordExportInput): Promise<ProfileSyncRun> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(schema.profileSyncRuns)
    .values({
      userId: input.userId,
      connectorId: input.connectorId,
      direction: "export" as SyncDirection,
      // Export runs land terminal because there's no async wait — the
      // user has rendered/copied the blocks by the time they hit "Mark
      // synced". A failure on the export side has no DB write.
      status: "success" as SyncStatus,
      sourceResumeId: input.sourceResumeId,
      notes: input.notes ?? null,
      manualMarkedAt: now,
      completedAt: now,
    })
    .returning();
  return row;
}

export async function finalizeRun(input: FinalizeInput): Promise<ProfileSyncRun | null> {
  const db = getDb();
  const [row] = await db
    .update(schema.profileSyncRuns)
    .set({
      status: input.status,
      analysisSnapshot: input.analysisSnapshot ?? null,
      decisionsSnapshot: input.decisionsSnapshot ?? null,
      resultSnapshot: input.resultSnapshot ?? null,
      errorMessage: input.errorMessage ?? null,
      completedAt: new Date(),
    })
    .where(and(
      eq(schema.profileSyncRuns.id, input.runId),
      eq(schema.profileSyncRuns.userId, input.userId),
    ))
    .returning();
  return row ?? null;
}

export interface ListRunsInput {
  userId: string;
  connectorId?: string;
  resumeId?: string;
  limit?: number;
}

export async function listRuns(input: ListRunsInput): Promise<ProfileSyncRun[]> {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const filters = [eq(schema.profileSyncRuns.userId, input.userId)];
  if (input.connectorId) filters.push(eq(schema.profileSyncRuns.connectorId, input.connectorId));
  // Match either side of the resume FK — a row is "about" the resume
  // whether it was imported into or exported from.
  if (input.resumeId) {
    return await db
      .select()
      .from(schema.profileSyncRuns)
      .where(and(
        ...filters,
        // OR: target = resumeId OR source = resumeId
        // drizzle's `or` import is heavier; pull it lazily.
        // (await import here keeps the cold path lean.)
        (await import("drizzle-orm")).or(
          eq(schema.profileSyncRuns.targetResumeId, input.resumeId),
          eq(schema.profileSyncRuns.sourceResumeId, input.resumeId),
        )!,
      ))
      .orderBy(desc(schema.profileSyncRuns.startedAt))
      .limit(limit);
  }

  return await db
    .select()
    .from(schema.profileSyncRuns)
    .where(and(...filters))
    .orderBy(desc(schema.profileSyncRuns.startedAt))
    .limit(limit);
}

/** Latest successful run per connector for a user — drives the
 *  "Last synced [date]" badge on each VendorCard. */
export async function lastRunPerConnector(userId: string): Promise<Record<string, ProfileSyncRun>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.profileSyncRuns)
    .where(and(
      eq(schema.profileSyncRuns.userId, userId),
      eq(schema.profileSyncRuns.status, "success"),
    ))
    .orderBy(desc(schema.profileSyncRuns.startedAt));

  const out: Record<string, ProfileSyncRun> = {};
  for (const r of rows) {
    if (!out[r.connectorId]) out[r.connectorId] = r;
  }
  return out;
}
