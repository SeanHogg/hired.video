/**
 * Pending async reports (Microsoft Reporting v13) on the sync-run ledger.
 *
 * A submitted-but-not-ready report is recorded as a `pull_insights_pending`
 * run keyed `report:<id>`; the run that finishes it (rows or failure) is
 * keyed `report-done:<id>`. The unique (platform, idempotency_key) index
 * keeps both single-shot, so no new table is needed.
 */

import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { DbHandle } from "./sync-account.js";

export const PENDING_REPORT_OP = "pull_insights_pending";

export const pendingReportKey = (id: string) => `report:${id}`;
export const doneReportKey = (id: string) => `report-done:${id}`;

export interface PendingReportArgs {
  accountId: string;
  resourceKind: "campaign" | "ad_set" | "ad";
  externalIds?: string[];
  since: string;
  until: string;
}

export interface PendingReport extends PendingReportArgs {
  reportRequestId: string;
}

async function openPendingReports(d: DbHandle, where: SQL | undefined, limit: number): Promise<PendingReport[]> {
  const runs = await d
    .select({
      request: schema.paidMediaSyncRuns.requestPayload,
      response: schema.paidMediaSyncRuns.responsePayload,
    })
    .from(schema.paidMediaSyncRuns)
    .where(where)
    .orderBy(desc(schema.paidMediaSyncRuns.createdAt))
    .limit(limit);
  const candidates = runs
    .map((r) => ({
      args: r.request as PendingReportArgs | null,
      id: (r.response as { reportRequestId?: string } | null)?.reportRequestId,
    }))
    .filter((c): c is { args: PendingReportArgs; id: string } => Boolean(c.args && c.id));
  if (candidates.length === 0) return [];
  const done = await d
    .select({ key: schema.paidMediaSyncRuns.idempotencyKey })
    .from(schema.paidMediaSyncRuns)
    .where(inArray(schema.paidMediaSyncRuns.idempotencyKey, candidates.map((c) => doneReportKey(c.id))));
  const doneKeys = new Set(done.map((r) => r.key));
  return candidates
    .filter((c) => !doneKeys.has(doneReportKey(c.id)))
    .map((c) => ({ ...c.args, reportRequestId: c.id }));
}

/** The open report for exactly this account / kind / range, if any. */
export async function findPendingReport(d: DbHandle, args: PendingReportArgs): Promise<string | null> {
  const open = await openPendingReports(
    d,
    and(
      eq(schema.paidMediaSyncRuns.accountId, args.accountId),
      eq(schema.paidMediaSyncRuns.operation, PENDING_REPORT_OP),
      eq(schema.paidMediaSyncRuns.resourceKind, args.resourceKind),
    ),
    20,
  );
  return open.find((r) => r.since === args.since && r.until === args.until)?.reportRequestId ?? null;
}

/** Bounded batch of open reports, newest first (for the resume sweep). */
export async function listPendingReports(d: DbHandle, limit: number): Promise<PendingReport[]> {
  const open = await openPendingReports(d, eq(schema.paidMediaSyncRuns.operation, PENDING_REPORT_OP), limit * 3);
  return open.slice(0, limit);
}
