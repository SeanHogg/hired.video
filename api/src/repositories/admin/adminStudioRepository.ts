/**
 * AdminStudioRepository — cross-tenant studio project / video reads and
 * moderation writes for the SuperAdmin studio console (/api/admin/studio/*).
 */
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { isNotRenderVariant } from "../renderVariantRepository.js";

const { studioProjects, users, videos } = schema;

type DbHandle = ReturnType<typeof getDb>;

export interface StudioProjectSearch {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  /** shared/studio-purposes.ts value; "all" / absent = any. */
  purpose?: string;
}

const videoColumns = {
  id: videos.id,
  userId: videos.userId,
  title: videos.title,
  status: videos.status,
  r2Key: videos.r2Key,
  youtubeUrl: videos.youtubeUrl,
  youtubeVideoId: videos.youtubeVideoId,
  thumbnailUrl: videos.thumbnailUrl,
  privacyStatus: videos.privacyStatus,
  createdAt: videos.createdAt,
};

function notInIds(ids: Set<string>): SQL | undefined {
  return ids.size > 0
    ? sql`${videos.id} NOT IN (${sql.join([...ids].map((id) => sql`${id}`), sql`, `)})`
    : undefined;
}

export class AdminStudioRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): AdminStudioRepository {
    return new AdminStudioRepository(getDb());
  }

  async listProjects({ page, limit, search, status, purpose }: StudioProjectSearch) {
    let where: SQL = sql`1=1`;
    if (status && status !== "all") where = sql`${where} AND ${studioProjects.status} = ${status}`;
    if (purpose && purpose !== "all") where = sql`${where} AND ${studioProjects.purpose} = ${purpose}`;
    if (search) {
      const like = `%${search}%`;
      where = sql`${where} AND (
        ${users.name} ILIKE ${like}
        OR ${users.email} ILIKE ${like}
        OR ${studioProjects.name} ILIKE ${like}
      )`;
    }
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: studioProjects.id,
          userId: studioProjects.userId,
          userName: users.name,
          userEmail: users.email,
          status: studioProjects.status,
          name: studioProjects.name,
          purpose: studioProjects.purpose,
          videoId: studioProjects.videoId,
          isPublic: studioProjects.isPublic,
          isFeatured: studioProjects.isFeatured,
          createdAt: studioProjects.createdAt,
          updatedAt: studioProjects.updatedAt,
        })
        .from(studioProjects)
        .innerJoin(users, eq(studioProjects.userId, users.id))
        .where(where)
        .orderBy(desc(studioProjects.updatedAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(studioProjects)
        .innerJoin(users, eq(studioProjects.userId, users.id))
        .where(where),
    ]);
    return { rows, total };
  }

  async findVideosByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(videos).where(inArray(videos.id, ids));
  }

  /** Every non-variant video owned by these users, newest first. */
  async listVideosForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .select(videoColumns)
      .from(videos)
      .where(and(inArray(videos.userId, userIds), isNotRenderVariant(videos.id)))
      .orderBy(desc(videos.createdAt));
  }

  /** Ids of every video linked to ANY studio project (not just one page). */
  async linkedVideoIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ videoId: studioProjects.videoId })
      .from(studioProjects)
      .where(sql`${studioProjects.videoId} IS NOT NULL`);
    return new Set(rows.map((r) => r.videoId).filter((id): id is string => Boolean(id)));
  }

  async summary(linked: Set<string>) {
    const [statusRows, [totalVideos], [orphans]] = await Promise.all([
      this.db.select({ status: studioProjects.status, n: count() }).from(studioProjects).groupBy(studioProjects.status),
      this.db.select({ n: count() }).from(videos).where(isNotRenderVariant(videos.id)),
      this.db.select({ n: count() }).from(videos).where(and(isNotRenderVariant(videos.id), notInIds(linked))),
    ]);
    const byStatus = new Map(statusRows.map((r) => [r.status as string, Number(r.n)]));
    let total = 0;
    for (const n of byStatus.values()) total += n;
    return {
      total,
      draft: byStatus.get("draft") ?? 0,
      published: byStatus.get("published") ?? 0,
      failed: byStatus.get("failed") ?? 0,
      totalVideos: Number(totalVideos?.n ?? 0),
      orphanedVideos: Number(orphans?.n ?? 0),
    };
  }

  /** Up to `limit` videos not linked to any studio project, with owner info. */
  async listOrphanVideos(linked: Set<string>, limit: number) {
    return this.db
      .select({ ...videoColumns, userName: users.name, userEmail: users.email })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(and(isNotRenderVariant(videos.id), notInIds(linked)))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  /** Unlinks the video from any project, then deletes it. Returns false when absent. */
  async deleteVideo(videoId: string): Promise<boolean> {
    await this.db.update(studioProjects).set({ videoId: null }).where(eq(studioProjects.videoId, videoId));
    const [deleted] = await this.db.delete(videos).where(eq(videos.id, videoId)).returning({ id: videos.id });
    return Boolean(deleted);
  }

  async findProjectVisibility(projectId: string): Promise<{ isPublic: boolean } | null> {
    const [row] = await this.db
      .select({ isPublic: studioProjects.isPublic })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  async setFeatured(projectId: string, isFeatured: boolean): Promise<{ isFeatured: boolean } | null> {
    const [row] = await this.db
      .update(studioProjects)
      .set({ isFeatured, updatedAt: new Date() })
      .where(eq(studioProjects.id, projectId))
      .returning({ isFeatured: studioProjects.isFeatured });
    return row ?? null;
  }
}
