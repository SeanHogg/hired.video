/**
 * Studio project lifecycle commands: delete (with its media) and clone.
 * Split out of routes/studio.ts (W2-3a).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectById, insertProject } from "../../repositories/studioProjectsRepository.js";
import { assertCanWrite } from "./workspace.js";
import { resolveWorkspaceFromBody } from "./workspace-request.js";
import { loadProjectSubjects } from "./project-visibility.js";
import { invalidatePublicProjectsForSubjects } from "./public-projects-cache.js";
import { deleteProjectWithMedia } from "./delete-project-media.js";
import { toProjectDto, type StudioProjectDto } from "./project-dto.js";

const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");

/** DELETE /projects/:projectId — authorized against the row's real owner
 *  (personal / company / delegated grant). Also drops the master render's
 *  and fitted cuts' video rows + R2 objects. */
export async function deleteStudioProject(actorUserId: string, projectId: string): Promise<{ id: string }> {
  const db = getDb();
  const row = await findProjectById(db, projectId);
  if (!row) throw projectNotFound();
  await assertCanWrite(actorUserId, row.userId, row.companyId ?? null);
  const subjectsBefore = await loadProjectSubjects(db, projectId);
  await deleteProjectWithMedia(projectId, { db });
  invalidatePublicProjectsForSubjects(subjectsBefore);
  return { id: projectId };
}

/** POST /projects/:projectId/clone — a draft copy named "<name> (Copy)".
 *  The body's `workspace` may retarget it; without one the clone inherits
 *  the source's company. */
export async function cloneStudioProject(
  actorUserId: string,
  projectId: string,
  body: unknown,
): Promise<StudioProjectDto> {
  const db = getDb();
  const original = await findProjectById(db, projectId);
  if (!original) throw projectNotFound();
  await assertCanWrite(actorUserId, original.userId, original.companyId ?? null);
  const target = await resolveWorkspaceFromBody(actorUserId, body);
  const hasSelection = Boolean((body as { workspace?: unknown } | null)?.workspace);
  const ownerCompanyId = hasSelection ? target.ownerCompanyId : original.companyId;
  const clone = await insertProject(db, {
    userId: target.ownerUserId,
    companyId: ownerCompanyId ?? null,
    resumeText: original.resumeText,
    resumeId: null,
    storyboard: original.storyboard,
    name: `${original.name ?? "Project"} (Copy)`.slice(0, 200),
    purpose: original.purpose,
    status: "draft",
  });
  return toProjectDto(clone);
}
