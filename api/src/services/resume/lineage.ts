/**
 * Résumé lineage — THE one module that decides where a résumé copy goes in
 * the master / version model. Every flow that saves a copy (create
 * variation, tailor, merge "save as a version", create-from-a-job, /build's
 * "Save as version of master") goes through `saveVersionOfMaster`, so the
 * rules live here once instead of per route:
 *
 *   • One ★ master per owner (`isMaster`, root).
 *   • A version sits ONE level under the master (`parentId` = master id)
 *     with `diffPercent` vs the master.
 *   • A copy made from a VERSION is saved under that version's master — the
 *     source is never unlinked (it used to be: tailoring a version quietly
 *     made it standalone).
 *   • A copy made from a standalone résumé goes under the owner's master
 *     when there is one ("always a version of the master"); with no master
 *     anywhere it goes under the source itself.
 *   • A version remembers when it last took the master's content in
 *     (`masterSyncedAt`); it is stale once the master is edited after that.
 *   • Facts confirmed in a gap card are written back to the master,
 *     idempotently (shared/resume-tailor.ts applyConfirmedFacts).
 *
 * Repo-only (no HTTP, no Drizzle); callers translate outcomes into their
 * own responses. `diff` is the same recompute port the resume handlers use.
 */
import type { IResumeRepository, ResumeRow } from "../../repositories/index.js";
import { computeDiffPercent } from "../../utils/resume-diff.js";
import { healAndValidateContent, type ResumeContentIssue } from "./content.js";
import { isVersionStale, type ResumeLineage } from "../../../../shared/resume-lineage.js";
import { applyConfirmedFacts, type ConfirmedFact } from "../../../../shared/resume-tailor.js";
import type { ResumeContent } from "../../../../shared/resume.js";

type Clock = () => Date;

/** The master a copy of `source` belongs under (see the rules above). */
export async function masterFor(
  repo: IResumeRepository,
  ownerId: string,
  source: ResumeRow,
): Promise<ResumeRow> {
  if (source.parentId) {
    const parent = await repo.findByIdForOwner(source.parentId, ownerId);
    if (parent) return parent;
  }
  if (source.isMaster) return source;
  return (await repo.findMasterForOwner(ownerId)) ?? source;
}

export interface SaveVersionOutcome {
  ok: boolean;
  row: ResumeRow | null;
  /** The master the version was saved under. */
  masterId: string | null;
  code: "NOT_FOUND" | "INVALID_CONTENT" | null;
  issues: ResumeContentIssue[];
}

/**
 * Save `content` as a new version of `sourceId`'s master. The source itself
 * is never modified.
 */
export async function saveVersionOfMaster(
  repo: IResumeRepository,
  ownerId: string,
  sourceId: string,
  args: { content: unknown; title?: string | null; description?: string | null },
  now: Clock = () => new Date(),
): Promise<SaveVersionOutcome> {
  const source = await repo.findByIdForOwner(sourceId, ownerId);
  if (!source) return { ok: false, row: null, masterId: null, code: "NOT_FOUND", issues: [] };
  const master = await masterFor(repo, ownerId, source);

  const base: Record<string, unknown> =
    args.content && typeof args.content === "object" ? { ...(args.content as Record<string, unknown>) } : {};
  if (typeof args.description === "string") base.variationDescription = args.description;

  const heal = healAndValidateContent(base);
  if (!heal.ok) return { ok: false, row: null, masterId: master.id, code: "INVALID_CONTENT", issues: heal.issues };

  const created = await repo.insertOne({
    userId: ownerId,
    title: (args.title ?? "").trim() || `${master.title} Variation`,
    content: heal.content as Record<string, unknown>,
    status: "draft",
    parentId: master.id,
    isMaster: false,
    isActive: false,
    // A version is always private until its owner publishes it.
    privacyLevel: 10,
    masterSyncedAt: now(),
    diffPercent: computeDiffPercent(
      master.content as Record<string, unknown>,
      heal.content as unknown as Record<string, unknown>,
    ),
  });
  return { ok: true, row: created, masterId: master.id, code: null, issues: [] };
}

/** Where `resumeId` sits in its owner's lineage, for the /build review bar
 *  and the staleness banner. Null when the résumé is not the owner's. */
export async function describeLineage(
  repo: IResumeRepository,
  ownerId: string,
  resumeId: string,
): Promise<ResumeLineage | null> {
  const row = await repo.findByIdForOwner(resumeId, ownerId);
  if (!row) return null;
  const parent = row.parentId ? await repo.findByIdForOwner(row.parentId, ownerId) : null;
  const master = parent ?? (row.isMaster ? row : await repo.findMasterForOwner(ownerId));
  const role: ResumeLineage["role"] = parent ? "version" : row.isMaster ? "master" : "standalone";
  const versionCount = master ? await repo.countChildrenForOwner(master.id, ownerId) : 0;
  return {
    resumeId: row.id,
    role,
    master: master
      ? { id: master.id, title: master.title, updatedAt: new Date(master.updatedAt).toISOString() }
      : null,
    diffPercent: role === "version" ? (row.diffPercent ?? null) : null,
    stale:
      role === "version" && parent !== null &&
      isVersionStale({
        masterUpdatedAt: parent.updatedAt,
        versionSyncedAt: row.masterSyncedAt ?? null,
        versionCreatedAt: row.createdAt,
      }),
    versionCount,
  };
}

/** Record that a version has taken its master's current content in.
 *  `touchUpdatedAt: false` — bookkeeping, not an edit of the version. */
export async function markVersionSynced(
  repo: IResumeRepository,
  ownerId: string,
  versionId: string,
  now: Clock = () => new Date(),
): Promise<boolean> {
  const row = await repo.findByIdForOwner(versionId, ownerId);
  if (!row?.parentId) return false;
  await repo.updateByIdForOwner(versionId, ownerId, { masterSyncedAt: now() }, { touchUpdatedAt: false });
  return true;
}

export type WriteBackOutcome =
  | { ok: true; masterId: string; changed: boolean }
  | { ok: false; code: "NO_MASTER" | "INVALID_CONTENT"; issues: ResumeContentIssue[] };

/**
 * Write confirmed facts to the owner's master. Idempotent — a fact already
 * on the master is not added again, and an unchanged master is not
 * written (so it does not go stale against its versions for nothing).
 */
export async function writeFactsToMaster(
  repo: IResumeRepository,
  ownerId: string,
  facts: readonly ConfirmedFact[],
): Promise<WriteBackOutcome> {
  const master = await repo.findMasterForOwner(ownerId);
  if (!master) return { ok: false, code: "NO_MASTER", issues: [] };
  const before = (master.content ?? {}) as ResumeContent;
  const next = applyConfirmedFacts(before, facts);
  if (next === before) return { ok: true, masterId: master.id, changed: false };
  const heal = healAndValidateContent(next);
  if (!heal.ok) return { ok: false, code: "INVALID_CONTENT", issues: heal.issues };
  await repo.updateByIdForOwner(master.id, ownerId, { content: heal.content as Record<string, unknown> });
  return { ok: true, masterId: master.id, changed: true };
}
