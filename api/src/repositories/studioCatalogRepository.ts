/**
 * Read-side queries behind the public studio video rails: a user's profile
 * rail (owned + creator-credited projects), a résumé's rail, the home-page
 * featured carousel, a subject's public project list, and the embed lookup.
 *
 * Every rail sources from `studio_projects` (NOT `videos`): v2 projects play
 * live off their Timeline `state` and have no `videos` row until export, so the
 * baked video is LEFT-joined as optional thumbnail / MP4 data.
 */
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { publicStudioProjectWhere } from "./studioPublicEngagementRepository.js";

const { studioProjects, studioProjectSubjects, videos, users, resumeInformation } = schema;

type StudioProjectRow = typeof studioProjects.$inferSelect;
type VideoRow = typeof videos.$inferSelect;

/** mediaKind + runtime state every rail ships (#1215) so the client
 *  dispatches through <ProjectPlayer/> for non-video projects, plus the
 *  saved project name the rail title prefers. */
const projectStateColumns = {
  mediaKind: studioProjects.mediaKind,
  state: studioProjects.state,
  name: studioProjects.name,
};

/** Project ids credited to `userId` as a contributor (delegated work). */
export async function findCreditedProjectIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: studioProjectSubjects.projectId })
    .from(studioProjectSubjects)
    .where(and(eq(studioProjectSubjects.subjectKind, "creator_credit"), eq(studioProjectSubjects.subjectId, userId)));
  return rows.map((r) => r.projectId);
}

/** Up to 40 projects the user owns or is credited on, primary first. */
export async function listProfileRailRows(db: Db, userId: string, creditedProjectIds: string[]) {
  const ownerOrCredit = creditedProjectIds.length
    ? or(eq(studioProjects.userId, userId), inArray(studioProjects.id, creditedProjectIds))
    : eq(studioProjects.userId, userId);
  return db
    .select({
      projectId: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      isPublic: studioProjects.isPublic,
      isProfilePrimary: studioProjects.isProfilePrimary,
      ...projectStateColumns,
      createdAt: studioProjects.createdAt,
      videoTitle: videos.title,
      r2Key: videos.r2Key,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      privacyStatus: videos.privacyStatus,
      isCreatorCredit: sql<boolean>`${studioProjects.userId} <> ${userId}`,
    })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(ownerOrCredit)
    .orderBy(desc(studioProjects.isProfilePrimary), desc(studioProjects.createdAt))
    .limit(40);
}

export async function listResumeIdsForUser(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ id: resumeInformation.id }).from(resumeInformation).where(eq(resumeInformation.userId, userId));
  return rows.map((r) => r.id);
}

export async function listSubjectLinksForProjects(db: Db, projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      projectId: studioProjectSubjects.projectId,
      subjectKind: studioProjectSubjects.subjectKind,
      subjectId: studioProjectSubjects.subjectId,
    })
    .from(studioProjectSubjects)
    .where(inArray(studioProjectSubjects.projectId, projectIds));
}

/** Every project linked to a résumé subject, primary first. */
export async function listResumeRailRows(db: Db, resumeId: string) {
  return db
    .select({
      projectId: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      isPublic: studioProjects.isPublic,
      projectStatus: studioProjects.status,
      ...projectStateColumns,
      isProfilePrimary: studioProjects.isProfilePrimary,
      createdAt: studioProjects.createdAt,
      videoTitle: videos.title,
      r2Key: videos.r2Key,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      videoStatus: videos.status,
    })
    .from(studioProjectSubjects)
    .innerJoin(studioProjects, eq(studioProjects.id, studioProjectSubjects.projectId))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(eq(studioProjectSubjects.subjectKind, "resume"), eq(studioProjectSubjects.subjectId, resumeId)))
    .orderBy(desc(studioProjects.isProfilePrimary), desc(studioProjects.createdAt));
}

/** SA-featured public projects, most recently promoted first (max 20). */
export async function listFeaturedRows(db: Db) {
  return db
    .select({
      id: studioProjects.id,
      videoId: studioProjects.videoId,
      ...projectStateColumns,
      createdAt: studioProjects.createdAt,
      updatedAt: studioProjects.updatedAt,
      videoTitle: videos.title,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      ownerName: users.name,
      resumeId: videos.resumeId,
    })
    .from(studioProjects)
    .innerJoin(users, eq(studioProjects.userId, users.id))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(eq(studioProjects.isFeatured, true), publicStudioProjectWhere()))
    .orderBy(desc(studioProjects.updatedAt))
    .limit(20);
}

/** A subject's public, watchable (non-failed) projects + their linked
 *  videos, newest first. Empty when nothing is linked. */
export async function listPublicProjectsForSubject(
  db: Db,
  subject: { kind: string; id: string },
): Promise<{ projects: StudioProjectRow[]; videoById: Map<string, VideoRow> }> {
  const subjectRows = await db
    .select({ projectId: studioProjectSubjects.projectId })
    .from(studioProjectSubjects)
    .where(and(eq(studioProjectSubjects.subjectKind, subject.kind), eq(studioProjectSubjects.subjectId, subject.id)));
  if (subjectRows.length === 0) return { projects: [], videoById: new Map() };
  const projects = await db
    .select()
    .from(studioProjects)
    .where(and(
      inArray(studioProjects.id, subjectRows.map((r) => r.projectId)),
      publicStudioProjectWhere(),
      notInArray(studioProjects.status, ["failed", "publish_failed"]),
    ))
    .orderBy(desc(studioProjects.updatedAt));
  // Linked videos belong to projects already vetted as public — no extra
  // ownership check needed.
  const videoIds = projects.map((p) => p.videoId).filter((id): id is string => Boolean(id));
  const linked = videoIds.length ? await db.select().from(videos).where(inArray(videos.id, videoIds)) : [];
  return { projects, videoById: new Map(linked.map((v) => [v.id, v])) };
}

export async function findVideoForEmbed(db: Db, videoId: string) {
  const [vid] = await db
    .select({ id: videos.id, title: videos.title, youtubeVideoId: videos.youtubeVideoId, r2Key: videos.r2Key, privacyStatus: videos.privacyStatus })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  return vid ?? null;
}
