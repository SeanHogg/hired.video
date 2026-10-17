/**
 * OG / social-preview reads for media-ish entities (studio projects + legacy
 * videos, résumés, voice-clone listings, creator profiles). Consumed only by
 * services/og — every query is a single-row lookup on the crawler hot path.
 */
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { videos, users, resumeInformation, studioVoiceClones, studioProjects, creatorProfiles, userProfiles } =
  schema;

/** Studio project (any mediaKind) joined to its owner's display name. */
export async function findOgStudioProject(db: Db, projectId: string) {
  const [proj] = await db
    .select({
      id: studioProjects.id,
      isPublic: studioProjects.isPublic,
      storyboard: studioProjects.storyboard,
      name: studioProjects.name,
      mediaKind: studioProjects.mediaKind,
      ownerName: users.name,
      createdAt: studioProjects.createdAt,
    })
    .from(studioProjects)
    .innerJoin(users, eq(studioProjects.userId, users.id))
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  return proj ?? null;
}

/** Baked thumbnail + description of the video row linked to a project id. */
export async function findOgVideoThumbnail(db: Db, videoId: string) {
  const [vid] = await db
    .select({ thumbnailUrl: videos.thumbnailUrl, description: videos.description })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  return vid ?? null;
}

/** Legacy direct-upload videos row (no project) joined to its owner. */
export async function findOgLegacyVideo(db: Db, videoId: string) {
  const [row] = await db
    .select({
      title: videos.title,
      description: videos.description,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      ownerName: users.name,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .where(eq(videos.id, videoId))
    .limit(1);
  return row ?? null;
}

/** Résumé title + owner name/avatar/headline. */
export async function findOgResume(db: Db, resumeId: string) {
  const [row] = await db
    .select({
      title: resumeInformation.title,
      ownerName: users.name,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
    })
    .from(resumeInformation)
    .innerJoin(users, eq(resumeInformation.userId, users.id))
    .leftJoin(userProfiles, eq(resumeInformation.userId, userProfiles.userId))
    .where(eq(resumeInformation.id, resumeId))
    .limit(1);
  return row ?? null;
}
export type OgResumeRow = Awaited<ReturnType<typeof findOgResume>>;

/** Voice-clone marketplace listing by its human-readable listing slug. */
export async function findOgVoiceListing(db: Db, slug: string) {
  const [row] = await db
    .select({
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      priceCents: studioVoiceClones.priceCents,
      visibility: studioVoiceClones.visibility,
      ownerName: users.name,
    })
    .from(studioVoiceClones)
    .innerJoin(users, eq(studioVoiceClones.userId, users.id))
    .where(eq(studioVoiceClones.listingSlug, slug))
    .limit(1);
  return row ?? null;
}
export type OgVoiceRow = Awaited<ReturnType<typeof findOgVoiceListing>>;

/** Current (not ended) creator profile of an email-verified user. */
export async function findOgCreatorProfile(db: Db, userId: string) {
  const [row] = await db
    .select({
      displayName: creatorProfiles.displayName,
      tagline: creatorProfiles.tagline,
      bio: creatorProfiles.bio,
      averageRating: creatorProfiles.averageRating,
      completedProjectsCount: creatorProfiles.completedProjectsCount,
      isActive: creatorProfiles.isActive,
      ownerName: users.name,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(and(
      eq(creatorProfiles.userId, userId),
      eq(users.emailVerified, true),
      sql`${creatorProfiles.endedAt} IS NULL`,
    ))
    .limit(1);
  return row ?? null;
}
export type OgCreatorRow = Awaited<ReturnType<typeof findOgCreatorProfile>>;
