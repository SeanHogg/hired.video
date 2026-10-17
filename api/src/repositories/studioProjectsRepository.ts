/**
 * Studio project + linked-render persistence for the project use cases
 * (services/studio/project-*.ts). Every `studio_projects` / `videos`
 * read and write the project routes need lives here; the use cases own
 * the rules (auth, gates, cache bumps), this module owns the SQL.
 * Split out of routes/studio.ts (W2-3a).
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { buildOwnershipFilter } from "../services/studio/workspace.js";
import type { WorkspaceRestriction } from "../services/studio/workspace-request.js";
import { MediaRepository } from "./mediaRepository.js";
import { stateWrite } from "../services/studio/project-state.js";
import { MEDIA_KIND_STATE_FIELD, type StudioStateField } from "../../../shared/studio-project-state.js";

const { studioProjects, videos } = schema;

export type StudioProjectRow = typeof studioProjects.$inferSelect;
export type StudioProjectInsert = typeof studioProjects.$inferInsert;
export type StudioProjectPatch = Partial<StudioProjectInsert>;
export type LinkedVideoRow = typeof videos.$inferSelect;
export type LinkedVideoInsert = typeof videos.$inferInsert;

export interface ProjectWithVideo {
  project: StudioProjectRow;
  /** The render the project points at (`studio_projects.video_id`), if any. */
  video: LinkedVideoRow | null;
}

export async function findProjectById(db: Db, projectId: string): Promise<StudioProjectRow | null> {
  const [row] = await db.select().from(studioProjects).where(eq(studioProjects.id, projectId)).limit(1);
  return row ?? null;
}

/** The project and its linked render in ONE round-trip (left join). */
export async function findProjectWithVideo(db: Db, projectId: string): Promise<ProjectWithVideo | null> {
  const [row] = await db
    .select({ project: studioProjects, video: videos })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) return null;
  return { project: row.project, video: row.video ?? null };
}

/**
 * A select expression for one per-kind state field: `state` when the row's
 * mediaKind owns `field` (shared/studio-project-state.ts), else NULL — the
 * exact value the retired per-kind column held. For column-list selects
 * (`gameState: projectStateAs("gameState")`).
 */
export function projectStateAs(field: StudioStateField): SQL<unknown> {
  const kinds = Object.entries(MEDIA_KIND_STATE_FIELD)
    .filter(([, owner]) => owner === field)
    .map(([kind]) => kind);
  return sql`CASE WHEN ${studioProjects.mediaKind} IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}) THEN ${studioProjects.state} END`;
}

/** A patch that writes `state` also writes its `baked_hash` mirror. */
function withDerivedColumns<T extends StudioProjectPatch>(patch: T): T {
  if (patch.state === undefined || patch.bakedHash !== undefined) return patch;
  return { ...patch, ...stateWrite(patch.state) };
}

export async function insertProject(db: Db, values: StudioProjectInsert): Promise<StudioProjectRow> {
  const [created] = await db.insert(studioProjects).values(withDerivedColumns(values)).returning();
  return created;
}

export async function updateProject(
  db: Db,
  projectId: string,
  patch: StudioProjectPatch,
): Promise<StudioProjectRow | null> {
  const [updated] = await db
    .update(studioProjects)
    .set(withDerivedColumns(patch))
    .where(eq(studioProjects.id, projectId))
    .returning();
  return updated ?? null;
}

/**
 * Optimistic-concurrency write for save-draft (#2242). With an
 * `expectedRevision` the update is a compare-and-set against the content
 * revision: a save that landed in between bumped it, so this one matches no
 * row and returns null. Without one it is a plain update by id.
 *
 * The revision is the `studio_projects.revision` column (promoted from
 * `storyboard._rev` in migration 0610).
 */
export async function updateProjectIfRevision(
  db: Db,
  projectId: string,
  patch: StudioProjectPatch,
  expectedRevision: number | undefined,
): Promise<StudioProjectRow | null> {
  const where =
    expectedRevision === undefined
      ? eq(studioProjects.id, projectId)
      : and(
          eq(studioProjects.id, projectId),
          eq(studioProjects.revision, expectedRevision),
        );
  const [updated] = await db.update(studioProjects).set(withDerivedColumns(patch)).where(where).returning();
  return updated ?? null;
}

/** Roll every primary-profile project of `ownerUserId` off (publish runs this
 *  before promoting the new one so the partial unique index never sees two). */
export async function clearProfilePrimary(db: Db, ownerUserId: string): Promise<void> {
  await db
    .update(studioProjects)
    .set({ isProfilePrimary: false, updatedAt: new Date() })
    .where(and(eq(studioProjects.userId, ownerUserId), eq(studioProjects.isProfilePrimary, true)));
}

/** Projects the actor can read (own / company / delegated), optionally
 *  restricted to one workspace and to a pre-filtered id set; capped at the
 *  500 most-recently-updated, returned in ascending updatedAt order. */
export async function findProjectsVisibleTo(
  db: Db,
  scope: OwnershipScope,
  onlyProjectIds: string[] | null,
): Promise<StudioProjectRow[]> {
  const ownership = ownershipFilter(scope, studioProjects.userId, studioProjects.companyId);
  const where = onlyProjectIds ? and(ownership, inArray(studioProjects.id, onlyProjectIds)) : ownership;
  return new MediaRepository(db).findStudioProjectsWhere(where, 500);
}

export interface OwnershipScope {
  actorUserId: string;
  companyIds: string[];
  delegatedSubjectUserIds: string[];
  restrictToWorkspace?: WorkspaceRestriction;
}

function ownershipFilter(scope: OwnershipScope, userIdColumn: unknown, companyIdColumn: unknown): SQL | undefined {
  return buildOwnershipFilter({ userIdColumn, companyIdColumn, ...scope });
}

// ─── Linked renders (videos) ────────────────────────────────────────────────

export async function findVideoById(db: Db, videoId: string): Promise<LinkedVideoRow | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  return row ?? null;
}

/** Linked renders by id, filtered by the same ownership scope as the project
 *  list so a stray (project, video) cross-reference can't leak a video. */
export async function findVideosVisibleTo(db: Db, scope: OwnershipScope, videoIds: string[]): Promise<LinkedVideoRow[]> {
  if (videoIds.length === 0) return [];
  return db
    .select()
    .from(videos)
    .where(and(ownershipFilter(scope, videos.userId, videos.companyId), inArray(videos.id, videoIds)));
}

export async function insertVideo(db: Db, values: LinkedVideoInsert): Promise<LinkedVideoRow> {
  const [created] = await db.insert(videos).values(values).returning();
  return created;
}

export async function updateVideo(
  db: Db,
  videoId: string,
  patch: Partial<LinkedVideoInsert>,
): Promise<LinkedVideoRow | null> {
  const [updated] = await db.update(videos).set(patch).where(eq(videos.id, videoId)).returning();
  return updated ?? null;
}
