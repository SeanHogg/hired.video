/**
 * Screening request items — batch writes for request-service. Snapshotting a
 * template onto a request and re-running the pitch-book resolver on claim are
 * fixed-cost (one statement each) instead of one round-trip per item.
 */
import { sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { NewScreeningRequestItem } from "../db/schema/screening.js";

const { screeningRequestItems } = schema;

/** Insert a request's snapshot items in ONE multi-row insert. */
export async function insertScreeningRequestItems(
  db: Db,
  items: readonly NewScreeningRequestItem[],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(screeningRequestItems).values([...items]);
}

/**
 * Mark many items `satisfied` (source `pre_existing`) in ONE statement, each
 * with its own result_ref, via `UPDATE … FROM (VALUES (id, ref) …)`.
 */
export async function markScreeningItemsPreSatisfied(
  db: Db,
  entries: ReadonlyArray<{ id: string; resultRef: Record<string, unknown> | null }>,
  now: Date,
): Promise<void> {
  if (entries.length === 0) return;
  const values = sql.join(
    entries.map(
      (e) => sql`(${e.id}::uuid, ${e.resultRef === null ? null : JSON.stringify(e.resultRef)}::jsonb)`,
    ),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE ${screeningRequestItems}
    SET status = 'satisfied',
        satisfied_source = 'pre_existing',
        result_ref = v.ref,
        satisfied_at = ${now.toISOString()}::timestamptz,
        updated_at = ${now.toISOString()}::timestamptz
    FROM (VALUES ${values}) AS v(id, ref)
    WHERE ${screeningRequestItems.id} = v.id
  `);
}
