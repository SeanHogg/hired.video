/**
 * The master / version model, as the client sees it.
 *
 *   ★ Master   one per person: the record of everything (`isMaster`, root).
 *   Version    a copy fitted to one job, ONE level under the master
 *              (`parentId` = master id, `diffPercent` vs the master).
 *   Standalone any other root résumé (no master relationship).
 *
 * The rules that decide where a new copy goes live in ONE API module
 * (api/src/services/resume/lineage.ts); this file only holds the wire shape
 * and the staleness predicate both sides agree on.
 */
import { z } from "zod";

export const ResumeLineageRoleSchema = z.enum(["master", "version", "standalone"]);
export type ResumeLineageRole = z.infer<typeof ResumeLineageRoleSchema>;

export const ResumeLineageSchema = z.object({
  resumeId: z.string(),
  role: ResumeLineageRoleSchema,
  /** The master this résumé belongs to (itself for a master; the person's
   *  master for a standalone, so merge/tailor can still target it). Null
   *  when the person has no master at all. */
  master: z
    .object({ id: z.string(), title: z.string(), updatedAt: z.string() })
    .nullable(),
  /** % different from the master (versions only). */
  diffPercent: z.number().nullable(),
  /** A version whose master changed after it last took the master's
   *  content in ("Pull into this version"). Always false otherwise. */
  stale: z.boolean(),
  /** How many versions sit under the master (for "2 versions" copy). */
  versionCount: z.number().int().nonnegative(),
});
export type ResumeLineage = z.infer<typeof ResumeLineageSchema>;

/** A version is stale when its master was edited after the version was
 *  made / last pulled the master in. */
export function isVersionStale(args: {
  masterUpdatedAt: Date | string;
  versionSyncedAt: Date | string | null;
  versionCreatedAt: Date | string;
}): boolean {
  const master = new Date(args.masterUpdatedAt).getTime();
  const synced = new Date(args.versionSyncedAt ?? args.versionCreatedAt).getTime();
  return Number.isFinite(master) && Number.isFinite(synced) && master > synced;
}
