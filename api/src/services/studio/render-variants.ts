/**
 * Fitted cuts of a Studio project's master render (#2045) — the use cases
 * behind GET/POST /api/studio/projects/:projectId/render-variants/:variantKey.
 *
 *   getRenderVariant      the cut for (project, key, content revision), or
 *                         null — a cached read (getOrSetCached, one key per
 *                         identity, invalidated on every write), so the Post
 *                         dock asks before it renders and never re-renders
 *                         a cut that exists
 *   storeRenderVariant    host a cut the browser rendered: ONE R2 object + a
 *                         private `videos` row (never the project's video_id,
 *                         so the master and the public pages are untouched)
 *                         + the variant row. Deduped: an existing cut is
 *                         returned without storing; a racing writer that
 *                         loses the unique index drops its own copy. Cuts of
 *                         earlier content revisions under the same key are
 *                         reclaimed (row + file) once the new one lands.
 *   resolvePostedVariant  the publish paths' check that a cut belongs to the
 *                         project being posted (Lane B) / is still current
 *
 * Encoding never happens here (Workers Free): the browser renders the cut.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { isVariantOfMaster, parseVariantKey } from "../../../../shared/publish-presets.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { cdnUrl } from "../../utils/cdn.js";
import { putObject } from "../storage/object-store.js";
import { deleteR2Keys } from "../storage/r2-delete.js";
import { assertCanWrite } from "./workspace.js";
import * as repo from "../../repositories/renderVariantRepository.js";
import { DomainError } from "../../domains/errors.js";

type Db = ReturnType<typeof getDb>;

/** A content revision: the master's timeline hash (+ branding), from the client. */
const REVISION_RE = /^[A-Za-z0-9._-]{1,64}$/;
const TTL_SECONDS = 600;

export type RenderVariantErrorKind = "PROJECT_NOT_FOUND" | "INVALID_VARIANT" | "STORAGE_UNAVAILABLE";

const RENDER_VARIANT_ERROR_STATUS: Record<RenderVariantErrorKind, 400 | 404 | 503> = {
  PROJECT_NOT_FOUND: 404,
  INVALID_VARIANT: 400,
  STORAGE_UNAVAILABLE: 503,
};

export class RenderVariantError extends DomainError {
  constructor(
    public readonly kind: RenderVariantErrorKind,
    message: string,
  ) {
    super(RENDER_VARIANT_ERROR_STATUS[kind], kind, message);
    this.name = "RenderVariantError";
  }
}

/** What the Post dock gets back: the cut's id and file. */
export interface RenderVariantDto {
  variantId: string;
  variantKey: string;
  contentRevision: string;
  videoId: string;
  videoUrl: string | null;
}

export interface RenderVariantDeps {
  db?: Db;
  put?: typeof putObject;
  deleteKeys?: typeof deleteR2Keys;
  /** Write check (canActFor SSoT) — injectable for tests. */
  assertWrite?: typeof assertCanWrite;
}

function cacheKey(id: repo.VariantIdentity): string {
  return `studio:variant:${id.projectId}:${id.variantKey}:${id.contentRevision}`;
}

function toDto(row: repo.RenderVariant): RenderVariantDto {
  return {
    variantId: row.id,
    variantKey: row.variantKey,
    contentRevision: row.contentRevision,
    videoId: row.videoId,
    videoUrl: row.r2Key ? cdnUrl(row.r2Key) : null,
  };
}

function validIdentity(projectId: string, variantKey: string, contentRevision: string): repo.VariantIdentity {
  if (!parseVariantKey(variantKey) || !REVISION_RE.test(contentRevision)) {
    throw new RenderVariantError("INVALID_VARIANT", "Unknown cut or content revision.");
  }
  return { projectId, variantKey, contentRevision };
}

/** The project's owner scope, after checking the actor may post it. */
async function loadWritableProject(db: Db, actorUserId: string, projectId: string, deps: RenderVariantDeps) {
  const { studioProjects } = schema;
  const [project] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) throw new RenderVariantError("PROJECT_NOT_FOUND", "Project not found");
  await (deps.assertWrite ?? assertCanWrite)(actorUserId, project.userId, project.companyId ?? null, { db });
  return project;
}

