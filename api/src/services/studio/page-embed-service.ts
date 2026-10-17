/**
 * Page → video embed registry service (#1860).
 *
 * Owns all DB access + domain logic for `page_embed_videos`: a SuperAdmin
 * publishes a Studio project onto a marketing-page route; the public
 * resolver reads the active mapping for a path and projects it into the
 * `PublicVideo` shape the frontend player renders.
 *
 * Boundary: routes do auth + the SuperAdmin gate + request parsing; this
 * module owns the queries, the upsert-by-path semantics, and the
 * project → PublicVideo projection. Mirrors the repo-per-aggregate
 * convention used across the codebase (no raw Drizzle in route handlers).
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { pageEmbedVideos } from "../../db/schema/pageEmbeds.js";
import { studioProjects, users, videos } from "../../db/schema/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { bumpCacheVersion, getCacheVersion, getOrSetCached } from "../../utils/edge-cache.js";

type Db = ReturnType<typeof getDb>;

/** Version-token namespace for the public page-embed reads. Bumped on
 *  every publish / unpublish write here AND when a Studio project's
 *  rendered video changes (routes/studio.ts render publish), since the
 *  resolve payload projects the project's CURRENT video. */
const PAGE_EMBEDS_NAMESPACE = "page-embeds";
/** Backstop TTL — explicit version bumps make writes visible at once. */
const PAGE_EMBEDS_TTL_SECONDS = 300;

/** Invalidate every cached public page-embed read (paths set + every
 *  per-path resolve). Fire-and-forget. */
export function bumpPageEmbedsVersion(): void {
  bumpCacheVersion(PAGE_EMBEDS_NAMESPACE);
}

/** PublicVideo-shaped projection the frontend player consumes directly. */
export interface ResolvedPageVideo {
  id: string;
  title: string;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
  ownerName: string;
  mediaKind: string | null;
  createdAt: string;
}

export interface ResolvedPageEmbed {
  placement: string;
  video: ResolvedPageVideo;
}

/** A page→video mapping row enriched for the SuperAdmin management list. */
export interface PageEmbedListItem {
  pathname: string;
  placement: string;
  isActive: boolean;
  projectId: string;
  rendered: boolean;
  title: string;
  updatedAt: string;
}

/** Normalise a route to the canonical key the registry stores: leading
 *  slash, no trailing slash (except root), no query/hash. */
export function normalisePathname(raw: string): string {
  let p = (raw || "").trim().split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.slice(0, 512);
}

/** The request-scoped service on the shared pooled db (routes never touch getDb). */
export function pageEmbedService(): PageEmbedService {
  return new PageEmbedService(getDb());
}

export class PageEmbedService {
  constructor(private readonly db: Db) {}

  /** Cached `resolveForPath` for the public resolver (called per SPA
   *  route that carries an embed). Payload is JSON-safe (ISO dates). */
  async resolveForPathCached(pathname: string): Promise<ResolvedPageEmbed | null> {
    const ver = await getCacheVersion(PAGE_EMBEDS_NAMESPACE);
    return getOrSetCached<ResolvedPageEmbed | null>({
      key: `page-embeds:v1:${ver}:resolve:${pathname}`,
      ttlSeconds: PAGE_EMBEDS_TTL_SECONDS,
      loader: () => this.resolveForPath(pathname),
    });
  }

  /** Cached `listActivePaths` — fetched on EVERY SPA route change. */
  async listActivePathsCached(): Promise<string[]> {
    const ver = await getCacheVersion(PAGE_EMBEDS_NAMESPACE);
    return getOrSetCached<string[]>({
      key: `page-embeds:v1:${ver}:paths`,
      ttlSeconds: PAGE_EMBEDS_TTL_SECONDS,
      loader: () => this.listActivePaths(),
    });
  }

