import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { WorkerRunsRepository } from "../repositories/workerRunsRepository.js";
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
  // Most recent run per worker in ONE DISTINCT ON query.
  const latestByName = await new WorkerRunsRepository(getDb()).latestRunPerWorker(
    registeredWorkers.map((w) => w.name),
  );
  const items = registeredWorkers.map((worker) => {
      const latest = latestByName.get(worker.name);
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
    });

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

  const repo = new WorkerRunsRepository(getDb());
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    repo.listRunsForWorker(name, limit, offset),
    repo.countRunsForWorker(name),
  ]);

  // Strip the heavy `details` jsonb from list responses — drill-in fetches
  // it on demand. This keeps the run history page snappy even for workers
  // that have accumulated thousands of runs with rich failure logs.
  const runs = rows.map(({ details: _details, ...rest }) => rest);

  return c.json(
    ok({
      runs,
      total,
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
  const run = await new WorkerRunsRepository(getDb()).findRunById(runId);

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
