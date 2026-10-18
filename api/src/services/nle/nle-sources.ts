/**
 * NLE media-source use cases (`/api/nle/sources*`): the uploaded media a
 * Timeline references by `tracks[].clips[].sourceId`. Writes are authorized
 * against the row's real owner (assertCanWrite); reads use the caller's
 * ownership scope. Each row owns its own R2 keys — uploads dedupe on
 * (workspace, content hash), so no key is shared across rows.
 * Split out of routes/nle.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  deleteSource,
  findSourceByContentHash,
  findSourceById,
  findSourceWithTags,
  insertSource,
  listDistinctTags,
  listSourcesWithTags,
  renameBinFolder,
  replaceSourceTags,
  updateSource,
  type NleMediaSourcePatch,
} from "../../repositories/nleMediaSourcesRepository.js";
import { assertCanWrite, resolveWorkspaceForWrite, WorkspaceForbiddenError, type WorkspaceSelection } from "../studio/workspace.js";
import type { WorkspaceTarget } from "../studio/workspace-request.js";
import { getVideoBucket, putObject } from "../storage/object-store.js";
import { deleteR2Keys } from "../storage/r2-delete.js";
import { cdnUrl, r2KeyFromCdnUrl } from "../../utils/cdn.js";
import { sha256Hex } from "../../utils/crypto.js";
import { logger } from "../../lib/logger.js";
import { nleScopeFor } from "./nle-projects.js";

const sourceNotFound = () => new DomainError(404, "NOT_FOUND", "Source not found");

/** Persist bytes to R2 at `key` and return the CDN URL. Without an R2
 *  binding (local dev) it warns and still returns the URL so the row inserts. */
async function putToR2(key: string, bytes: ArrayBuffer, contentType: string, what: string): Promise<string> {
  if (getVideoBucket()) {
    await putObject(key, bytes, contentType);
  } else {
    logger.warn(`[nle] R2 binding missing; ${what} not persisted`, { key });
  }
  return cdnUrl(key);
}

async function loadWritableSource(actorUserId: string, sourceId: string) {
  const db = getDb();
  const existing = await findSourceById(db, sourceId);
  if (!existing) throw sourceNotFound();
  await assertCanWrite(actorUserId, existing.userId, existing.companyId ?? null);
  return { db, existing };
}

/** Every source the caller's workspaces own, each with its tags. */
export async function listNleSources(actorUserId: string) {
  const sources = await listSourcesWithTags(getDb(), await nleScopeFor(actorUserId));
  return { sources };
}

/** Distinct tags across the caller's sources (the bin's facet picker). */
export async function listNleSourceTags(actorUserId: string) {
  const tags = await listDistinctTags(getDb(), await nleScopeFor(actorUserId));
  return { tags };
}

/** Strip leading/trailing slashes and collapse doubles so a rename is
 *  idempotent against user input variations. */
const normaliseFolder = (path: string) => path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

/**
 * Bulk-rename a bin folder (#358) across the rows the caller can see,
 * including every folder nested under it; an empty `to` flattens the
 * subtree to root. `bin_folder` stays the single source of truth.
 */
export async function renameNleBinFolder(actorUserId: string, from: string, to: string) {
  const normFrom = normaliseFolder(from);
  const normTo = normaliseFolder(to);
  if (!normFrom) throw new DomainError(400, "VALIDATION_ERROR", "Source folder cannot be empty");
  const updatedCount = await renameBinFolder(getDb(), await nleScopeFor(actorUserId), normFrom, normTo);
  return { updatedCount, from: normFrom, to: normTo || null };
}

export interface PatchNleSourceInput {
  binFolder?: string | null;
  tags?: string[];
  url?: string;
  filename?: string;
}

/**
 * Update bin metadata or relink a stale URL (#346). A supplied tag list
 * replaces the whole set (trimmed, de-duplicated, blanks dropped) — the
 * server owns the canonical state so the editor sends no deltas.
 */