  /** Resolve the active video published to a route, or null. Reads the
   *  project's CURRENT videoId (not the possibly-stale denorm) so a
   *  re-render is reflected without re-publishing. */
  async resolveForPath(pathname: string): Promise<ResolvedPageEmbed | null> {
    const [row] = await this.db
      .select({
        placement: pageEmbedVideos.placement,
        projectId: studioProjects.id,
        mediaKind: studioProjects.mediaKind,
        projectCreatedAt: studioProjects.createdAt,
        ownerName: users.name,
        videoTitle: videos.title,
        r2Key: videos.r2Key,
        thumbnailUrl: videos.thumbnailUrl,
        youtubeVideoId: videos.youtubeVideoId,
      })
      .from(pageEmbedVideos)
      .innerJoin(studioProjects, eq(studioProjects.id, pageEmbedVideos.projectId))
      .leftJoin(videos, eq(videos.id, studioProjects.videoId))
      .leftJoin(users, eq(users.id, studioProjects.userId))
      .where(and(eq(pageEmbedVideos.pathname, pathname), eq(pageEmbedVideos.isActive, true)))
      .limit(1);

    if (!row) return null;

    return {
      placement: row.placement,
      video: {
        id: row.projectId,
        title: row.videoTitle ?? "Video",
        videoUrl: row.r2Key ? cdnUrl(row.r2Key) : null,
        youtubeVideoId: row.youtubeVideoId ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        ownerName: row.ownerName ?? "hired.video",
        mediaKind: row.mediaKind ?? null,
        createdAt:
          row.projectCreatedAt instanceof Date
            ? row.projectCreatedAt.toISOString()
            : String(row.projectCreatedAt ?? ""),
      },
    };
  }

  /** Just the active embed pathnames — a cheap, cacheable membership set
   *  so the client only runs the full per-page resolve when the current
   *  route actually has an embed (#1863). */
  async listActivePaths(): Promise<string[]> {
    const rows = await this.db
      .select({ pathname: pageEmbedVideos.pathname })
      .from(pageEmbedVideos)
      .where(eq(pageEmbedVideos.isActive, true));
    return rows.map((r) => r.pathname);
  }

  /** Publish a project to a path (upsert-by-path). Denormalises the
   *  project's current videoId so the snippet runtime can read it without
   *  a join. Re-activates a previously unpublished path. */
  async publish(input: {
    pathname: string;
    projectId: string;
    placement?: string;
    userId: string;
  }): Promise<void> {
    // Pull the project's current rendered video id for the denorm column.
    const [project] = await this.db
      .select({ videoId: studioProjects.videoId })
      .from(studioProjects)
      .where(eq(studioProjects.id, input.projectId))
      .limit(1);
    if (!project) {
      throw new Error("Studio project not found");
    }

    await this.db
      .insert(pageEmbedVideos)
      .values({
        pathname: input.pathname,
        projectId: input.projectId,
        videoId: project.videoId ?? null,
        placement: input.placement ?? "hero",
        isActive: true,
        createdBy: input.userId,
      })
      .onConflictDoUpdate({
        target: pageEmbedVideos.pathname,
        set: {
          projectId: input.projectId,
          videoId: project.videoId ?? null,
          placement: input.placement ?? "hero",
          isActive: true,
          updatedAt: new Date(),
        },
      });
    bumpPageEmbedsVersion();
  }

  /** Unpublish a path (soft — keeps the row, flips isActive). */
  async unpublish(pathname: string): Promise<boolean> {
    const res = await this.db
      .update(pageEmbedVideos)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pageEmbedVideos.pathname, pathname))
      .returning({ pathname: pageEmbedVideos.pathname });
    bumpPageEmbedsVersion();
    return res.length > 0;
  }

  /** All active mappings — the SuperAdmin management list. */
  async listActive(): Promise<PageEmbedListItem[]> {
    const rows = await this.db
      .select({
        pathname: pageEmbedVideos.pathname,
        placement: pageEmbedVideos.placement,
        isActive: pageEmbedVideos.isActive,
        projectId: pageEmbedVideos.projectId,
        updatedAt: pageEmbedVideos.updatedAt,
        videoTitle: videos.title,
        projectVideoId: studioProjects.videoId,
      })
      .from(pageEmbedVideos)
      .innerJoin(studioProjects, eq(studioProjects.id, pageEmbedVideos.projectId))
      .leftJoin(videos, eq(videos.id, studioProjects.videoId))
      .where(eq(pageEmbedVideos.isActive, true))
      .orderBy(desc(pageEmbedVideos.updatedAt));

    return rows.map((r) => ({
      pathname: r.pathname,
      placement: r.placement,
      isActive: r.isActive,
      projectId: r.projectId,
      rendered: Boolean(r.projectVideoId),
      title: r.videoTitle ?? "Video",
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));
  }
}
