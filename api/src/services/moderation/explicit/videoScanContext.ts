/**
 * Read model for the video explicit scan: the video row, its owner's wall
 * card text, and the saved composition of the project it came from.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, type Db } from "../../../db/index.js";
import { studioProjects } from "../../../db/schema/index.js";
import { userProfiles, users } from "../../../db/schema/users.js";
import { videos } from "../../../db/schema/videos.js";
import type { VideoScanSource } from "./videoScanInputs.js";

export interface VideoScanContext extends VideoScanSource {
  videoId: string;
  ownerUserId: string;
  r2Key: string | null;
  privacyStatus: string;
  showOnHome: boolean;
}

export async function loadVideoScanContext(videoId: string, db: Db = getDb()): Promise<VideoScanContext | null> {
  const [row] = await db
    .select({
      videoId: videos.id,
      ownerUserId: videos.userId,
      title: videos.title,
      description: videos.description,
      thumbnailUrl: videos.thumbnailUrl,
      r2Key: videos.r2Key,
      privacyStatus: videos.privacyStatus,
      showOnHome: videos.showOnHome,
      storyboard: videos.storyboard,
      ownerName: users.name,
      ownerHeadline: userProfiles.headline,
    })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!row) return null;

  const [project] = await db
    .select({ timelineSpec: studioProjects.timelineSpec, storyboard: studioProjects.storyboard })
    .from(studioProjects)
    .where(eq(studioProjects.videoId, videoId))
    .orderBy(desc(studioProjects.updatedAt))
    .limit(1);

  return {
    ...row,
    ownerName: row.ownerName ?? null,
    ownerHeadline: row.ownerHeadline ?? null,
    timelineSpec: project?.timelineSpec ?? null,
    storyboard: project?.storyboard ?? row.storyboard ?? null,
  };
}

/** The video a studio project rendered to, with its owner — for the frames upload. */
export async function loadProjectVideo(projectId: string, db: Db = getDb()) {
  const [row] = await db
    .select({
      projectUserId: studioProjects.userId,
      projectCompanyId: studioProjects.companyId,
      videoId: videos.id,
      ownerUserId: videos.userId,
      r2Key: videos.r2Key,
    })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  return row ?? null;
}
