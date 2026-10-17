/**
 * AdminStudioService — SuperAdmin studio moderation: the cross-tenant
 * project list (with each owner's videos + orphan detection), deletes, and
 * the homepage "featured" pin.
 */
import { cdnUrl } from "../../utils/cdn.js";
import { deleteProjectWithMedia } from "../studio/delete-project-media.js";
import { bumpPageEmbedsVersion } from "../studio/page-embed-service.js";
import { invalidatePublicVideoFeed } from "../studio/public-video-feed.js";
import {
  AdminStudioRepository,
  type StudioProjectSearch,
} from "../../repositories/admin/adminStudioRepository.js";

/** Orphan list cap so a backlog can't explode the response. */
const ORPHAN_LIMIT = 200;

function videoUrl(v: { youtubeUrl: string | null; r2Key: string | null }): string | null {
  return v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null);
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}

export type FeatureResult =
  | { kind: "ok"; isFeatured: boolean }
  | { kind: "not_found" }
  | { kind: "not_public" };

export class AdminStudioService {
  constructor(private readonly repo: AdminStudioRepository) {}

  static create(): AdminStudioService {
    return new AdminStudioService(AdminStudioRepository.create());
  }

  async listProjects(query: StudioProjectSearch) {
    const { rows, total } = await this.repo.listProjects(query);
    const videoIds = rows.map((r) => r.videoId).filter((id): id is string => Boolean(id));
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [linkedVideos, userVideos, linked] = await Promise.all([
      this.repo.findVideosByIds(videoIds),
      this.repo.listVideosForUsers(userIds),
      this.repo.linkedVideoIds(),
    ]);
    const videoById = new Map(linkedVideos.map((v) => [v.id, v]));
    const videosByUser = new Map<string, typeof userVideos>();
    for (const v of userVideos) {
      const list = videosByUser.get(v.userId) ?? [];
      list.push(v);
      videosByUser.set(v.userId, list);
    }

    const projects = rows.map((r) => {
      const linkedVideo = r.videoId ? videoById.get(r.videoId) ?? null : null;
      return {
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        title: r.name || "Untitled Project",
        status: r.status,
        purpose: r.purpose || null,
        videoId: r.videoId,
        linkedVideoUrl: linkedVideo ? videoUrl(linkedVideo) : null,
        linkedVideoStatus: linkedVideo?.status ?? null,
        linkedVideoPrivacy: linkedVideo?.privacyStatus ?? null,
        // Project-level featured flag (migration 0091) — the project, not its
        // optional linked video, is the unit the homepage feed selects on.
        isPublic: r.isPublic,
        isFeatured: r.isFeatured,
        userVideos: (videosByUser.get(r.userId) ?? []).map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          videoUrl: videoUrl(v),
          youtubeVideoId: v.youtubeVideoId,
          thumbnailUrl: v.thumbnailUrl,
          privacyStatus: v.privacyStatus,
          isOrphan: !linked.has(v.id),
          createdAt: iso(v.createdAt),
        })),
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
      };
    });


    // Flat orphan list independent of the loaded page: an orphan owned by a
    // user with no project on this page is otherwise unreachable from the UI.
    const [summary, orphanRows] = await Promise.all([
      this.repo.summary(linked),
      this.repo.listOrphanVideos(linked, ORPHAN_LIMIT),
    ]);
    const orphanVideos = orphanRows.map((v) => ({
      id: v.id,
      userId: v.userId,
      userName: v.userName,
      userEmail: v.userEmail,
      title: v.title,
      status: v.status,
      videoUrl: videoUrl(v),
      youtubeVideoId: v.youtubeVideoId,
      thumbnailUrl: v.thumbnailUrl,
      privacyStatus: v.privacyStatus,
      isOrphan: true,
      createdAt: iso(v.createdAt),
    }));

    return { projects, orphanVideos, total, page: query.page, limit: query.limit, summary };
  }

  /** Also drops the master render's and fitted cuts' video rows + R2 objects. */
  async deleteProject(projectId: string): Promise<boolean> {
    const deleted = await deleteProjectWithMedia(projectId);
    if (deleted) bumpPageEmbedsVersion();
    return deleted;
  }

  async deleteVideo(videoId: string): Promise<boolean> {
    const deleted = await this.repo.deleteVideo(videoId);
    bumpPageEmbedsVersion();
    if (deleted) invalidatePublicVideoFeed();
    return deleted;
  }

  /**
   * SA homepage pin. No linked-video requirement (v2 projects play live off
   * `timelineSpec`), but promoting requires `is_public` — otherwise the public
   * feed's filter would drop the row and the carousel would show a phantom tile.
   */
  async setFeatured(projectId: string, isFeatured: boolean): Promise<FeatureResult> {
    const project = await this.repo.findProjectVisibility(projectId);
    if (!project) return { kind: "not_found" };
    if (isFeatured && !project.isPublic) return { kind: "not_public" };
    const updated = await this.repo.setFeatured(projectId, isFeatured);
    return updated ? { kind: "ok", isFeatured: updated.isFeatured } : { kind: "not_found" };
  }
}
