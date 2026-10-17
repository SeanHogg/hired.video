/**
 * PATCH /api/studio/projects/:projectId — the ONE project-state write:
 * `{ status?, isPublic? }` (W2-3a consolidated the old `/status` and
 * `/visibility` PATCHes). When both are sent, status applies first, then
 * visibility; the response is the project DTO after the last step.
 *
 * Status is the publish/unpublish toggle and keeps THREE pieces of state in
 * step so every read surface agrees (gaps #723 / #725):
 *   1. studio_projects.status
 *   2. studio_projects.is_profile_primary — publish promotes this project and
 *      rolls off the creator's previous primary (partial unique index, mig
 *      0088); unpublish clears it. Scoped to the row's userId (the creator),
 *      never the actor — a delegated editor must not flip their own primary.
 *   3. videos.privacy_status — "public" on publish, "unlisted" on unpublish.
 * Visibility runs the one visibility writer (project-visibility.ts).
 *
 * The request-bound gates (candidate consent, post-channel cap) and the
 * explicit-content scan are injected as hooks so the HTTP envelope they
 * produce stays the route's; a gate that blocks short-circuits with it.
 */
import { getDb, type Db } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { publicVideoPath } from "../../../../shared/public-paths.js";
import {
  clearProfilePrimary,
  findProjectById,
  findVideoById,
  updateProject,
  updateVideo,
  type StudioProjectRow,
} from "../../repositories/studioProjectsRepository.js";
import { assertCanWrite } from "./workspace.js";
import { applyProjectVisibility, loadProjectSubjects } from "./project-visibility.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";
import { invalidatePublicProjectsForSubjects } from "./public-projects-cache.js";
import { bumpPublicWatchCache } from "./public-watch-cache.js";
import { recordPublication, removePublication } from "./publication-service.js";
import { toProjectDto, type StudioProjectDto } from "./project-dto.js";

