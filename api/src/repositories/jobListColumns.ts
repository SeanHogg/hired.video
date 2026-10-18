/**
 * `job_items` projection for card-view list reads.
 *
 * The public listing (`GET /api/jobs?fields=…`) trims each row to the card
 * fields AFTER the query, so the DB still shipped every job's full
 * `description` text and `details` JSONB (usually ~10× the card fields).
 * When the requested projection carries none of the body-derived DTO keys,
 * the list reads with this projection instead: the same row shape (so
 * `rowToJob` is unchanged), with the two body columns blanked in SQL.
 */
import { getTableColumns, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { jobItems } = schema;

/** JobEntity keys that `rowToJob` derives from `description` / `details`. */
export const JOB_BODY_DTO_KEYS = [
  "description",
  "responsibilities",
  "requirements",
  "qualifications",
  "benefits",
  "jobSerialized",
] as const;

/** Every job_items column, with the body columns replaced by empty values. */
export const jobItemCardColumns = {
  ...getTableColumns(jobItems),
  description: sql<string>`''`,
  details: sql<unknown>`NULL`,
};

/** True when a `?fields=` projection (null = full row) needs no body column. */
export function projectionOmitsJobBody(fields: readonly string[] | null): boolean {
  if (!fields || fields.length === 0) return false;
  return !fields.some((f) => (JOB_BODY_DTO_KEYS as readonly string[]).includes(f));
}
