/**
 * Engagement row → owning project (#1586). Chapters, video forms, thumbnail
 * candidates, review links and review comments belong to a studio project;
 * authorising a write on
 * one of them means "may the actor act on that row's project?" (canActFor:
 * owner, company member, delegate). This resolves the row's project AND the
 * project's owner/company in ONE query, so the caller runs canActFor without
 * a second project lookup.
 */
import { and, eq, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { UUID_LIKE_REGEX } from "../../../shared/validation.js";

const {
  studioProjects, studioVideoForms, studioChapters, studioThumbnails, shareLinks, comments,
} = schema;

export type EngagementRowKind = "form" | "chapter" | "thumbnail" | "review-link" | "comment";

export interface EngagementRowProject {
  projectId: string;
  ownerUserId: string;
  ownerCompanyId: string | null;
}

type ProjectTableKind = Exclude<EngagementRowKind, "comment" | "review-link">;

function rowTable(kind: ProjectTableKind) {
  switch (kind) {
    case "form":
      return studioVideoForms;
    case "chapter":
      return studioChapters;
    case "thumbnail":
      return studioThumbnails;
  }
}

/** Join condition to the row's project. These tables store `project_id` as
 *  text (review comments live in `comments` and review links in
 *  `share_links`, see findEngagementRowProject). */
function projectJoin(kind: ProjectTableKind): SQL {
  return eq(studioProjects.id, projectIdAsUuid(rowTable(kind).projectId));
}

/** The row's text `project_id` as a uuid for the studio_projects PK join —
 *  NULL (no match) instead of a cast error for a legacy non-uuid value, and
 *  the uuid side stays uncast so the PK index is used. */
function projectIdAsUuid(column: AnyColumn): SQL {
  return sql`CASE WHEN ${column} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ${column}::uuid END`;
}

/** The project (and its owner / company) an engagement row belongs to; null for a malformed or unknown row id, or a row whose
 *  project no longer exists. ONE query. */
export async function findEngagementRowProject(
  db: Db,
  kind: EngagementRowKind,
  rowId: string,
): Promise<EngagementRowProject | null> {
  if (!UUID_LIKE_REGEX.test(rowId)) return null;
  if (kind === "comment") return findReviewCommentProject(db, rowId);
  if (kind === "review-link") return findReviewLinkProject(db, rowId);
  const table = rowTable(kind);
  const [row] = await db
    .select({
      projectId: table.projectId,
      ownerUserId: studioProjects.userId,
      ownerCompanyId: studioProjects.companyId,
    })
    .from(table)
    .innerJoin(studioProjects, projectJoin(kind))
    .where(eq(table.id, rowId))
    .limit(1);
  return row ?? null;
}

/** Studio review comments are `comments` rows with subject 'studio_project';
 *  subject_id is the project's uuid. */
async function findReviewCommentProject(db: Db, commentId: string): Promise<EngagementRowProject | null> {
  const [row] = await db
    .select({
      projectId: comments.subjectId,
      ownerUserId: studioProjects.userId,
      ownerCompanyId: studioProjects.companyId,
    })
    .from(comments)
    .innerJoin(studioProjects, eq(studioProjects.id, comments.subjectId))
    .where(and(eq(comments.id, commentId), eq(comments.subjectType, "studio_project")))
    .limit(1);
  return row ?? null;
}

/** Studio review links are `share_links` rows with subject 'studio_review';
 *  subject_id is the project's uuid. */
async function findReviewLinkProject(db: Db, linkId: string): Promise<EngagementRowProject | null> {
  const [row] = await db
    .select({
      projectId: shareLinks.subjectId,
      ownerUserId: studioProjects.userId,
      ownerCompanyId: studioProjects.companyId,
    })
    .from(shareLinks)
    .innerJoin(studioProjects, eq(studioProjects.id, shareLinks.subjectId))
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.subjectType, "studio_review")))
    .limit(1);
  return row ?? null;
}
