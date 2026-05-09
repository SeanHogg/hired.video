import {
  pgTable,
  index,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// Generic batch-worker run log. One row per execution of any worker
// registered in api/src/workers/registry.ts. See migration
// 0080_worker_runs_and_job_cleanse.sql for the design rationale and
// the distinction from queue_job_to_process (per-item task queue).
export const workerRuns = pgTable(
  "worker_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerName: varchar("worker_name", { length: 64 }).notNull(),
    // running | success | partial | error
    status: varchar("status", { length: 16 }).notNull().default("running"),
    // manual | cron — distinguishes SuperAdmin-triggered runs from scheduled ticks
    trigger: varchar("trigger", { length: 16 }).notNull().default("cron"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    itemsScanned: integer("items_scanned").notNull().default(0),
    itemsChanged: integer("items_changed").notNull().default(0),
    itemsSkipped: integer("items_skipped").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    errorMessage: text("error_message"),
    // Bounded jsonb: per-item failure rows + sampled diffs. The runner caps size.
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("worker_runs_worker_started_idx").on(t.workerName, t.startedAt),
  ],
);

export type WorkerRun = typeof workerRuns.$inferSelect;
export type NewWorkerRun = typeof workerRuns.$inferInsert;