export async function getRenderVariant(
  args: { actorUserId: string; projectId: string; variantKey: string; contentRevision: string },
  deps: RenderVariantDeps = {},
): Promise<RenderVariantDto | null> {
  const db = deps.db ?? getDb();
  const id = validIdentity(args.projectId, args.variantKey, args.contentRevision);
  await loadWritableProject(db, args.actorUserId, args.projectId, deps);
  return getOrSetCached<RenderVariantDto | null>({
    key: cacheKey(id),
    ttlSeconds: TTL_SECONDS,
    loader: async () => {
      const row = await repo.findVariant(db, id);
      return row ? toDto(row) : null;
    },
  });
}

export async function storeRenderVariant(
  args: {
    actorUserId: string;
    projectId: string;
    variantKey: string;
    contentRevision: string;
    bytes: ArrayBuffer;
    contentType: string;
    /** The cut carries the hired.video watermark (promotion requires it). */
    branded: boolean;
    title: string;
  },
  deps: RenderVariantDeps = {},
): Promise<RenderVariantDto> {
  const db = deps.db ?? getDb();
  const id = validIdentity(args.projectId, args.variantKey, args.contentRevision);
  const project = await loadWritableProject(db, args.actorUserId, args.projectId, deps);

  const existing = await repo.findVariant(db, id);
  if (existing) return toDto(existing);

  const r2Key = `studio/${args.actorUserId}/${project.id}/variants/${args.variantKey}-${Date.now()}.mp4`;
  const stored = await (deps.put ?? putObject)(r2Key, args.bytes, args.contentType || "video/mp4", {
    userId: args.actorUserId,
    projectId: project.id,
    variantKey: args.variantKey,
  });
  if (!stored) throw new RenderVariantError("STORAGE_UNAVAILABLE", "No storage configured. Cannot save video file.");

  const { videos } = schema;
  // Private: a cut is a delivery file, never listed on a profile or feed.
  const [video] = await db
    .insert(videos)
    .values({
      userId: project.userId,
      companyId: project.companyId,
      status: "completed",
      r2Key,
      branded: args.branded,
      title: args.title,
      privacyStatus: "private",
      showOnHome: false,
    })
    .returning({ id: videos.id });

  const created = await repo.insertVariant(db, { ...id, videoId: video.id });
  if (!created) {
    // Lost a race to another writer of the same cut: keep theirs, drop ours.
    await db.delete(videos).where(eq(videos.id, video.id));
    await (deps.deleteKeys ?? deleteR2Keys)([r2Key]);
    const winner = await repo.findVariant(db, id);
    if (!winner) throw new RenderVariantError("INVALID_VARIANT", "The cut could not be saved.");
    return toDto(winner);
  }
  invalidateCachedKey(cacheKey(id));
  await reclaimSuperseded(db, id, deps);
  return toDto({ id: created.id, ...id, videoId: video.id, r2Key, branded: args.branded });
}

/** Drop this key's cuts of earlier revisions (the video row cascades to the
 *  variant row; publications that posted one keep their link, unlinked). */
async function reclaimSuperseded(db: Db, keep: repo.VariantIdentity, deps: RenderVariantDeps): Promise<void> {
  const stale = await repo.listSupersededVariants(db, keep);
  if (stale.length === 0) return;
  const { videos } = schema;
  for (const s of stale) {
    await db.delete(videos).where(eq(videos.id, s.videoId));
    invalidateCachedKey(cacheKey({ ...keep, contentRevision: s.contentRevision }));
  }
  await (deps.deleteKeys ?? deleteR2Keys)(stale.map((s) => s.r2Key));
}

/** The cut `videoId` names — only when it is a cut of `projectId` (else null). */
export function resolvePostedVariant(
  db: Db,
  args: { projectId: string; videoId: string },
): Promise<repo.RenderVariant | null> {
  return repo.findVariantByVideo(db, args);
}

/**
 * At send time (a promotion approved later, a scheduled post): the queued
 * cut's file while it still shows what the master shows; null after a
 * re-render changed the master, or once the cut was reclaimed — the caller
 * posts the master then. `masterHash` is the master render's baked hash
 * (`studio_projects.baked_hash`, mirrored from `state._meta.bakedHash`).
 */
export async function currentCutVideoId(
  db: Db,
  variantId: string | null,
  masterHash: string | null,
): Promise<string | null> {
  if (!variantId) return null;
  const cut = await repo.findVariantById(db, variantId);
  return cut && isVariantOfMaster(cut.contentRevision, masterHash) ? cut.videoId : null;
}
