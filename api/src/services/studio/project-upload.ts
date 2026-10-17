/**
 * POST /api/studio/upload — store a rendered (or recorded) video for a
 * project and publish it. Split out of routes/studio.ts (W2-3a).
 *
 * The route keeps the request-bound steps (file presence, the
 * `video_publish` quota enforce, usage metering and the explicit-content
 * scan); this use case owns the 4K Pro gate, workspace resolution, the R2
 * write, render-row reuse (+ reclaiming the previous render's object), the
 * publish flip, candidate-consent enforcement and cache bumps.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { TIER_COPY } from "../../../../shared/tier-copy.js";
import { getSubscription } from "../billing/BillingService.js";
import { putObject } from "../storage/object-store.js";
import { deleteR2Keys } from "../storage/r2-delete.js";
import {
  findProjectById,
  findVideoById,
  insertProject,
  insertVideo,
  updateProject,
  updateVideo,
  type LinkedVideoRow,
  type StudioProjectRow,
} from "../../repositories/studioProjectsRepository.js";
import { ensureCreatorCredit } from "../../repositories/studioProjectSubjectsRepository.js";
import { enforceCandidateVideoConsent } from "../candidate-consent/candidate-consent-deps.js";
import { assertCanWrite, WorkspaceForbiddenError } from "./workspace.js";
import { resolveWorkspaceFromBody, type WorkspaceTarget } from "./workspace-request.js";
import { bumpPageEmbedsVersion } from "./page-embed-service.js";
import { bumpPublicWatchCache } from "./public-watch-cache.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";
import { toProjectDto, type StudioProjectDto } from "./project-dto.js";

/** Gap #133: 4K export is a Pro feature (402 PRO_REQUIRED otherwise). */
export async function assertCanExportResolution(actorUserId: string, resolution: string): Promise<void> {
  if (resolution !== "4k") return;
  const sub = await getSubscription(actorUserId);
  if (!sub.isPro) {
    throw new DomainError(
      402,
      "PRO_REQUIRED",
      `${TIER_COPY.proRequiredToastBody("4K export")} Upgrade to unlock 3840×2160 export.`,
    );
  }
}

export interface ProjectUploadInput {
  file: File;
  title: string;
  projectId: string;
  resumeId: string | null;
  /** Watermarked by the export pipeline (raw recordings → false). */
  branded: boolean;
  /** Raw multipart `workspace` field (JSON) or null for personal. */
  workspaceField: string | null;
}

export interface ProjectUploadResult {
  dto: StudioProjectDto;
  projectId: string;
  videoId: string;
}

/** Multipart `workspace` → write target. An unparseable selection falls back
 *  to personal; a forbidden one is a 403. */
async function resolveUploadTarget(actorUserId: string, workspaceField: string | null): Promise<WorkspaceTarget> {
  try {
    const selection: unknown = workspaceField ? JSON.parse(workspaceField) : null;
    return await resolveWorkspaceFromBody(actorUserId, { workspace: selection });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw e;
    return { ownerUserId: actorUserId, ownerCompanyId: null };
  }
}

export async function uploadProjectVideo(actorUserId: string, input: ProjectUploadInput): Promise<ProjectUploadResult> {
  const { file, title, branded } = input;
  const db = getDb();
  const target = await resolveUploadTarget(actorUserId, input.workspaceField);

  let project: StudioProjectRow | null = null;
  if (input.projectId) {
    const existing = await findProjectById(db, input.projectId);
    if (existing) {
      await assertCanWrite(actorUserId, existing.userId, existing.companyId ?? null);
      project = existing;
    }
  }
  if (!project) {
    project = await insertProject(db, {
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      resumeText: title,
      storyboard: null,
      status: "pending",
    });
    // Auto-credit the editor's profile when this is delegated work.
    if (target.ownerUserId !== actorUserId && target.ownerCompanyId == null) {
      await ensureCreatorCredit(db, project.id, actorUserId);
    }
  }

  const r2Key = `studio/${actorUserId}/${project.id}/${Date.now()}-${file.name || "video.webm"}`;
  const bytes = await file.arrayBuffer();
  const uploaded = await putObject(r2Key, bytes, file.type || "video/webm", { userId: actorUserId, projectId: project.id });
  if (!uploaded) {
    throw new DomainError(503, "STORAGE_UNAVAILABLE", "No storage configured. Cannot save video file.");
  }

  const projectResumeId = input.resumeId ?? project.resumeId ?? null;

  // Reuse the project's render row (privacyStatus persists) and reclaim the
  // previous R2 object — otherwise every re-render orphans the prior one.
  let video: LinkedVideoRow | null = null;
  if (project.videoId) {
    // By id alone — the parent project's ownership was already asserted.
    const existingVideo = await findVideoById(db, project.videoId);
    if (existingVideo) {
      video = await updateVideo(db, existingVideo.id, {
        r2Key, branded, status: "completed", title, resumeId: projectResumeId, updatedAt: new Date(),
      });
      invalidatePublicVideoFeed();
      if (existingVideo.r2Key && existingVideo.r2Key !== r2Key) {
        await deleteR2Keys([existingVideo.r2Key]);
      }
    }
  }
  if (!video) {
    video = await insertVideo(db, {
      userId: project.userId, // mirror project ownership
      companyId: project.companyId,
      status: "completed",
      r2Key,
      branded,
      title,
      resumeId: projectResumeId,
    });
    invalidatePublicVideoFeed();
  }

  // Published → shows on the owner's profile (Make Public is separate).
  let updatedProject = await updateProject(db, project.id, {
    status: "published", videoId: video.id, resumeId: projectResumeId, updatedAt: new Date(),
  });
  // A candidate video's unapproved new render goes (back) to unlisted.
  if (await enforceCandidateVideoConsent(project.id)) {
    updatedProject = await findProjectById(db, project.id);
  }
  // Page→video embeds resolve the CURRENT render — orphan cached resolves.
  bumpPageEmbedsVersion();
  bumpPublicWatchCache(project.id, project.slug, project.videoId, video.id);

  return { dto: toProjectDto(updatedProject, video), projectId: project.id, videoId: video.id };
}