export const PROJECT_STATUSES = ["draft", "exported", "published", "processing", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectUpdateInput {
  status?: ProjectStatus;
  isPublic?: boolean;
}

/** Request-bound steps, supplied by the route. `Blocked` is whatever ready
 *  rejection the gate produced (the route's HTTP response). */
export interface ProjectUpdateHooks<Blocked> {
  /** Before going live on the profile: candidate consent, then channel cap. */
  gatePublish(projectId: string): Promise<Blocked | null>;
  /** Before flipping public: candidate consent. */
  gateMakePublic(projectId: string): Promise<Blocked | null>;
  /** Fire-and-forget explicit-content scan of a render that went public. */
  scheduleScan(videoId: string): void;
}

export type ProjectUpdateResult<Blocked> =
  | { blocked: Blocked }
  | { project: StudioProjectDto };

const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");
const PUBLISH_AWARDED_KINDS = new Set(["game", "comic", "podcast"]);

export async function updateStudioProject<Blocked>(
  actorUserId: string,
  projectId: string,
  input: ProjectUpdateInput,
  hooks: ProjectUpdateHooks<Blocked>,
): Promise<ProjectUpdateResult<Blocked>> {
  const db = getDb();
  let row = await findProjectById(db, projectId);
  if (!row) throw projectNotFound();
  await assertCanWrite(actorUserId, row.userId, row.companyId ?? null);

  let dto: StudioProjectDto | null = null;
  if (input.status !== undefined) {
    const result = await applyStatus(db, row, input.status, hooks);
    if ("blocked" in result) return result;
    row = result.row;
    dto = result.dto;
  }
  if (input.isPublic !== undefined) {
    if (input.isPublic) {
      const blocked = await hooks.gateMakePublic(row.id);
      if (blocked) return { blocked };
    }
    // Project-level visibility is authoritative after #665 (the watch page
    // plays the saved canvas live), so a draft can go public without a render.
    const updated = await applyProjectVisibility(db, row, input.isPublic);
    // The home video wall shows a public render only after the explicit scan.
    if (input.isPublic && row.videoId) hooks.scheduleScan(row.videoId);
    const linkedVideo = row.videoId ? await findVideoById(db, row.videoId) : null;
    dto = toProjectDto(updated ?? row, linkedVideo);
  }
  if (!dto) throw new DomainError(400, "VALIDATION_ERROR", "Invalid request");
  return { project: dto };
}

async function applyStatus<Blocked>(
  db: Db,
  row: StudioProjectRow,
  nextStatus: ProjectStatus,
  hooks: ProjectUpdateHooks<Blocked>,
): Promise<{ blocked: Blocked } | { row: StudioProjectRow; dto: StudioProjectDto }> {
  const projectId = row.id;
  const isPublish = nextStatus === "published";
  const isUnpublish = nextStatus === "exported";
  if (isPublish) {
    const blocked = await hooks.gatePublish(projectId);
    if (blocked) return { blocked };
    // Roll off the sibling primary first so the unique index never sees two.
    await clearProfilePrimary(db, row.userId);
  }

  const updated = await updateProject(db, projectId, {
    status: nextStatus,
    updatedAt: new Date(),
    ...(isPublish ? { isProfilePrimary: true } : {}),
    ...(isUnpublish ? { isProfilePrimary: false } : {}),
  });
  if (!updated) throw projectNotFound();

  // Mirror onto the render so privacy-status readers (channels, home feed)
  // agree. No render yet → nothing to gate (served live via the canvas).
  if (row.videoId && (isPublish || isUnpublish)) {
    await updateVideo(db, row.videoId, { privacyStatus: isPublish ? "public" : "unlisted", updatedAt: new Date() });
    invalidatePublicVideoFeed();
    if (isPublish) hooks.scheduleScan(row.videoId);
  }

  const linkedVideo = row.videoId ? await findVideoById(db, row.videoId) : null;
  const dto = toProjectDto(updated, linkedVideo);
  // The /m/<slug> watch payload flips between "pending" and live with status.
  bumpPublicWatchCache(updated.id, updated.slug, updated.videoId);

  // The on-platform "profile" publication record (#1920).
  if (isPublish) {
    await recordPublication({
      projectId,
      destination: "profile",
      externalUrl: publicVideoPath(dto.slug || projectId),
      status: "published",
    }).catch(() => undefined);
  } else if (isUnpublish) {
    await removePublication(projectId, "profile").catch(() => undefined);
  }

  if (isPublish && PUBLISH_AWARDED_KINDS.has(row.mediaKind)) {
    await awardCreatePublished(db, row);
  }

  // A failed status drops it from the public lists; a recovery restores it.
  invalidatePublicProjectsForSubjects(await loadProjectSubjects(db, projectId));
  return { row: updated, dto };
}

/** Award the project CREATOR (role looked up, so a delegated publisher still
 *  credits them) for publishing a game / comic / podcast. Deduped on the
 *  project id; a failure only logs. */
async function awardCreatePublished(db: Db, row: StudioProjectRow): Promise<void> {
  try {
    const { GamificationService, ACTIONS } = await import("../../domains/gamification/index.js");
    const { buildRepos } = await import("../../repositories/index.js");
    const game = new GamificationService(buildRepos(db));
    const action =
      row.mediaKind === "game"
        ? ACTIONS.STUDIO_GAME_PUBLISHED
        : row.mediaKind === "comic"
          ? ACTIONS.STUDIO_COMIC_PUBLISHED
          : ACTIONS.STUDIO_PODCAST_PUBLISHED;
    await game.awardWithRoleLookup(action, {
      userId: row.userId,
      refId: row.id,
      refType: "studio_project",
      metadata: { mediaKind: row.mediaKind },
    });
  } catch (e) {
    console.warn("[gamification] studio-create-published award failed", { projectId: row.id, error: String(e) });
  }
}
