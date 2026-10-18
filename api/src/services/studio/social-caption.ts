/**
 * Social caption AI (#203 / #2045) — loads the caller's own project as the
 * caption source: the project row with its Timeline exposed under its
 * per-kind name (state → timelineSpec), the shape
 * shared/social-caption.ts `generateProjectSocialCaption` reads.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectById } from "../../repositories/studioProjectsRepository.js";
import { projectStateDto } from "./project-state.js";

/** The caller's own project as a caption source; 404 for anyone else's. */
export async function loadOwnedCaptionSource(userId: string, projectId: string) {
  const project = await findProjectById(getDb(), projectId);
  if (!project || project.userId !== userId) throw new DomainError(404, "NOT_FOUND", "Project not found");
  return { ...project, timelineSpec: projectStateDto(project).timelineSpec };
}
