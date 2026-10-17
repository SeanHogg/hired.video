/**
 * Per-link subject management on a studio project (add one / remove one).
 * Both are idempotent — adding an existing link or removing a missing one
 * still succeeds. Split out of routes/studio.ts (W2-3a).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectById, updateProject } from "../../repositories/studioProjectsRepository.js";
import {
  deleteProjectSubject,
  insertProjectSubject,
  type SubjectRef,
} from "../../repositories/studioProjectSubjectsRepository.js";
import { assertCanWrite } from "./workspace.js";
import { forceProjectUnlisted, loadProjectSubjects } from "./project-visibility.js";
import { invalidatePublicProjectsForSubjects } from "./public-projects-cache.js";

export interface ProjectSubjectsResult {
  projectId: string;
  subjects: SubjectRef[];
}

async function loadWritableProject(actorUserId: string, projectId: string) {
  const db = getDb();
  const project = await findProjectById(db, projectId);
  if (!project) throw new DomainError(404, "NOT_FOUND", "Project not found");
  await assertCanWrite(actorUserId, project.userId, project.companyId ?? null);
  return { db, project };
}

export async function addProjectSubject(
  actorUserId: string,
  projectId: string,
  subject: SubjectRef,
): Promise<ProjectSubjectsResult> {
  const { db } = await loadWritableProject(actorUserId, projectId);
  const isNew = await insertProjectSubject(db, projectId, subject);
  // A newly linked candidate makes this a candidate video: unlisted until
  // the candidate approves it (POST /api/recruiter/candidate-video-consents).
  if (subject.kind === "talent_pool_candidate" && isNew) {
    await forceProjectUnlisted(projectId, db);
  }
  // Keep the legacy `resume_id` denorm in sync for resume-kind links.
  if (subject.kind === "resume") {
    await updateProject(db, projectId, { resumeId: subject.id });
  }
  invalidatePublicProjectsForSubjects([subject]);
  return { projectId, subjects: await loadProjectSubjects(db, projectId) };
}

export async function removeProjectSubject(
  actorUserId: string,
  projectId: string,
  subject: SubjectRef,
): Promise<ProjectSubjectsResult> {
  const { db, project } = await loadWritableProject(actorUserId, projectId);
  await deleteProjectSubject(db, projectId, subject);
  // The unlinked row was the legacy resumeId denorm → clear it.
  if (subject.kind === "resume" && project.resumeId === subject.id) {
    await updateProject(db, projectId, { resumeId: null });
  }
  invalidatePublicProjectsForSubjects([subject]);
  return { projectId, subjects: await loadProjectSubjects(db, projectId) };
}
