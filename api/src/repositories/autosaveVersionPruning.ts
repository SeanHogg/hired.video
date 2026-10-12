/**
 * Autosave-version retention — shared by every "versions" table that keeps a
 * capped, time-boxed ring of autosaves alongside user-labeled snapshots
 * (resume_versions, article_versions). Labeled snapshots (is_autosave=false)
 * are never touched.
 *
 * ONE statement: delete autosaves for the parent that are either older than
 * the retention window OR outside the newest `cap` autosaves. Equivalent to
 * "drop expired, then cap the remainder" because expired rows are always the
 * oldest — but without the select + per-row delete round-trips.
 */
import { and, desc, eq, lt, notInArray, or } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../db/index.js";

export interface AutosaveVersionTable {
  table: PgTable;
  id: PgColumn;
  /** FK to the owning document (resumeId / articleId). */
  parentId: PgColumn;
  isAutosave: PgColumn;
  createdAt: PgColumn;
}

export async function pruneAutosaveVersions(
  db: Db,
  t: AutosaveVersionTable,
  parentId: string,
  opts: { cap: number; retentionDays: number; now?: Date },
): Promise<void> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.retentionDays * 86_400_000);
  const newestToKeep = db
    .select({ id: t.id })
    .from(t.table)
    .where(and(eq(t.parentId, parentId), eq(t.isAutosave, true)))
    .orderBy(desc(t.createdAt))
    .limit(opts.cap);
  await db.delete(t.table).where(
    and(
      eq(t.parentId, parentId),
      eq(t.isAutosave, true),
      or(lt(t.createdAt, cutoff), notInArray(t.id, newestToKeep)),
    ),
  );
}
