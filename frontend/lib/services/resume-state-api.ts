/**
 * Résumé state flips — every one is `PATCH /api/resumes/:id` with a
 * ResumeStatePatch body (shared/resume-create.ts) and answers the updated
 * résumé; watching is `PUT|DELETE /api/resumes/:id/watch`. Exposed on
 * `resumeService` (resume-service.ts) under the historical method names.
 */
import { apiClient } from "../api-client";
import { ResumeSchema, type Resume } from "@shared/resume";
import type { ResumeStatePatch } from "@shared/resume-create";
import type { ResumePrivacy } from "@/types/resume";

/** PATCH one résumé's state; resolves to the updated résumé. */
export async function patchResumeState(id: string, patch: ResumeStatePatch): Promise<Resume> {
  const response = await apiClient.patch<Resume>(`/api/resumes/${id}`, patch, ResumeSchema);
  return response.data;
}

/** Runs a state flip for the boolean-returning legacy methods: `true` once
 *  the server accepts it; failures rethrow with a readable message. */
async function flip(id: string, patch: ResumeStatePatch, label: string, fallback: string): Promise<boolean> {
  try {
    await patchResumeState(id, patch);
    return true;
  } catch (error) {
    console.error(`Error ${label}:`, error);
    throw new Error(error instanceof Error ? error.message : fallback);
  }
}

/** #154 — Archive (soft-delete). Hides from default list, preserves analytics. */
export async function archiveResume(id: string): Promise<void> {
  await patchResumeState(id, { archived: true });
}

/** #154 — Unarchive. Restores into the default list. */
export async function unarchiveResume(id: string): Promise<void> {
  await patchResumeState(id, { archived: false });
}

/** Set a résumé as the (per-owner singleton) master. */
export function setMasterResume(id: string): Promise<boolean> {
  return flip(id, { isMaster: true }, "setting master resume", "Failed to set master resume. Please try again.");
}

/** Set a résumé as the (per-owner singleton) active résumé. */
export function setActiveResume(id: string): Promise<boolean> {
  return flip(id, { isActive: true }, "setting active resume", "Failed to set active resume. Please try again.");
}

/** Set résumé privacy with backend-enforced exclusivity rules. */
export async function setResumePrivacy(id: string, privacy: ResumePrivacy): Promise<boolean> {
  await patchResumeState(id, { privacy });
  return true;
}

/**
 * Detach a variant from its parent so it becomes a standalone résumé.
 * Used when the user asks to create a variation from a résumé that is
 * itself already a variant — the one-level hierarchy means we must root
 * it first. Unlike `promoteVariantToMaster`, this does NOT touch the
 * singleton `isMaster` flag.
 */
export function detachFromParent(id: string): Promise<boolean> {
  return flip(id, { parentId: null }, "detaching resume from parent", "Failed to detach resume from parent. Please try again.");
}

/** Promote a variant to be the new master résumé. */
export function promoteVariantToMaster(id: string): Promise<boolean> {
  return flip(
    id,
    { isMaster: true, parentId: null },
    "promoting variant to master",
    "Failed to promote variant to master. Please try again.",
  );
}

/** Watch/track a résumé. */
export async function watchResume(id: string): Promise<void> {
  await apiClient.put(`/api/resumes/${id}/watch`, {});
}

/** Unwatch/untrack a résumé. */
export async function unwatchResume(id: string): Promise<void> {
  await apiClient.delete(`/api/resumes/${id}/watch`);
}
