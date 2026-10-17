/**
 * ResumeFeedbackRepository — resume-review aggregate storage layer.
 *
 * Owns:
 *   resume_reviews             — the feedback engagement
 *   resume_review_annotations  — sticky notes / highlights / comments
 *
 * Plus the reviewer-proposal slice of résumé versions (`entity_versions`
 * rows with subject_type 'resume', W3-E migration 0640, where
 * `proposed_by_user_id IS NOT NULL`) — the proposed-draft lifecycle. Owner
 * snapshots / restore stay in routes/resumes.ts; this repo only touches the
 * proposal columns so the two paths don't collide.
 *
 * No business logic — the ResumeFeedbackService orchestrates auth + content
 * application. See migration 0200_resume_feedback.sql.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { EntityVersionRepository } from "./entityVersionRepository.js";
import {
  toResumeVersionRow,
  type ResumeVersionInsert,
  type ResumeVersionRow,
} from "./resumeVersionRepository.js";

const { resumeReviews, resumeReviewAnnotations, resumeInformation, users } = schema;

export type DbLike = any;

export type ResumeReviewRow = typeof resumeReviews.$inferSelect;
export type ResumeReviewInsert = typeof resumeReviews.$inferInsert;
export type ResumeReviewPatch = Partial<ResumeReviewInsert>;

export type ResumeReviewAnnotationRow = typeof resumeReviewAnnotations.$inferSelect;
export type ResumeReviewAnnotationInsert = typeof resumeReviewAnnotations.$inferInsert;
export type ResumeReviewAnnotationPatch = Partial<ResumeReviewAnnotationInsert>;

export type { ResumeVersionInsert, ResumeVersionRow };

/** The minimal resume slice the feedback flows need (content + owner). */
export interface ResumeContentSlice {
  id: string;
  userId: string;
  title: string;
  content: unknown;
}

export interface AnnotationCounts {
  reviewId: string;
  open: number;
  total: number;
}

/** Minimal user identity slice — author attribution + invite email send. */
export interface UserContact {
  id: string;
  name: string | null;
  email: string | null;
}

/** Reviews (the feedback-request aggregate). */
export interface IResumeReviewRepository {
  findReviewById(id: string): Promise<ResumeReviewRow | null>;
  findReviewByToken(token: string): Promise<ResumeReviewRow | null>;
  listReviewsForOwner(ownerId: string): Promise<ResumeReviewRow[]>;
  listReviewsForReviewer(reviewerId: string): Promise<ResumeReviewRow[]>;
  listReviewsForResume(resumeId: string): Promise<ResumeReviewRow[]>;
  insertReview(input: ResumeReviewInsert): Promise<ResumeReviewRow>;
  /** Insert many reviews in ONE multi-row insert; rows returned in input order. */
  insertReviews(inputs: ResumeReviewInsert[]): Promise<ResumeReviewRow[]>;
  updateReview(id: string, patch: ResumeReviewPatch): Promise<ResumeReviewRow | null>;
  /** Open + total annotation counts grouped per review id. */
  annotationCountsForReviews(reviewIds: string[]): Promise<AnnotationCounts[]>;
}

/** Annotations on a review. */
export interface IResumeReviewAnnotationRepository {
  findAnnotationById(id: string): Promise<ResumeReviewAnnotationRow | null>;
  listAnnotations(reviewId: string): Promise<ResumeReviewAnnotationRow[]>;
  insertAnnotation(input: ResumeReviewAnnotationInsert): Promise<ResumeReviewAnnotationRow>;
  updateAnnotation(
    id: string,
    patch: ResumeReviewAnnotationPatch,
  ): Promise<ResumeReviewAnnotationRow | null>;
  deleteAnnotation(id: string): Promise<boolean>;
}

/** Resume content (read for reviewers, write on accept). */
export interface IResumeReviewContentRepository {
  findResumeContentSlice(resumeId: string): Promise<ResumeContentSlice | null>;
  updateResumeContent(resumeId: string, content: unknown): Promise<void>;
}

