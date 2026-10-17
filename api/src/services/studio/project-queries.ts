/**
 * Studio project reads: the owner's project list, the single-project
 * hydration (v2 editor), the Chrome extension's legacy status poll and the
 * per-project publication list. Split out of routes/studio.ts (W2-3a).
 *
 * The single-project read and the legacy status poll share ONE repository
 * load (project + linked render, left-joined) — they differ only in scope
 * and response shape.
 */
import { getDb, type Db } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { DomainError } from "../../domains/errors.js";
import { STUDIO_SUBJECT_KINDS } from "../../../../shared/studio-subject.js";
import {
  findProjectById,
  findProjectWithVideo,
  findProjectsVisibleTo,
  findVideosVisibleTo,
  type OwnershipScope,
  type ProjectWithVideo,
} from "../../repositories/studioProjectsRepository.js";
import { findProjectIdsForSubject, loadProjectSubjectsBulk } from "../../repositories/studioProjectSubjectsRepository.js";
import { countViewsAndClicksByProject } from "../../repositories/videoAnalyticsRepository.js";
import { assertCanWrite, canActFor, listAccessibleWorkspaces } from "./workspace.js";
import { parseWorkspaceQueryParam } from "./workspace-request.js";
import { loadProjectSubjects } from "./project-visibility.js";
import { countPublishedChannelsByProject, listPublications } from "./publication-service.js";
import { mapStudioStatus, toProjectDto, type StudioProjectDto } from "./project-dto.js";

const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");

/** The full DTO (with subjects) of a project, or null when it is gone.
 *  What every write returns so the client gets the persisted shape back. */
export async function loadProjectDto(db: Db, projectId: string): Promise<StudioProjectDto | null> {
  const loaded = await findProjectWithVideo(db, projectId);
  if (!loaded) return null;
  return dtoWithSubjects(db, loaded);
}

async function dtoWithSubjects(db: Db, { project, video }: ProjectWithVideo): Promise<StudioProjectDto> {
  const subjects = await loadProjectSubjects(db, project.id);
  return toProjectDto(project, video, undefined, subjects);
}

/** GET /projects/:projectId — readable by the owner, a member of the owning
 *  company or a delegated grantee. 404 (never 403) otherwise so ids can't
 *  be enumerated. */
export async function getReadableProject(actorUserId: string, projectId: string): Promise<StudioProjectDto> {
  const db = getDb();
  const loaded = await findProjectWithVideo(db, projectId);
  if (!loaded) throw projectNotFound();
  const { project } = loaded;
  const allowed = await canActFor(actorUserId, project.userId, project.companyId ?? null);
  if (!allowed) throw projectNotFound();
  return dtoWithSubjects(db, loaded);
}

export interface LegacyProjectStatus {
  id: string;
  status: ReturnType<typeof mapStudioStatus>;
  progressPercentage: number;
  youtubeVideoId: string | null;
  videoUrl: string | null;
  renderUrl: string | null;
  errorMessage: string | null;
}

/**
 * GET /status/:projectId — the published Chrome extension's render poll.
 * Owner-only (the row's userId AND the render's userId must be the caller);
 * same load as getReadableProject, the extension's original shape.
 */
export async function getLegacyProjectStatus(actorUserId: string, projectId: string): Promise<LegacyProjectStatus> {
  const loaded = await findProjectWithVideo(getDb(), projectId);
  if (!loaded || loaded.project.userId !== actorUserId) {
    throw new DomainError(404, "NOT_FOUND", "Studio project not found");
  }
  const { project } = loaded;
  const linkedVideo = loaded.video && loaded.video.userId === actorUserId ? loaded.video : null;
  const status = mapStudioStatus(project.status);
  const progressPercentage =
    status === "Draft" ? 10 :
    status === "Processing" ? 45 :
    status === "Publishing" ? 75 :
    status === "Completed" ? 100 : 0;
  return {
    id: project.id,
    status,
    progressPercentage,
    youtubeVideoId: linkedVideo?.youtubeVideoId ?? null,
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null),
    // The hosted MP4 itself (null before the first render). Every render
    // uploads under a new key, so a caller waiting for a FRESH render (the
    // Chrome extension after updating a project) watches this change.
    renderUrl: linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null,
    errorMessage: status === "Failed" ? linkedVideo?.errorMessage ?? "Publishing failed" : null,
  };
}

export interface ProjectListQuery {
  subjectKind?: string;
  subjectId?: string;
  /** Raw `?workspace=` ("personal" | "company:<id>" | "delegated:<id>"). */
  workspace?: string;
}

/**
 * GET /projects — every project the caller can act on (optionally one
 * workspace, optionally linked to one subject), with linked renders, view /
 * CTA counts, subjects and published-channel counts bulk-loaded (no N+1).
 */
export async function listProjects(actorUserId: string, query: ProjectListQuery): Promise<StudioProjectDto[]> {
  const db = getDb();
  const { subjectKind, subjectId } = query;
  const subjectFilterValid =
    !!subjectKind &&
    !!subjectId &&
    STUDIO_SUBJECT_KINDS.includes(subjectKind as (typeof STUDIO_SUBJECT_KINDS)[number]);

  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(actorUserId);
  const scope: OwnershipScope = {
    actorUserId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace: parseWorkspaceQueryParam(query.workspace),
  };

  let subjectFilteredIds: string[] | null = null;
  if (subjectFilterValid) {
    subjectFilteredIds = await findProjectIdsForSubject(db, { kind: subjectKind!, id: subjectId! });
    if (subjectFilteredIds.length === 0) return [];
  }

  const projects = await findProjectsVisibleTo(db, scope, subjectFilteredIds);
  const videoIds = projects.map((p) => p.videoId).filter((id): id is string => Boolean(id));
  const projectIds = projects.map((p) => p.id);
  const [linkedVideos, analyticsByProject, subjectsByProject, channelsByProject] = await Promise.all([
    findVideosVisibleTo(db, scope, videoIds),
    countViewsAndClicksByProject(db, projectIds),
    loadProjectSubjectsBulk(db, projectIds),
    countPublishedChannelsByProject(projectIds, db),
  ]);
  const videoById = new Map(linkedVideos.map((v) => [v.id, v]));

  return projects.map((p) => toProjectDto(
    p,
    p.videoId ? videoById.get(p.videoId) ?? null : null,
    analyticsByProject.get(p.id),
    subjectsByProject.get(p.id) ?? [],
    channelsByProject.get(p.id) ?? 0,
  ));
}

/** GET /projects/:projectId/publications — writers only. */
export async function listProjectPublications(actorUserId: string, projectId: string) {
  const row = await findProjectById(getDb(), projectId);
  if (!row) throw projectNotFound();
  await assertCanWrite(actorUserId, row.userId, row.companyId ?? null);
  return listPublications(projectId);
}
