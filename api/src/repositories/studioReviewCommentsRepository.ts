/**
 * StudioReviewCommentsRepository — Frame.io-style time-coded review comments
 * on a studio project (gap #145). Since W3-A they are `comments` rows with
 * subject_type 'studio_project' (subject_id = studio_projects.id); every read
 * projects them back to the legacy `studio_review_comments` row shape, key
 * for key, so the review API responses are unchanged.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { commentsOn } from "./engagementSubjectFilters.js";

const { comments } = schema;

export interface StudioReviewCommentRow {
  id: string;
  projectId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  timestampSec: number | null;
  resolved: boolean;
  createdAt: Date;
}

export interface StudioReviewCommentInsert {
  projectId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  timestampSec: number | null;
}

/** Same keys, same order as the old table's `select()`. */
const studioReviewCommentColumns = {
  id: comments.id,
  projectId: comments.subjectId,
  parentId: comments.parentId,
  authorUserId: comments.authorUserId,
  authorName: sql<string>`${comments.authorName}`,
  authorEmail: comments.authorEmail,
  body: comments.body,
  timestampSec: comments.timestampSec,
  resolved: comments.resolved,
  createdAt: comments.createdAt,
};

const isStudioComment = eq(comments.subjectType, "studio_project");

/** A project's review comments, oldest first (thread order) or newest first. */
export async function listStudioReviewComments(
  db: Db,
  projectId: string,
  order: "oldest" | "newest" = "oldest",
): Promise<StudioReviewCommentRow[]> {
  return db
    .select(studioReviewCommentColumns)
    .from(comments)
    .where(commentsOn("studio_project", projectId))
    .orderBy(order === "oldest" ? asc(comments.createdAt) : desc(comments.createdAt));
}

export async function insertStudioReviewComment(
  db: Db,
  input: StudioReviewCommentInsert,
): Promise<StudioReviewCommentRow> {
  const [row] = await db
    .insert(comments)
    .values({
      subjectType: "studio_project",
      subjectId: input.projectId,
      parentId: input.parentId,
      authorUserId: input.authorUserId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      timestampSec: input.timestampSec,
    })
    .returning(studioReviewCommentColumns);
  return row;
}

export async function setStudioReviewCommentResolved(
  db: Db,
  id: string,
  resolved: boolean,
): Promise<StudioReviewCommentRow | undefined> {
  const [row] = await db
    .update(comments)
    .set({ resolved, updatedAt: new Date() })
    .where(and(eq(comments.id, id), isStudioComment))
    .returning(studioReviewCommentColumns);
  return row;
}

export async function deleteStudioReviewComment(db: Db, id: string): Promise<void> {
  await db.delete(comments).where(and(eq(comments.id, id), isStudioComment));
}