/** Identity (author attribution + invite email). */
export interface IResumeReviewUserDirectory {
  findUserContacts(ids: string[]): Promise<UserContact[]>;
}

/** Proposed-draft revisions (resume_versions proposal slice). */
export interface IResumeReviewProposalRepository {
  nextVersionNumber(resumeId: string): Promise<number>;
  insertProposedVersion(input: ResumeVersionInsert): Promise<ResumeVersionRow>;
  findVersionById(id: string): Promise<ResumeVersionRow | null>;
  listProposalsForReview(reviewId: string): Promise<ResumeVersionRow[]>;
  setProposalStatus(versionId: string, status: string): Promise<ResumeVersionRow | null>;
}

export interface IResumeFeedbackRepository
  extends IResumeReviewRepository,
    IResumeReviewAnnotationRepository,
    IResumeReviewContentRepository,
    IResumeReviewUserDirectory,
    IResumeReviewProposalRepository {}

export class ResumeFeedbackRepository implements IResumeFeedbackRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── reviews ──
  async findReviewById(id: string): Promise<ResumeReviewRow | null> {
    const [row] = await this.db.select().from(resumeReviews).where(eq(resumeReviews.id, id)).limit(1);
    return row ?? null;
  }

  async findReviewByToken(token: string): Promise<ResumeReviewRow | null> {
    const [row] = await this.db
      .select()
      .from(resumeReviews)
      .where(eq(resumeReviews.shareToken, token))
      .limit(1);
    return row ?? null;
  }

  async listReviewsForOwner(ownerId: string): Promise<ResumeReviewRow[]> {
    return this.db
      .select()
      .from(resumeReviews)
      .where(eq(resumeReviews.ownerId, ownerId))
      .orderBy(desc(resumeReviews.createdAt));
  }

  async listReviewsForReviewer(reviewerId: string): Promise<ResumeReviewRow[]> {
    return this.db
      .select()
      .from(resumeReviews)
      .where(eq(resumeReviews.reviewerId, reviewerId))
      .orderBy(desc(resumeReviews.createdAt));
  }

  async listReviewsForResume(resumeId: string): Promise<ResumeReviewRow[]> {
    return this.db
      .select()
      .from(resumeReviews)
      .where(eq(resumeReviews.resumeId, resumeId))
      .orderBy(desc(resumeReviews.createdAt));
  }

  async insertReview(input: ResumeReviewInsert): Promise<ResumeReviewRow> {
    const [row] = await this.db
      .insert(resumeReviews)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row;
  }

  async insertReviews(inputs: ResumeReviewInsert[]): Promise<ResumeReviewRow[]> {
    if (inputs.length === 0) return [];
    const now = this.now();
    const rows: ResumeReviewRow[] = await this.db
      .insert(resumeReviews)
      .values(inputs.map((input) => ({ ...input, updatedAt: now })))
      .returning();
    // shareToken is unique per review — re-key so output order matches input.
    const byToken = new Map(rows.map((r) => [r.shareToken, r]));
    return inputs
      .map((i) => byToken.get(i.shareToken))
      .filter((r): r is ResumeReviewRow => !!r);
  }

  async updateReview(id: string, patch: ResumeReviewPatch): Promise<ResumeReviewRow | null> {
    const [row] = await this.db
      .update(resumeReviews)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(resumeReviews.id, id))
      .returning();
    return row ?? null;
  }

  async annotationCountsForReviews(reviewIds: string[]): Promise<AnnotationCounts[]> {
    if (reviewIds.length === 0) return [];
    const rows = await this.db
      .select({
        reviewId: resumeReviewAnnotations.reviewId,
        open: sql<number>`COUNT(*) FILTER (WHERE ${resumeReviewAnnotations.status} = 'open')`,
        total: sql<number>`COUNT(*)`,
      })
      .from(resumeReviewAnnotations)
      .where(inArray(resumeReviewAnnotations.reviewId, reviewIds))
      .groupBy(resumeReviewAnnotations.reviewId);
    return rows.map((r: any) => ({
      reviewId: r.reviewId,
      open: Number(r.open ?? 0),
      total: Number(r.total ?? 0),
    }));
  }

  // ── annotations ──
  async findAnnotationById(id: string): Promise<ResumeReviewAnnotationRow | null> {
    const [row] = await this.db
      .select()
      .from(resumeReviewAnnotations)
      .where(eq(resumeReviewAnnotations.id, id))
      .limit(1);
    return row ?? null;
  }

  async listAnnotations(reviewId: string): Promise<ResumeReviewAnnotationRow[]> {
    return this.db
      .select()
      .from(resumeReviewAnnotations)
      .where(eq(resumeReviewAnnotations.reviewId, reviewId))
      .orderBy(resumeReviewAnnotations.createdAt);
  }

  async insertAnnotation(
    input: ResumeReviewAnnotationInsert,
  ): Promise<ResumeReviewAnnotationRow> {
    const [row] = await this.db
      .insert(resumeReviewAnnotations)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row;
  }

  async updateAnnotation(
    id: string,
    patch: ResumeReviewAnnotationPatch,
  ): Promise<ResumeReviewAnnotationRow | null> {
    const [row] = await this.db
      .update(resumeReviewAnnotations)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(resumeReviewAnnotations.id, id))
      .returning();
    return row ?? null;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(resumeReviewAnnotations)
      .where(eq(resumeReviewAnnotations.id, id))
      .returning({ id: resumeReviewAnnotations.id });
    return rows.length > 0;
  }

  // ── resume content ──
  async findResumeContentSlice(resumeId: string): Promise<ResumeContentSlice | null> {
    const [row] = await this.db
      .select({
        id: resumeInformation.id,
        userId: resumeInformation.userId,
        title: resumeInformation.title,
        content: resumeInformation.content,
      })
      .from(resumeInformation)
      .where(eq(resumeInformation.id, resumeId))
      .limit(1);
    return row ?? null;
  }

  async updateResumeContent(resumeId: string, content: unknown): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ content: content as any, updatedAt: this.now() })
      .where(eq(resumeInformation.id, resumeId));
  }

  // ── identity ──
  async findUserContacts(ids: string[]): Promise<UserContact[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    return this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, unique));
  }

  // ── proposed-draft revisions (entity_versions, subject_type 'resume') ──
  private get versions(): EntityVersionRepository {
    return new EntityVersionRepository(this.db);
  }

  async insertProposedVersion(input: ResumeVersionInsert): Promise<ResumeVersionRow> {
    const row = await this.versions.insertNext({
      subjectType: "resume",
      subjectId: input.resumeId,
      userId: input.userId,
      label: input.label ?? null,
      payload: input.resumeData,
      isAutosave: input.isAutosave ?? false,
      proposedByUserId: input.proposedByUserId ?? null,
      reviewId: input.reviewId ?? null,
      proposalStatus: input.proposalStatus ?? null,
    });
    return toResumeVersionRow(row);
  }

  async findVersionById(id: string): Promise<ResumeVersionRow | null> {
    const row = await this.versions.findById(id);
    return row && row.subjectType === "resume" ? toResumeVersionRow(row) : null;
  }

  async listProposalsForReview(reviewId: string): Promise<ResumeVersionRow[]> {
    const rows = await this.versions.listProposalsForReview(reviewId);
    return rows.filter((r) => r.subjectType === "resume").map(toResumeVersionRow);
  }

  async setProposalStatus(versionId: string, status: string): Promise<ResumeVersionRow | null> {
    const row = await this.versions.setProposalStatus(versionId, status);
    return row ? toResumeVersionRow(row) : null;
  }
}
