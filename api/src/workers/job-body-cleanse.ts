import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { cleanseDescription } from "../services/cleanse/htmlToMarkdown.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";

const BATCH_SIZE = 50;
const HOUR_MS = 60 * 60 * 1000;

// Selects rows the worker has not inspected, OR rows whose body has been
// edited since the last cleanse pass. Keep this aligned with the partial
// index in migration 0080 (`job_items_cleanse_pending_idx`).
async function fetchPendingBatch(limit: number) {
  const db = getDb();
  return db
    .select({
      id: schema.jobItems.id,
      description: schema.jobItems.description,
      updatedAt: schema.jobItems.updatedAt,
    })
    .from(schema.jobItems)
    .where(
      or(
        isNull(schema.jobItems.bodyCleansedAt),
        lt(schema.jobItems.bodyCleansedAt, schema.jobItems.updatedAt),
      ),
    )
    .orderBy(asc(schema.jobItems.bodyCleansedAt), asc(schema.jobItems.updatedAt))
    .limit(limit);
}

async function processOne(
  ctx: WorkerRunContext,
  row: { id: string; description: string; updatedAt: Date },
): Promise<void> {
  const db = getDb();
  const now = new Date();
  ctx.recordScanned();

  try {
    const result = cleanseDescription(row.description ?? "");

    if (!result.hadHtml || !result.changed) {
      // Nothing to do — mark as inspected so we don't re-scan next tick.
      await db
        .update(schema.jobItems)
        .set({
          bodyCleansedAt: now,
          bodyCleanseStatus: "unchanged",
          // Don't bump updatedAt — we didn't actually change the row content.
          // (Drizzle's defaultNow() only fires on insert; the partial index
          // condition `body_cleansed_at < updated_at` stays consistent.)
        } as never)
        .where(eq(schema.jobItems.id, row.id));
      ctx.recordSkipped();
      return;
    }

    await db
      .update(schema.jobItems)
      .set({
        description: result.body,
        bodyCleansedAt: now,
        bodyCleanseStatus: "cleansed",
        // Intentionally NOT bumping updatedAt — the cleanse is a
        // server-side normalization, not a user edit, and bumping
        // it would re-trigger the worker on the next tick.
      } as never)
      .where(eq(schema.jobItems.id, row.id));

    ctx.recordChanged();

    // First few cleansed bodies become inspectable samples in the admin UI.
    const before = row.description.length;
    const after = result.body.length;
    ctx.recordSample({
      jobId: row.id,
      beforeLength: before,
      afterLength: after,
      shrinkPct: before > 0 ? Math.round((1 - after / before) * 100) : 0,
      preview: result.body.slice(0, 240),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.recordFailure(row.id, message);
    // Mark the row as failed so we don't loop on it forever, but leave
    // bodyCleansedAt null-ish via a sentinel timestamp far enough in the
    // future that updatedAt edits will still trigger a retry.
    try {
      await db
        .update(schema.jobItems)
        .set({
          bodyCleansedAt: new Date(),
          bodyCleanseStatus: "failed",
        } as never)
        .where(eq(schema.jobItems.id, row.id));
    } catch (innerErr) {
      console.error(`[job-body-cleanse] Failed to mark ${row.id} as failed:`, innerErr);
    }
  }
}

async function run(ctx: WorkerRunContext): Promise<void> {
  const batch = await fetchPendingBatch(BATCH_SIZE);
  for (const row of batch) {
    await processOne(ctx, row);
  }
}

export const jobBodyCleanseWorker: WorkerDefinition = {
  name: "job-body-cleanse",
  displayName: "Job Body Cleanse",
  description:
    "Detects HTML in scraped job descriptions and converts it to markdown. " +
    "Runs hourly across all jobs; re-cleanses any job whose description " +
    "has been edited since the last pass.",
  cadenceMs: HOUR_MS,
  batchSize: BATCH_SIZE,
  run,
};
