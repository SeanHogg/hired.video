/**
 * Real-time collaboration room gate (#2243): may `userId` join the StudioRoom
 * of `projectId`? Checked against the project's REAL owner via `canActFor`
 * (owner, company member, invited workspace_grants delegate). The socket
 * route renders the verdict as its plain-text upgrade response.
 */
import { getDb } from "../../db/index.js";
import { findProjectAccess } from "../../repositories/studioProjectsRepository.js";
import { canActFor } from "./workspace.js";

export type CollabRoomAccess = "ok" | "not_found" | "forbidden";

export async function resolveCollabRoomAccess(userId: string, projectId: string): Promise<CollabRoomAccess> {
  const project = await findProjectAccess(getDb(), projectId);
  if (!project) return "not_found";
  return (await canActFor(userId, project.userId, project.companyId ?? null)) ? "ok" : "forbidden";
}
