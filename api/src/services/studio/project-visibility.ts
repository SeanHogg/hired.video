/**
 * Project visibility — THE writer of a studio project's public / unlisted
 * state. Two flags must agree for every read surface:
 *
 *   • studio_projects.is_public  — authoritative for the in-platform watch
 *     page and every subject's public list (#665).
 *   • videos.privacy_status      — the linked render's mirror; gates the
 *     off-platform CDN URL, unified search and the home video wall.
 *
 * `applyProjectVisibility` is what PATCH /projects/:id/visibility runs;
 * `forceProjectUnlisted` is the fail-closed variant the candidate-consent
 * flow runs (subject linked, consent requested / declined / withdrawn /
 * expired, content changed after approval). Forcing also takes a
 * `published` project off the owner's profile — the /m watch page treats
 * status `published` as viewable — so nothing about the video stays live.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";
import { invalidatePublicProjectsForSubjects } from "./public-projects-cache.js";
import { bumpPublicWatchCache } from "./public-watch-cache.js";
import { removePublication } from "./publication-service.js";
import { studioProjectColumns, type StudioProjectRow } from "../../repositories/studioProjectColumns.js";

const { studioProjects, studioProjectSubjects, videos } = schema;

type Db = ReturnType<typeof getDb>;
type ProjectRow = StudioProjectRow;

/** Read all subject links for a single project, in stable creation order. */
export async function loadProjectSubjects(db: Db, projectId: string): Promise<Array<{ kind: string; id: string }>> {
  const rows = await db
    .select({ kind: studioProjectSubjects.subjectKind, id: studioProjectSubjects.subjectId, createdAt: studioProjectSubjects.createdAt })
    .from(studioProjectSubjects)
    .where(eq(studioProjectSubjects.projectId, projectId))
    .orderBy(studioProjectSubjects.createdAt);
  return rows.map((r) => ({ kind: r.kind, id: r.id }));
}

/**
 * Set the project's visibility and mirror it onto the linked videos row,
 * then orphan every cache that lists or serves it. Returns the updated
 * project row. (Scheduling the explicit-content scan on a public flip needs
 * the request context, so the route does that.)
 */
export async function applyProjectVisibility(
  db: Db,
  project: Pick<ProjectRow, "id" | "slug" | "videoId">,
  isPublic: boolean,
): Promise<ProjectRow | null> {
  const [updated] = await db
    .update(studioProjects)
    .set({ isPublic, updatedAt: new Date() })
    .where(eq(studioProjects.id, project.id))
    .returning(studioProjectColumns);

  // `videos.privacy_status` is the SSoT on the video side — the redundant
  // `videos.is_public` boolean was dropped in migration 0086 after it drifted.
  if (project.videoId) {
    await db
      .update(videos)
      .set({ privacyStatus: isPublic ? "public" : "unlisted", updatedAt: new Date() })
      .where(eq(videos.id, project.videoId));
    // In / out of the public `media` search and the home page's video wall.
    bumpSearchVersion();
    invalidatePublicVideoFeed();
  }

  // In / out of every subject's public list (#274/#275).
  invalidatePublicProjectsForSubjects(await loadProjectSubjects(db, project.id));
  bumpPublicWatchCache(project.id, project.slug, project.videoId);
  return updated ?? null;
}

/**
 * Make the project unlisted and off-profile, whatever it was. Idempotent; a
 * missing project is a no-op. `published` → `exported` (the status route's
 * unpublish) so the watch page answers "pending" again.
 */
export async function forceProjectUnlisted(projectId: string, db: Db = getDb()): Promise<void> {
  const [project] = await db
    .select({ id: studioProjects.id, slug: studioProjects.slug, videoId: studioProjects.videoId, status: studioProjects.status })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) return;

  await applyProjectVisibility(db, project, false);

  if (project.status === "published") {
    await db
      .update(studioProjects)
      .set({ status: "exported", isProfilePrimary: false, updatedAt: new Date() })
      .where(and(eq(studioProjects.id, projectId), eq(studioProjects.status, "published")));
    await removePublication(projectId, "profile").catch(() => undefined);
  }
}
