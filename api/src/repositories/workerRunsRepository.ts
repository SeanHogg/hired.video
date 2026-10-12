/**
 * WorkerRunsRepository — read access to `worker_runs` for the SuperAdmin
 * Workers console (`routes/admin-workers.ts`). Writes stay in
 * `workers/runner.ts`.
 */

import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { workerRuns } = schema;

export type DbLike = any;
export type WorkerRunRow = typeof workerRuns.$inferSelect;

export interface IWorkerRunsRepository {
  /** Most recent run per worker name, in ONE query (DISTINCT ON). Workers
   *  with no runs are absent from the map. */
  latestRunPerWorker(workerNames: string[]): Promise<Map<string, WorkerRunRow>>;
  listRunsForWorker(workerName: string, limit: number, offset: number): Promise<WorkerRunRow[]>;
  countRunsForWorker(workerName: string): Promise<number>;
  findRunById(id: string): Promise<WorkerRunRow | null>;
}

export class WorkerRunsRepository implements IWorkerRunsRepository {
  constructor(private readonly db: DbLike) {}

  async latestRunPerWorker(workerNames: string[]): Promise<Map<string, WorkerRunRow>> {
    const out = new Map<string, WorkerRunRow>();
    if (workerNames.length === 0) return out;
    const rows: WorkerRunRow[] = await this.db
      .selectDistinctOn([workerRuns.workerName])
      .from(workerRuns)
      .where(inArray(workerRuns.workerName, workerNames))
      .orderBy(asc(workerRuns.workerName), desc(workerRuns.startedAt));
    for (const r of rows) out.set(r.workerName, r);
    return out;
  }

  async listRunsForWorker(workerName: string, limit: number, offset: number): Promise<WorkerRunRow[]> {
    return this.db
      .select()
      .from(workerRuns)
      .where(eq(workerRuns.workerName, workerName))
      .orderBy(desc(workerRuns.startedAt))
      .limit(limit)
      .offset(offset);
  }

  async countRunsForWorker(workerName: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(workerRuns)
      .where(eq(workerRuns.workerName, workerName));
    return Number(row?.n ?? 0);
  }

  async findRunById(id: string): Promise<WorkerRunRow | null> {
    const [row] = await this.db.select().from(workerRuns).where(eq(workerRuns.id, id)).limit(1);
    return row ?? null;
  }
}
