import { Hono } from "hono";
import { count, desc, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import { workers as registeredWorkers, getWorker } from "../workers/registry.js";
import { runWorker } from "../workers/runner.js";

export const adminWorkerRoutes = new Hono<AppEnv>();

adminWorkerRoutes.use("*", superAdminMiddleware);

// ---------------------------------------------------------------------------
// GET /api/admin/workers — list every registered worker + its latest run.
// Drives the Workers admin landing page.
// ---------------------------------------------------------------------------
adminWorkerRoutes.get("/", async (c) => {
  const db = getDb();

  // Fetch the most recent run per worker. A correlated lateral would be
  // tighter, but the registry is small enough (low double-digits) that
  // N+1 SELECTs are fine and simpler to read.
  const items = await Promise.all(
    registeredWorkers.map(async (worker) => {
      const [latest] = await db
        .select()
        .from(schema.workerRuns)
        .where(eq(schema.workerRuns.workerName, worker.name))
        .orderBy(desc(schema.workerRuns.startedAt))
        .limit(1);

      return {
        name: worker.name,
        displayName: worker.displayName,
        description: worker.description,
        cadenceMs: worker.cadenceMs,
        batchSize: worker.batchSize,
        latestRun: latest
          ? {
              id: latest.id,
              status: latest.status,
              trigger: latest.trigger,
              itemsScanned: latest.itemsScanned,
              itemsChanged: latest.itemsChanged,
              itemsSkipped: latest.itemsSkipped,
              itemsFailed: latest.itemsFailed,
              errorMessage: latest.errorMessage,
              startedAt: latest.startedAt,
              completedAt: latest.completedAt,
            }
          : null,
      };
    }),
  );

  return c.json(ok({ workers: items }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/admin/workers/:name/runs — paginated run history for one worker.
// ---------------------------------------------------------------------------
adminWorkerRoutes.get("/:name/runs", async (c) => {
  const name = c.req.param("name");
  const worker = getWorker(name);
  if (!worker) {
    return c.json({ error: { code: "NOT_FOUND", message: "Worker not found" } }, 404);
  }

  const db = getDb();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(schema.workerRuns)
      .where(eq(schema.workerRuns.workerName, name))
      .orderBy(desc(schema.workerRuns.startedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(schema.workerRuns)
      .where(eq(schema.workerRuns.workerName, name)),
  ]);

  // Strip the heavy `details` jsonb from list responses — drill-in fetches
  // it on demand. This keeps the run history page snappy even for workers
  // that have accumulated thousands of runs with rich failure logs.
  const runs = rows.map(({ details: _details, ...rest }) => rest);

  return c.json(
    ok({
      runs,
      total: totalRow?.n ?? 0,
      page,
      limit,
      worker: {
        name: worker.name,
        displayName: worker.displayName,
        description: worker.description,
      },
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /api/admin/workers/:name/runs/:runId — full run record incl. details.
// ---------------------------------------------------------------------------
adminWorkerRoutes.get("/:name/runs/:runId", async (c) => {
  const name = c.req.param("name");
  const runId = c.req.param("runId");
  const db = getDb();

  const [run] = await db
    .select()
    .from(schema.workerRuns)
    .where(eq(schema.workerRuns.id, runId))
    .limit(1);

  if (!run || run.workerName !== name) {
    return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
  }

  return c.json(ok({ run }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/admin/workers/:name/run — manual trigger ("run now" button).
// Bypasses cadence; runs synchronously within the request. With BATCH_SIZE
// of 50 this fits comfortably under Cloudflare Workers' 30s wall budget
// for ordinary cleanse workloads.
// ---------------------------------------------------------------------------
adminWorkerRoutes.post("/:name/run", async (c) => {
  const name = c.req.param("name");
  const worker = getWorker(name);
  if (!worker) {
    return c.json({ error: { code: "NOT_FOUND", message: "Worker not found" } }, 404);
  }

  const triggeredBy = c.var.user?.sub ?? null;
  const summary = await runWorker(worker, "manual", triggeredBy);
  return c.json(ok({ run: summary }), 200);
});
