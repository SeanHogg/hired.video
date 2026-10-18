/**
 * NLE project use cases (`/api/nle/projects*`). NLE projects share the
 * studio_projects table (kind='nle' discriminator); their Timeline JSON
 * (shared/timeline.ts) is the row's `state`. Every write is authorized
 * against the row's real owner via assertCanWrite(); reads go through the
 * caller's ownership scope and a miss is a 404 (never a 403) so existence
 * doesn't leak. Split out of routes/nle.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findNleProjectDetailVisibleTo,
  findNleProjectSummariesVisibleTo,
  findProjectById,
  insertProject,
  updateProjectBumpingRevision,
  type OwnershipScope,
} from "../../repositories/studioProjectsRepository.js";
import { emptyTimeline } from "../../../../shared/timeline.js";
import { assertCanWrite, listAccessibleWorkspaces } from "../studio/workspace.js";
import { resolveWorkspaceFromBody } from "../studio/workspace-request.js";
import { deleteProjectWithMedia } from "../studio/delete-project-media.js";
import { bumpPublicWatchCache } from "../studio/public-watch-cache.js";
import { stateWrite } from "../studio/project-state.js";

const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");

/** The read scope (own / company / delegated) for `actorUserId`. */
export async function nleScopeFor(actorUserId: string): Promise<OwnershipScope> {
  const accessible = await listAccessibleWorkspaces(actorUserId);
  return { actorUserId, ...accessible };
}

/** A project row the actor may write that must be kind='nle'. */
async function loadWritableNleProject(actorUserId: string, projectId: string, wrongKindMessage: string) {
  const db = getDb();
  const existing = await findProjectById(db, projectId);
  if (!existing) throw projectNotFound();
  if (existing.kind !== "nle") throw new DomainError(400, "WRONG_KIND", wrongKindMessage);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId ?? null);
  return { db, existing };
}

export interface CreateNleProjectInput {
  title: string;
  fps: number;
  width: number;
  height: number;
  /** Optional initial Timeline (e.g. cloned from a template). */
  timelineSpec?: unknown;
}

/**
 * Create a project in the body's workspace. Without a supplied Timeline
 * the shared default builder (shared/timeline.ts emptyTimeline) produces
 * one, so server and client agree on tracks, schema version and background.
 */
export async function createNleProject(actorUserId: string, body: unknown, input: CreateNleProjectInput) {
  const target = await resolveWorkspaceFromBody(actorUserId, body);
  const { title, fps, width, height } = input;
  const initialTimeline = input.timelineSpec ?? emptyTimeline({ fps, width, height });

  const created = await insertProject(getDb(), {
    userId: target.ownerUserId,
    companyId: target.ownerCompanyId,
    kind: "nle",
    // resumeText is NOT NULL but unused by NLE: it carries the user-facing
    // title (read back as `title`). Drop once resumeText is nullable.
    resumeText: title,
    name: title,
    // stateWrite keeps baked_hash in step with the Timeline.
    ...stateWrite(initialTimeline),
    status: "draft",
  });

  return {
    id: created.id,
    title,
    kind: "nle",
    timelineSpec: initialTimeline,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

/** Dashboard list — metadata only; the Timeline loads lazily per project. */
export async function listNleProjects(actorUserId: string) {
  const projects = await findNleProjectSummariesVisibleTo(getDb(), await nleScopeFor(actorUserId));
  return { projects };
}

/** One project with its full Timeline JSON. */
export async function getNleProject(actorUserId: string, projectId: string) {
  const row = await findNleProjectDetailVisibleTo(getDb(), await nleScopeFor(actorUserId), projectId);
  if (!row || row.kind !== "nle") throw projectNotFound();
  return row;
}

/**
 * Save the Timeline (stored verbatim — the editor validates its shape).
 * A save is a content change, so it bumps the revision save-draft's
 * stale-write check reads (#2242) and the public watch cache.
 */
export async function saveNleTimeline(
  actorUserId: string,
  projectId: string,
  input: { timelineSpec: Record<string, unknown>; title?: string },
) {
  const { db } = await loadWritableNleProject(actorUserId, projectId, "This project is not an NLE project");
  const updated = await updateProjectBumpingRevision(db, projectId, {
    ...stateWrite(input.timelineSpec),
    userId: actorUserId, // record the actual editor for attribution
    ...(input.title !== undefined ? { resumeText: input.title } : {}),
  });
  if (!updated) throw projectNotFound();

  bumpPublicWatchCache(updated.id, updated.slug, updated.videoId);

  return {
    id: updated.id,
    title: updated.resumeText,
    timelineSpec: updated.state,
    updatedAt: updated.updatedAt,
  };
}

/** Delete an NLE project plus its master render's and fitted cuts' video
 *  rows + R2 objects. Non-NLE projects go through /api/studio. */
export async function deleteNleProject(actorUserId: string, projectId: string): Promise<{ id: string }> {
  const { db } = await loadWritableNleProject(
    actorUserId,
    projectId,
    "Use /api/studio/projects/:id for non-NLE projects",
  );
  await deleteProjectWithMedia(projectId, { db });
  return { id: projectId };
}