export async function patchNleSource(actorUserId: string, sourceId: string, input: PatchNleSourceInput) {
  const { db } = await loadWritableSource(actorUserId, sourceId);

  const patch: NleMediaSourcePatch = {};
  if (input.binFolder !== undefined) patch.binFolder = input.binFolder;
  if (input.url !== undefined) patch.url = input.url;
  if (input.filename !== undefined) patch.filename = input.filename;
  await updateSource(db, sourceId, patch);

  if (input.tags) {
    const cleaned = Array.from(new Set(input.tags.map((t) => t.trim()).filter((t) => t.length > 0)));
    await replaceSourceTags(db, sourceId, cleaned);
  }

  return { source: await findSourceWithTags(db, sourceId) };
}

export interface UploadNleSourceInput {
  /** The raw `workspace` form field (JSON-stringified selector), if any. */
  workspaceField: string | null;
  kind: string;
  durationFrames: number;
  fps: number;
  width: number | null;
  height: number | null;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
}

/** Resolve the multipart `workspace` field. A forbidden selection is a 403;
 *  any other failure (e.g. malformed JSON) falls back to personal. */
async function resolveUploadTarget(actorUserId: string, workspaceField: string | null): Promise<WorkspaceTarget> {
  try {
    const selection: WorkspaceSelection = workspaceField ? JSON.parse(workspaceField) : null;
    const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
    return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw e;
    return { ownerUserId: actorUserId, ownerCompanyId: null };
  }
}

/**
 * Upload a source file. Dedupes by sha256 within the workspace: the same
 * bytes uploaded again to the same workspace return the existing row
 * (`deduped: true`) without re-writing R2.
 */
export async function uploadNleSource(actorUserId: string, input: UploadNleSourceInput) {
  const target = await resolveUploadTarget(actorUserId, input.workspaceField);
  const contentHash = await sha256Hex(input.bytes);
  const db = getDb();

  const existing = await findSourceByContentHash(db, target.ownerUserId, target.ownerCompanyId, contentHash);
  if (existing) return { source: existing, deduped: true };

  // The key embeds the workspace owner so audit / cleanup is straightforward.
  const url = await putToR2(
    `nle-sources/${target.ownerUserId}/${contentHash}`,
    input.bytes,
    input.contentType || "application/octet-stream",
    "source",
  );

  const source = await insertSource(db, {
    userId: target.ownerUserId,
    companyId: target.ownerCompanyId,
    kind: input.kind,
    contentHash,
    url,
    durationFrames: Math.round(input.durationFrames),
    fps: Math.round(input.fps),
    width: input.width,
    height: input.height,
    filename: input.filename,
  });
  return { source, deduped: false };
}

/**
 * Attach a downscaled proxy mp4 (#341): editor preview scrubs `proxyUrl`
 * while the render path keeps reading the master `url`. Returns the
 * patched row + tags so the client updates in one round-trip.
 */
export async function uploadNleSourceProxy(
  actorUserId: string,
  sourceId: string,
  file: { bytes: ArrayBuffer; contentType: string },
) {
  const { db, existing } = await loadWritableSource(actorUserId, sourceId);
  const proxyHash = await sha256Hex(file.bytes);
  const proxyUrl = await putToR2(
    `nle-proxies/${existing.userId}/${existing.id}-${proxyHash}.mp4`,
    file.bytes,
    file.contentType || "video/mp4",
    "proxy",
  );
  await updateSource(db, sourceId, { proxyUrl });
  return { source: await findSourceWithTags(db, sourceId) };
}

/**
 * Remove a source and its R2 master + proxy blobs. The caller ensures no
 * Timeline still references it (clips live inside jsonb, unenforced).
 */
export async function deleteNleSource(actorUserId: string, sourceId: string): Promise<{ id: string }> {
  const { db, existing } = await loadWritableSource(actorUserId, sourceId);
  await deleteSource(db, sourceId);
  await deleteR2Keys([r2KeyFromCdnUrl(existing.url), r2KeyFromCdnUrl(existing.proxyUrl)]);
  return { id: sourceId };
}
