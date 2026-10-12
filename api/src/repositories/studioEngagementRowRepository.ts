/**
 * Engagement row → owning project (#1586). Chapters, video forms, thumbnail
 * candidates, review links and review comments belong to a studio project;
 * authorising a write on
 * one of them means "may the actor act on that row's project?" (canActFor:
 * owner, company member, delegate). This resolves the row's project AND the
 * project's owner/company in ONE query, so the caller runs canActFor without
 * a second project lookup.
 */
import { eq, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { UUID_LIKE_REGEX } from "../../../shared/validation.js";

const {
  studioProjects, studioVideoForms, studioChapters, studioThumbnails, studioReviewLinks, studioReviewComments,
} = schema;

export type EngagementRowKind = "form" | "chapter" | "thumbnail" | "review-link" | "comment";

export interface EngagementRowProject {
  projectId: string;
  ownerUserId: string;
  ownerCompanyId: string | null;
}

function rowTable(kind: EngagementRowKind) {
  switch (kind) {
    case "form":
      return studioVideoForms;
    case "chapter":
      return studioChapters;
    case "thumbnail":
      return studioThumbnails;
    case "review-link":
      return studioReviewLinks;
    case "comment":
      return studioReviewComments;
  }
}

/** Join condition to the row's project. Review comments carry a real uuid
 *  FK; the other tables store `project_id` as text. */
function projectJoin(kind: EngagementRowKind): SQL {
  if (kind === "comment") return eq(studioProjects.id, studioReviewComments.projectId);
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
