/**
 * Paid-media reporting pull: adapter insights → paid_media_insights.
 *
 * Async-report platforms (Microsoft Reporting v13) may answer `pending`.
 * The report id is recorded on the sync-run ledger (sync-reports.ts) and
 * the next pull for the same account / kind / range — or the bounded
 * resumePendingInsightReports() sweep — polls it once more. Nothing here
 * ever block-polls (Workers Free).
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { PaidMediaInsightsRepository } from "../../repositories/paidMediaInsightsRepository.js";
import { getAdapter } from "./ports/registry.js";
import { isPendingInsights, type AdapterContext } from "./ports/types.js";
import { resolveAccount } from "./sync-account.js";
import { recordSyncRun } from "./sync-ledger.js";
import {
  PENDING_REPORT_OP,
  doneReportKey,
  findPendingReport,
  listPendingReports,
  pendingReportKey,
  type PendingReportArgs,
} from "./sync-reports.js";
import type { SyncDeps } from "./sync.js";
import { wakeSweep } from "../scheduling/work-signals.js";

/** Pull insights for a date range and persist them. Caller passes
 *  externalIds (typically all campaign external IDs in the account). */
export async function pullInsightsFromAccount(
  deps: SyncDeps,
  args: PendingReportArgs,
): Promise<{ count: number; pending?: boolean }> {
  const d = deps.db ?? getDb();
  const acct = await resolveAccount(d, deps.env, args.accountId);
  const adapter = getAdapter(deps.env, acct.platform);
  const start = Date.now();
  const pendingReportId = await findPendingReport(d, args);
  const doneKey = pendingReportId ? doneReportKey(pendingReportId) : undefined;
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    const result = await adapter.pullInsights(ctx, {
      resourceKind: args.resourceKind,
      externalIds: args.externalIds,
      since: args.since,
      until: args.until,
      ...(pendingReportId ? { pendingReportId } : {}),
    });
    if (isPendingInsights(result)) {
      if (!pendingReportId) {
        await recordSyncRun(d, {
          platform: acct.platform, accountId: args.accountId, direction: "pull", operation: PENDING_REPORT_OP,
          resourceKind: args.resourceKind, idempotencyKey: pendingReportKey(result.reportRequestId),
          request: args, response: { reportRequestId: result.reportRequestId }, success: true, durationMs: Date.now() - start,
        });
        // A new open report: end the resume sweep's idle deferral.
        await wakeSweep("paid-media-reports");
      }
      return { count: 0, pending: true };
    }
    const rows = result;
    // Map externalId → internalId via paid_media_platform_refs.
    const refs = await d.select().from(schema.paidMediaPlatformRefs)
      .where(and(eq(schema.paidMediaPlatformRefs.accountId, args.accountId), eq(schema.paidMediaPlatformRefs.resourceKind, args.resourceKind)));
    const internalByExternal = new Map(refs.map((r) => [r.externalId, r.internalId]));
    // Multi-row upserts (500/statement) instead of one round-trip per row.
    await new PaidMediaInsightsRepository(d).upsertMany(
      rows.map((row) => ({
        platform:     acct.platform,
        accountId:    args.accountId,
        resourceKind: row.resourceKind,
        internalId:   internalByExternal.get(row.externalId) ?? null,
        externalId:   row.externalId,
        date:         row.date,
        impressions:  row.impressions,
        clicks:       row.clicks,
        spendCents:   row.spendCents,
        conversions:  row.conversions,
        videoViews:   row.videoViews,
        rawMetrics:   row.rawMetrics,
      })),
      new Date(),
    );
    await recordSyncRun(d, { platform: acct.platform, accountId: args.accountId, direction: "pull", operation: "pull_insights", resourceKind: args.resourceKind, idempotencyKey: doneKey, success: true, durationMs: Date.now() - start, response: { count: rows.length } });
    return { count: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A failed report is closed too, so it isn't polled forever.
    await recordSyncRun(d, { platform: acct.platform, accountId: args.accountId, direction: "pull", operation: "pull_insights", resourceKind: args.resourceKind, idempotencyKey: doneKey, success: false, errorMessage: message, durationMs: Date.now() - start });
    throw err;
  }
}

/** Cron-safe resume sweep: poll at most `limit` open async reports, once
 *  each; the rest wait for the next run. */
export async function resumePendingInsightReports(
  deps: SyncDeps,
  limit = 3,
): Promise<{ checked: number; completed: number; stillPending: number; failed: number }> {
  const d = deps.db ?? getDb();
  const open = await listPendingReports(d, limit);
  let completed = 0;
  let stillPending = 0;
  let failed = 0;
  for (const { reportRequestId: _reportRequestId, ...args } of open) {
    try {
      const r = await pullInsightsFromAccount({ ...deps, db: d }, args);
      if (r.pending) stillPending += 1;
      else completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { checked: open.length, completed, stillPending, failed };
}
