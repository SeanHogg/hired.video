/**
 * Home wall visibility (migration 0504, gap #2354): whether a project's
 * public video appears on the hired.video home page and in discovery. The
 * ONE writer of `videos.show_on_home`; every change drops the public feed.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { studioProjects } from "../../db/schema/index.js";
import { videos } from "../../db/schema/videos.js";
import { assertCanWrite } from "./workspace.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";
import { DomainError } from "../../domains/errors.js";

/** NOT_FOUND → 404, NO_VIDEO → 409. */
export class HomeWallError extends DomainError {
  declare readonly code: "NOT_FOUND" | "NO_VIDEO";
  constructor(code: "NOT_FOUND" | "NO_VIDEO") {
    super(code === "NOT_FOUND" ? 404 : 409, code, code === "NOT_FOUND" ? "Project not found" : "This project has no posted video yet");
    this.name = "HomeWallError";
  }
}

async function projectVideo(actorId: string, projectId: string, db: Db) {
  const [project] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId, videoId: studioProjects.videoId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) throw new HomeWallError("NOT_FOUND");
  await assertCanWrite(actorId, project.userId, project.companyId ?? null);
  return project.videoId;
}

/** Whether the project's video shows on the home page (true before it has one). */
export async function getShowOnHome(actorId: string, projectId: string, db: Db = getDb()): Promise<boolean> {
  const videoId = await projectVideo(actorId, projectId, db);
  if (!videoId) return true;
  const [row] = await db.select({ showOnHome: videos.showOnHome }).from(videos).where(eq(videos.id, videoId)).limit(1);
  return row?.showOnHome ?? true;
}

/** Returns the saved flag and the video it applies to (the caller schedules
 *  the explicit scan that gates the wall). */
export async function setShowOnHome(
  actorId: string,
  projectId: string,
  showOnHome: boolean,
  db: Db = getDb(),
): Promise<{ showOnHome: boolean; videoId: string }> {
  const videoId = await projectVideo(actorId, projectId, db);
  if (!videoId) throw new HomeWallError("NO_VIDEO");
  await db.update(videos).set({ showOnHome, updatedAt: new Date() }).where(eq(videos.id, videoId));
  invalidatePublicVideoFeed();
  return { showOnHome, videoId };
}
