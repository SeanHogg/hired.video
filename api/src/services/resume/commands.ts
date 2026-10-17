/**
 * Résumé write use cases (other than creation — see create/): update,
 * delete, metadata, the PATCH state flips, watch. Every `content` write
 * runs through healAndValidateContent. Return domain data; throw DomainError.
 */
import { UpdateResumeSchema, type Resume } from "../../../../shared/resume.js";
import type { ResumeStatePatch } from "../../../../shared/resume-create.js";
import { PRIVACY_TO_LEVEL, rowToResume } from "../../handlers/resume-serializer.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { healAndValidateContent, preserveMeta, preserveMetaData, preserveSkillEvidence } from "./content.js";
import { invalidResumeBody, invalidResumeContent, resumeNotFound, slugTaken } from "./errors.js";
import type { ResumePatch } from "../../repositories/resumeRepository.js";
import type { ResumeDeps } from "./ports.js";

const OWNER_EXTRAS = { isOwner: true, isWatched: false, viewCount: 0 };

/** PUT /api/resumes/:id — content edits keep metaData, skillEvidence and
 *  the template-slot bag (`meta`) that dedicated flows own; parentId:null
 *  clears the stored diff. */
export async function updateResume(deps: ResumeDeps, ownerId: string, id: string, body: unknown): Promise<Resume> {
  const parsed = UpdateResumeSchema.safeParse(body);
  if (!parsed.success) throw invalidResumeBody({ issues: parsed.error.flatten() });

  // Global slug uniqueness — a collision silently points one public link at
  // another user's résumé.
  if (parsed.data.slug !== undefined && parsed.data.slug !== null) {
    if (await deps.repo.findBySlug(parsed.data.slug, id)) throw slugTaken(parsed.data.slug);
  }

  const existing = (await deps.repo.findByIdForOwner(id, ownerId))?.content as Record<string, unknown> | null;
  const { privacy, slug, content, ...dbFields } = parsed.data;
  const patch: ResumePatch = { ...dbFields, ...(slug !== undefined ? { slug } : {}) };

  if (content !== undefined) {
    const merged = preserveMeta(
      preserveSkillEvidence(preserveMetaData(content, existing?.metaData), existing?.skillEvidence),
      existing?.meta,
    );
    const heal = healAndValidateContent(merged);
    if (!heal.ok) throw invalidResumeContent(heal.issues);
    patch.content = heal.content as Record<string, unknown>;
  }
  if (privacy !== undefined) patch.privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
  if (dbFields.parentId === null) patch.diffPercent = null;

  const updated = await deps.repo.updateByIdForOwner(id, ownerId, patch);
  if (!updated) throw resumeNotFound();
  if (patch.content !== undefined) await deps.diff.refresh(deps.repo, ownerId, updated.id);
  return rowToResume(updated, OWNER_EXTRAS);
}

/** DELETE /api/resumes/:id — deleting a master unparents its versions. */
export async function deleteResume(deps: ResumeDeps, ownerId: string, id: string): Promise<void> {
  const existing = await deps.repo.findByIdForOwner(id, ownerId);
  if (!existing) throw resumeNotFound();
  if (existing.isMaster) await deps.repo.clearParentIdForChildren(id, ownerId);
  await deps.repo.deleteByIdForOwner(id, ownerId);
}

/** PUT /api/resumes/:id/metadata — replaces `content.metaData`. */
export async function updateMetadata(deps: ResumeDeps, ownerId: string, id: string, body: unknown): Promise<Resume> {
  const row = await deps.repo.findByIdForOwner(id, ownerId);
  if (!row) throw resumeNotFound();
  const merged = { ...((row.content as Record<string, unknown> | null) ?? {}), metaData: Array.isArray(body) ? body : [] };
  const heal = healAndValidateContent(merged);
  if (!heal.ok) throw invalidResumeContent(heal.issues);
  const updated = await deps.repo.updateByIdForOwner(id, ownerId, { content: heal.content as Record<string, unknown> });
  if (!updated) throw resumeNotFound();
  return rowToResume(updated, OWNER_EXTRAS);
}

/**
 * PATCH /api/resumes/:id — the state flips that used to be seven POSTs
 * (archive, unarchive, setmaster, setactive, setprivacy, promote, detach)
 * plus publish. `isMaster` / `isActive` are per-owner singletons: setting
 * one clears it on the owner's other résumés first. Promote =
 * `{ isMaster: true, parentId: null }`; detach = `{ parentId: null }`.
 */
export async function patchResumeState(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  patch: ResumeStatePatch,
): Promise<Resume> {
  if (!(await deps.repo.findByIdForOwner(id, ownerId))) throw resumeNotFound();

  if (patch.isMaster) await deps.repo.clearSingletonFlagForOwner(ownerId, "isMaster");
  if (patch.isActive) await deps.repo.clearSingletonFlagForOwner(ownerId, "isActive");

  const fields: ResumePatch = {};
  if (patch.isMaster) fields.isMaster = true;
  if (patch.isActive) fields.isActive = true;
  if (patch.privacy !== undefined) fields.privacyLevel = PRIVACY_TO_LEVEL[patch.privacy] ?? 10;
  if (patch.parentId === null) Object.assign(fields, { parentId: null, diffPercent: null });
  if (patch.archived !== undefined) fields.archivedAt = patch.archived ? deps.now() : null;
  if (patch.status !== undefined) fields.status = patch.status;

  const updated = await deps.repo.updateByIdForOwner(id, ownerId, fields);
  if (!updated) throw resumeNotFound();
  // privacyLevel decides whether the résumé appears in public search.
  if (patch.privacy !== undefined) bumpSearchVersion();
  return rowToResume(updated, OWNER_EXTRAS);
}

export async function watchResume(deps: ResumeDeps, viewerId: string, resumeId: string): Promise<{ watched: true }> {
  await deps.repo.addWatchIfMissing(viewerId, resumeId);
  return { watched: true };
}

export async function unwatchResume(deps: ResumeDeps, viewerId: string, resumeId: string): Promise<{ watched: false }> {
  await deps.repo.removeWatch(viewerId, resumeId);
  return { watched: false };
}
