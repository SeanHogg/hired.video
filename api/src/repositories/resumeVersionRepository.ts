/**
 * Résumé snapshot history (#155) — `entity_versions` rows with
 * subject_type 'resume' (W3-E, migration 0640; was `resume_versions`).
 * Autosave rows are capped + aged out, labelled snapshots live until the
 * parent résumé is deleted (subject-delete trigger).
 *
 * Rows are mapped back onto the historical ResumeVersionRow shape
 * (`resumeId`, `resumeData`) so API responses are unchanged.
 *
 * Also the "watched résumés" read (#403) — the one other résumé query that
 * joins a side table.
 */
import { desc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import {
  EntityVersionRepository,
  insertWithNextVersion,
  nextVersionNumberSql,
  type EntityVersionListItem,
  type EntityVersionRow,
} from "./entityVersionRepository.js";
import type { DbLike } from "./resumeRepository.js";

const versions = schema.entityVersions;
const resumes = schema.resumeInformation;

const SUBJECT = "resume" as const;

/** The résumé view of an `entity_versions` row (the old resume_versions shape). */
export interface ResumeVersionRow {
  id: string;
  resumeId: string;
  userId: string;
  versionNumber: number;
  label: string | null;
  resumeData: unknown;
  isAutosave: boolean;
  proposedByUserId: string | null;
  reviewId: string | null;
  proposalStatus: string | null;
  createdAt: Date;
}

/** Insert shape for a résumé version (reviewer-proposed drafts set the proposal columns). */
export interface ResumeVersionInsert {
  resumeId: string;
  userId: string;
  label?: string | null;
  resumeData: unknown;
  isAutosave?: boolean;
  proposedByUserId?: string | null;
  reviewId?: string | null;
  proposalStatus?: string | null;
}

export type ResumeVersionListItem = EntityVersionListItem;

export function toResumeVersionRow(row: EntityVersionRow): ResumeVersionRow {
  return {
    id: row.id,
    resumeId: row.subjectId,
    userId: row.userId,
    versionNumber: row.versionNumber,
    label: row.label,
    resumeData: row.payload,
    isAutosave: row.isAutosave,
    proposedByUserId: row.proposedByUserId,
    reviewId: row.reviewId,
    proposalStatus: row.proposalStatus,
    createdAt: row.createdAt,
  };
}

export class ResumeVersionRepository {
  private readonly versions: EntityVersionRepository;

  constructor(private readonly db: DbLike) {
    this.versions = new EntityVersionRepository(db);
  }

  /** The résumé's owner id, or null when it does not exist. */
  async ownerOf(resumeId: string): Promise<string | null> {
    const [row] = await this.db.select({ userId: resumes.userId }).from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    return (row?.userId as string | undefined) ?? null;
  }

  async listForResume(resumeId: string): Promise<ResumeVersionListItem[]> {
    return this.versions.list(SUBJECT, resumeId, { limit: 200 });
  }

  /**
   * ONE round-trip: snapshot the parent's content into the next version
   * number, only when `userId` owns the résumé. Null = missing or not theirs
   * (the caller probes `ownerOf` on that failure path for the status). A lost
   * version-number race inserts nothing and is retried (see
   * EntityVersionRepository header).
   */
  async insertSnapshot(
    resumeId: string,
    userId: string,
    input: { label: string | null; isAutosave: boolean },
  ): Promise<ResumeVersionRow | null> {
    return insertWithNextVersion<ResumeVersionRow>(async () => {
      const inserted = await this.db.execute(sql`
        INSERT INTO ${versions} (subject_type, subject_id, user_id, version_number, label, payload, is_autosave)
        SELECT ${SUBJECT}::varchar, ${resumes.id}, ${resumes.userId},
               ${nextVersionNumberSql(SUBJECT, resumeId)},
               ${input.label}::varchar, ${resumes.content}, ${input.isAutosave}::boolean
          FROM ${resumes}
         WHERE ${resumes.id} = ${resumeId} AND ${resumes.userId} = ${userId}
        ON CONFLICT (subject_type, subject_id, version_number) DO NOTHING
        RETURNING id, subject_id AS "resumeId", user_id AS "userId", version_number AS "versionNumber",
                  label, payload AS "resumeData", is_autosave AS "isAutosave",
                  proposed_by_user_id AS "proposedByUserId", review_id AS "reviewId",
                  proposal_status AS "proposalStatus", created_at AS "createdAt"
      `);
      const rows = (Array.isArray(inserted) ? inserted : (inserted as { rows?: unknown[] }).rows ?? []) as ResumeVersionRow[];
      // Raw execute may hand timestamps back as text — normalise to Date.
      return rows[0] ? { ...rows[0], createdAt: new Date(rows[0].createdAt) } : null;
    });
  }

  /** Retention window + cap for autosave rows, in one statement. */
  async pruneAutosaves(resumeId: string, opts: { cap: number; retentionDays: number }): Promise<void> {
    await this.versions.pruneAutosaves(SUBJECT, resumeId, opts);
  }

  async findVersion(resumeId: string, versionId: string): Promise<ResumeVersionRow | null> {
    const row = await this.versions.find(SUBJECT, resumeId, versionId);
    return row ? toResumeVersionRow(row) : null;
  }

  /** #403 — every résumé `viewerId` follows, newest first. */
  async listWatchedByViewer(viewerId: string) {
    return this.db
      .select({
        id: resumes.id,
        userId: resumes.userId,
        title: resumes.title,
        slug: resumes.slug,
        isMaster: resumes.isMaster,
        status: resumes.status,
        privacyLevel: resumes.privacyLevel,
        scores: resumes.scores,
        sentimentScore: resumes.sentimentScore,
        archivedAt: resumes.archivedAt,
        createdAt: resumes.createdAt,
        updatedAt: resumes.updatedAt,
        watchedAt: schema.watchedResumes.watchedAt,
      })
      .from(schema.watchedResumes)
      .innerJoin(resumes, eq(schema.watchedResumes.resumeId, resumes.id))
      .where(eq(schema.watchedResumes.viewerId, viewerId))
      .orderBy(desc(schema.watchedResumes.watchedAt))
      .limit(200);
  }
}
