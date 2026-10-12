/**
 * Recording → project link gate (#2391 hardening).
 *
 * `POST /api/studio/recording/upload` takes `projectId` from the form. A take
 * linked to a project shows up wherever that project's takes are read —
 * including the owner's public video pitch — so the uploader must be allowed
 * to write to that project: the owner, a member of the owning company, or a
 * delegate with an active "studio" grant (`canActFor`, via the existing
 * `ownsByStudioProject` check the tool-run routes use).
 *
 * The check sits behind the `StudioProjectWriteAccess` port so it is testable
 * without the route file, and the write runs ONLY after the gate passes —
 * a refused link stores no blob and inserts no row.
 */

import { getDb } from "../../db/index.js";
import { ownsByStudioProject } from "../../repositories/toolRunOwnershipRepository.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";

/** Port: may `actorUserId` write to studio project `projectId`? */
export interface StudioProjectWriteAccess {
  canWrite(actorUserId: string, projectId: string): Promise<boolean>;
}

/** Production wiring — the canonical studio ownership rule (canActFor). */
export function defaultStudioProjectWriteAccess(): StudioProjectWriteAccess {
  return { canWrite: (actorUserId, projectId) => ownsByStudioProject(getDb(), actorUserId, projectId) };
}

export type GatedRecordingWrite<T> = { ok: true; value: T } | { ok: false };

/**
 * Normalise the client-supplied `projectId` and run `write` only when the
 * actor may link a take to it.
 *   • blank / absent      → write(null) — a loose recording, no project.
 *   • not a uuid          → write(null) — it can never name a studio project
 *                           (and must not reach the uuid column).
 *   • uuid, writable      → write(projectId).
 *   • uuid, not writable  → `{ ok: false }` (unknown and forbidden look the
 *                           same, so the caller answers 404 — no existence
 *                           leak, same as GET /api/studio/projects/:id).
 */
export async function withRecordingProjectAccess<T>(
  actorUserId: string,
  rawProjectId: unknown,
  write: (projectId: string | null) => Promise<T>,
  access: StudioProjectWriteAccess = defaultStudioProjectWriteAccess(),
): Promise<GatedRecordingWrite<T>> {
  const projectId = normaliseProjectId(rawProjectId);
  if (!projectId) return { ok: true, value: await write(null) };
  if (!(await access.canWrite(actorUserId, projectId))) return { ok: false };
  return { ok: true, value: await write(projectId) };
}

/** Trimmed uuid form value, or null for blank / non-string / non-uuid input. */
function normaliseProjectId(rawProjectId: unknown): string | null {
  const projectId = typeof rawProjectId === "string" ? rawProjectId.trim() : "";
  return projectId && UUID_LIKE_REGEX.test(projectId) ? projectId : null;
}

/**
 * Generic uploads (#2377): `POST /api/upload/*` copies the client's
 * `projectId` onto `uploaded_assets.source_project_id`. Unlike a recording,
 * that link is metadata only (media-library grouping), so a hint that fails
 * the same write rule is DROPPED instead of refusing the upload:
 *   • blank / absent / not a uuid → null (no access check).
 *   • uuid, writable              → projectId.
 *   • uuid, not writable/unknown  → null.
 */
export async function resolveUploadSourceProjectId(
  actorUserId: string,
  rawProjectId: unknown,
  access: StudioProjectWriteAccess = defaultStudioProjectWriteAccess(),
): Promise<string | null> {
  const projectId = normaliseProjectId(rawProjectId);
  if (!projectId) return null;
  return (await access.canWrite(actorUserId, projectId)) ? projectId : null;
}
