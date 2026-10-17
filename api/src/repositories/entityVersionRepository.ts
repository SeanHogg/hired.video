/**
 * EntityVersionRepository — the ONE storage layer for snapshot history
 * (`entity_versions`, W3-E migration 0640): résumés, articles and studio
 * projects. Feature repositories / routes map its rows onto their own
 * response shapes (ResumeVersionRepository, articles/versions.ts,
 * studio-features/versions.ts); nothing here knows a payload's shape.
 *
 * version_number is computed inside the INSERT (MAX + 1 for the subject) and
 * guarded by the (subject_type, subject_id, version_number) unique index:
 * a concurrent writer that loses the race inserts nothing (ON CONFLICT DO
 * NOTHING) and is retried with the next number.
 */
import { and, desc, eq, isNotNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { EntityVersionSubjectType } from "../../../shared/entity-version-subjects.js";

const versions = schema.entityVersions;

export type DbLike = any;

export type EntityVersionRow = typeof versions.$inferSelect;

export interface EntityVersionListItem {
  id: string;
  versionNumber: number;
  label: string | null;
  isAutosave: boolean;
  createdAt: Date;
}

export interface NewEntityVersionInput {
  subjectType: EntityVersionSubjectType;
  subjectId: string;
  userId: string;
  label: string | null;
  payload: unknown;
  isAutosave: boolean;
  proposedByUserId?: string | null;
  reviewId?: string | null;
  proposalStatus?: string | null;
}

/** Tries before giving up on a hot subject (each loss means another writer won). */
const INSERT_ATTEMPTS = 3;

/** `subject_type = $1 AND subject_id = $2` — the subject scope every query starts from. */
export function subjectScope(subjectType: EntityVersionSubjectType, subjectId: string): SQL {
  return and(eq(versions.subjectType, subjectType), eq(versions.subjectId, subjectId)) as SQL;
}

/** In-statement next version number for the subject. */
export function nextVersionNumberSql(subjectType: EntityVersionSubjectType, subjectId: string): SQL<number> {
  return sql<number>`(SELECT COALESCE(MAX(${versions.versionNumber}), 0) + 1 FROM ${versions}
    WHERE ${versions.subjectType} = ${subjectType} AND ${versions.subjectId} = ${subjectId})`;
}

/**
 * Run an insert that computes its own version number until it lands a row.
 * `attempt` returns null when ON CONFLICT swallowed the row (lost the race).
 */
export async function insertWithNextVersion<T>(attempt: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < INSERT_ATTEMPTS; i++) {
    const row = await attempt();
    if (row) return row;
  }
  return null;
}

export class EntityVersionRepository {
  constructor(private readonly db: DbLike) {}

  /** Newest first by version number. `userId` narrows to that author's rows. */
  async list(
    subjectType: EntityVersionSubjectType,
    subjectId: string,
    opts: { limit: number; userId?: string },
  ): Promise<EntityVersionListItem[]> {
    const where = opts.userId
      ? and(subjectScope(subjectType, subjectId), eq(versions.userId, opts.userId))
      : subjectScope(subjectType, subjectId);
    return this.db
      .select({
        id: versions.id,
        versionNumber: versions.versionNumber,
        label: versions.label,
        isAutosave: versions.isAutosave,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(where)
      .orderBy(desc(versions.versionNumber))
      .limit(opts.limit);
  }

  /** One version of the subject; `userId` narrows to that author's rows. */
  async find(
    subjectType: EntityVersionSubjectType,
    subjectId: string,
    versionId: string,
    opts: { userId?: string } = {},
  ): Promise<EntityVersionRow | null> {
    const conds = [subjectScope(subjectType, subjectId), eq(versions.id, versionId)];
    if (opts.userId) conds.push(eq(versions.userId, opts.userId));
    const [row] = await this.db.select().from(versions).where(and(...conds)).limit(1);
    return (row as EntityVersionRow | undefined) ?? null;
  }

  async findById(id: string): Promise<EntityVersionRow | null> {
    const [row] = await this.db.select().from(versions).where(eq(versions.id, id)).limit(1);
    return (row as EntityVersionRow | undefined) ?? null;
  }

  /** Next version number for the subject (callers that show it before inserting). */
  async nextVersionNumber(subjectType: EntityVersionSubjectType, subjectId: string): Promise<number> {
    const [row] = await this.db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${versions.versionNumber}), 0)` })
      .from(versions)
      .where(subjectScope(subjectType, subjectId));
    return Number(row?.maxVersion ?? 0) + 1;
  }

  /** Insert at the subject's next version number (race-safe, see header). */
  async insertNext(input: NewEntityVersionInput): Promise<EntityVersionRow> {
    const row = await insertWithNextVersion<EntityVersionRow>(async () => {
      const [inserted] = await this.db
        .insert(versions)
        .values({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          userId: input.userId,
          versionNumber: nextVersionNumberSql(input.subjectType, input.subjectId),
          label: input.label,
          payload: input.payload ?? null,
          isAutosave: input.isAutosave,
          proposedByUserId: input.proposedByUserId ?? null,
          reviewId: input.reviewId ?? null,
          proposalStatus: input.proposalStatus ?? null,
        })
        .onConflictDoNothing({ target: [versions.subjectType, versions.subjectId, versions.versionNumber] })
        .returning();
      return (inserted as EntityVersionRow | undefined) ?? null;
    });
    if (!row) throw new Error(`entity_versions: could not allocate a version number for ${input.subjectType} ${input.subjectId}`);
    return row;
  }

  /**
   * Autosave retention in ONE statement: delete the subject's autosaves that
   * are older than the window OR outside the newest `cap`. Labelled
   * snapshots (is_autosave = false) are never touched. Returns the count.
   */
  async pruneAutosaves(
    subjectType: EntityVersionSubjectType,
    subjectId: string,
    opts: { cap: number; retentionDays: number; now?: Date },
  ): Promise<number> {
    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - opts.retentionDays * 86_400_000);
    const autosaves = and(subjectScope(subjectType, subjectId), eq(versions.isAutosave, true));
    const newestToKeep = this.db
      .select({ id: versions.id })
      .from(versions)
      .where(autosaves)
      .orderBy(desc(versions.createdAt))
      .limit(opts.cap);
    const deleted = await this.db
      .delete(versions)
      .where(and(autosaves, or(lt(versions.createdAt, cutoff), notInArray(versions.id, newestToKeep))))
      .returning({ id: versions.id });
    return Array.isArray(deleted) ? deleted.length : 0;
  }

  async setProposalStatus(versionId: string, status: string): Promise<EntityVersionRow | null> {
    const [row] = await this.db
      .update(versions)
      .set({ proposalStatus: status })
      .where(eq(versions.id, versionId))
      .returning();
    return (row as EntityVersionRow | undefined) ?? null;
  }

  /** Reviewer-proposed drafts for a review (résumé feedback #1946), newest first. */
  async listProposalsForReview(reviewId: string): Promise<EntityVersionRow[]> {
    return this.db
      .select()
      .from(versions)
      .where(and(eq(versions.reviewId, reviewId), isNotNull(versions.proposedByUserId)))
      .orderBy(desc(versions.createdAt));
  }
}
