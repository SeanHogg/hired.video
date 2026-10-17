/**
 * Snapshot history (#155) + watched list (#403) use cases. Return domain
 * data; throw DomainError.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import type { IResumeRepository } from "../../repositories/index.js";
import type { ResumeVersionRepository } from "../../repositories/resumeVersionRepository.js";
import { resumeNotFound } from "./errors.js";

const AUTOSAVE_CAP = 50;
const AUTOSAVE_RETENTION_DAYS = 30;

export const CreateSnapshotSchema = z.object({
  label: z.string().trim().max(120).optional(),
  isAutosave: z.boolean().optional(),
});

/** Owner check shared by every history call: 404 missing, 403 not theirs. */
async function assertOwner(versions: ResumeVersionRepository, resumeId: string, userId: string): Promise<void> {
  const owner = await versions.ownerOf(resumeId);
  if (!owner) throw resumeNotFound();
  if (owner !== userId) throw new DomainError(403, "FORBIDDEN", "Not your resume");
}

export async function listSnapshots(versions: ResumeVersionRepository, userId: string, resumeId: string) {
  await assertOwner(versions, resumeId, userId);
  return { versions: await versions.listForResume(resumeId) };
}

export async function createSnapshot(versions: ResumeVersionRepository, userId: string, resumeId: string, body: unknown) {
  const parsed = CreateSnapshotSchema.safeParse(body ?? {});
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", "Invalid version payload");
  const created = await versions.insertSnapshot(resumeId, userId, {
    label: parsed.data.label ?? null,
    isAutosave: parsed.data.isAutosave ?? false,
  });
  if (!created) {
    // Zero rows = missing or not theirs; the probe picks the status code.
    await assertOwner(versions, resumeId, userId);
    throw resumeNotFound();
  }
  if (created.isAutosave) {
    await versions.pruneAutosaves(resumeId, { cap: AUTOSAVE_CAP, retentionDays: AUTOSAVE_RETENTION_DAYS });
  }
  return { version: created };
}

export async function restoreSnapshot(
  versions: ResumeVersionRepository,
  resumes: IResumeRepository,
  userId: string,
  resumeId: string,
  versionId: string,
) {
  await assertOwner(versions, resumeId, userId);
  const version = await versions.findVersion(resumeId, versionId);
  if (!version) throw resumeNotFound("Version not found");
  const restored = await resumes.updateByIdForOwner(resumeId, userId, {
    content: version.resumeData as Record<string, unknown>,
  });
  return { resume: restored };
}

export async function listWatched(versions: ResumeVersionRepository, viewerId: string) {
  const rows = await versions.listWatchedByViewer(viewerId);
  return { resumes: rows.map((r: Record<string, unknown>) => ({ ...r, ownership: "watched" as const })) };
}
