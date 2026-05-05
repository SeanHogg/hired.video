/**
 * NLE (power-user video editor) API routes.
 *
 * Lives at `/api/nle/*`. Mirrors the ownership model from
 * routes/studio.ts — every mutation flows through assertCanWrite() and
 * resolveWorkspaceForWrite() in services/studio/workspace.ts. NLE
 * projects share the studio_projects table (kind='nle' discriminator)
 * with the existing scene-based editor; that's why this file lives
 * alongside studio.ts rather than inside it (keeping each route file
 * small enough to actually navigate, per the project's SOLID norms).
 *
 * The Timeline JSON contract lives in shared/timeline.ts. This file is
 * intentionally thin: it just persists the JSON the editor sends. Schema
 * validation of the Timeline shape itself happens client-side; server
 * trusts the JSON-blob shape but still re-checks ownership.
 */

import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  assertCanWrite,
  buildOwnershipFilter,
  listAccessibleWorkspaces,
  resolveWorkspaceForWrite,
  WorkspaceForbiddenError,
  type WorkspaceSelection,
} from "../services/studio/workspace.js";
import { emptyTimeline } from "../../../shared/timeline.js";
import { cdnUrl } from "../utils/cdn.js";

const { studioProjects, nleMediaSources, nleMediaTags } = schema;

/**
 * Hash a buffer with sha-256 and return a hex digest. Used to dedupe
 * source uploads — a re-upload of the same bytes by the same workspace
 * owner returns the existing nle_media_sources row instead of writing
 * new R2 bytes. Single source of truth; both POST /sources and any
 * future bulk-import path go through this.
 */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** R2 bucket binding lookup — same pattern as routes/studio.ts. */
function getR2Bucket(): R2Bucket | undefined {
  return (globalThis as { __ENV?: { VIDEO_BUCKET?: R2Bucket } }).__ENV?.VIDEO_BUCKET;
}

/**
 * Persist source bytes to R2 and return the resulting CDN URL. Reused
 * by every entrypoint that creates an `nle_media_sources` row — POST
 * /sources today, any future bulk-import path tomorrow. The R2 key
 * embeds the workspace owner so audit / cleanup is straightforward.
 */
async function uploadSourceToR2(
  ownerUserId: string,
  contentHash: string,
  contentType: string,
  bytes: ArrayBuffer,
): Promise<string> {
  const bucket = getR2Bucket();
  const key = `nle-sources/${ownerUserId}/${contentHash}`;
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
  } else {
    // Local dev: warn and return a fake URL so the row still inserts.
    console.warn("[nle] R2 binding missing; source not persisted:", key);
  }
  return cdnUrl(key);
}

// ---------------------------------------------------------------------------
// Local response helpers — same shape as routes/studio.ts so clients see a
// consistent envelope. Inlined rather than shared because the existing
// studio.ts also inlines them; flagging consolidation as a separate
// cleanup task rather than expanding scope here.
// ---------------------------------------------------------------------------

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Workspace body parsing — identical pattern to routes/studio.ts. The
// validation lives in resolveWorkspaceForWrite; this just adapts the
// request body.
// ---------------------------------------------------------------------------

const WorkspaceFieldSchema = z
  .union([
    z.object({ kind: z.literal("personal") }),
    z.object({ kind: z.literal("company"), companyId: z.string().uuid() }),
    z.object({ kind: z.literal("delegated"), subjectUserId: z.string().uuid() }),
  ])
  .optional()
  .nullable();

async function resolveWorkspaceFromBody(
  actorUserId: string,
  body: unknown,
): Promise<{ ownerUserId: string; ownerCompanyId: string | null }> {
  const selection: WorkspaceSelection =
    (body && typeof body === "object" && (body as { workspace?: WorkspaceSelection }).workspace) || null;
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
  return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const nleRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200).default("Untitled film"),
  workspace: WorkspaceFieldSchema,
  /** Optional initial Timeline (e.g. cloned from a template). When omitted,
   *  the project is created with a blank Timeline. */
  timelineSpec: z.unknown().optional(),
  /** Defaults match the spec defaults in shared/timeline.ts emptyTimeline(). */
  fps: z.number().int().min(1).max(120).default(30),
  width: z.number().int().min(16).max(7680).default(1920),
  height: z.number().int().min(16).max(4320).default(1080),
});

/**
 * POST /api/nle/projects — create a new NLE project. The Timeline payload
 * is either supplied (cloning) or generated as an empty Timeline server-
 * side using the schema-version constant from shared/timeline.ts so the
 * server and client never disagree about the on-disk version.
 */
nleRoutes.post("/projects", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const { title, fps, width, height } = parsed.data;

  let target;
  try {
    target = await resolveWorkspaceFromBody(user.sub, body);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  // Use the shared default-Timeline builder so server and client agree
  // on what a fresh NLE project looks like (default tracks, schema
  // version, background). See shared/timeline.ts emptyTimeline().
  const initialTimeline =
    parsed.data.timelineSpec ?? emptyTimeline({ fps, width, height });

  const db = getDb();
  const [created] = await db
    .insert(studioProjects)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values({
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      kind: "nle",
      // The legacy scene-based editor requires resumeText; for NLE the
      // field is unused but NOT NULL, so we store the user-facing title
      // there and let toProjectDto pull it back out. Once the migration
      // to nullable resumeText lands, remove this and stop dual-storing.
      resumeText: title,
      timelineSpec: initialTimeline,
      status: "draft",
    } as any)
    .returning();

  return c.json(
    ok({
      id: created.id,
      title,
      kind: "nle",
      timelineSpec: initialTimeline,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }),
  );
});

/**
 * GET /api/nle/projects — list NLE projects accessible to the caller's
 * workspaces. Returns the metadata shape the dashboard needs (no
 * Timeline payload, that's loaded lazily by GET /:id).
 */
nleRoutes.get("/projects", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const accessible = await listAccessibleWorkspaces(user.sub);
  const ownership = buildOwnershipFilter({
    userIdColumn: studioProjects.userId,
    companyIdColumn: studioProjects.companyId,
    actorUserId: user.sub,
    ...accessible,
  });

  const rows = await db
    .select({
      id: studioProjects.id,
      title: studioProjects.resumeText,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      status: studioProjects.status,
      videoId: studioProjects.videoId,
      updatedAt: studioProjects.updatedAt,
      createdAt: studioProjects.createdAt,
    })
    .from(studioProjects)
    .where(and(eq(studioProjects.kind, "nle"), ownership))
    .orderBy(desc(studioProjects.updatedAt))
    .limit(200);

  return c.json(ok({ projects: rows }));
});

/**
 * GET /api/nle/projects/:id — load the full Timeline JSON for one
 * project. Auth is by ownership read filter; a row that doesn't match
 * returns 404 rather than 403 to avoid leaking existence.
 */
nleRoutes.get("/projects/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const db = getDb();
  const accessible = await listAccessibleWorkspaces(user.sub);
  const ownership = buildOwnershipFilter({
    userIdColumn: studioProjects.userId,
    companyIdColumn: studioProjects.companyId,
    actorUserId: user.sub,
    ...accessible,
  });

  const [row] = await db
    .select({
      id: studioProjects.id,
      title: studioProjects.resumeText,
      kind: studioProjects.kind,
      timelineSpec: studioProjects.timelineSpec,
      status: studioProjects.status,
      videoId: studioProjects.videoId,
      updatedAt: studioProjects.updatedAt,
      createdAt: studioProjects.createdAt,
    })
    .from(studioProjects)
    .where(and(eq(studioProjects.id, id), ownership))
    .limit(1);

  if (!row || row.kind !== "nle") {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  return c.json(ok(row));
});

const SaveTimelineSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  /** Caller is trusted to send a valid Timeline (per shared/timeline.ts).
   *  Server stores it verbatim. Schema validation of the Timeline lives
   *  client-side via the editor's own zod parsers. */
  timelineSpec: z.record(z.string(), z.unknown()),
  workspace: WorkspaceFieldSchema,
});

/**
 * PATCH /api/nle/projects/:id — save the Timeline. Same workspace-aware
 * write check the rest of the studio uses.
 */
nleRoutes.patch("/projects/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = SaveTimelineSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select({
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      kind: studioProjects.kind,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, id))
    .limit(1);

  if (!existing) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  if (existing.kind !== "nle") {
    return c.json(fail("WRONG_KIND", "This project is not an NLE project"), 400);
  }

  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    timelineSpec: parsed.data.timelineSpec,
    userId: user.sub, // record the actual editor for attribution
  };
  if (parsed.data.title !== undefined) patch.resumeText = parsed.data.title;

  const [updated] = await db
    .update(studioProjects)
    .set(patch)
    .where(eq(studioProjects.id, id))
    .returning();

  return c.json(
    ok({
      id: updated.id,
      title: updated.resumeText,
      timelineSpec: updated.timelineSpec,
      updatedAt: updated.updatedAt,
    }),
  );
});

// ---------------------------------------------------------------------------
// Sources — uploaded media referenced by Timeline.tracks[].clips[].sourceId.
// ---------------------------------------------------------------------------

/**
 * GET /api/nle/sources — list every source the caller's workspaces own.
 * The frontend hydrates the BinPanel from this so sources survive page
 * refresh. Each row is enriched with its tags array (empty when none)
 * so the bin's facet filter doesn't need a second round-trip per row.
 */
nleRoutes.get("/sources", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const accessible = await listAccessibleWorkspaces(user.sub);
  const ownership = buildOwnershipFilter({
    userIdColumn: nleMediaSources.userId,
    companyIdColumn: nleMediaSources.companyId,
    actorUserId: user.sub,
    ...accessible,
  });

  const rows = await db
    .select()
    .from(nleMediaSources)
    .where(ownership)
    .orderBy(desc(nleMediaSources.uploadedAt))
    .limit(500);

  // One round-trip for tags — N+1 is the failure mode this avoids.
  // Empty source list short-circuits the IN(...) which Postgres rejects.
  const tagRows = rows.length
    ? await db
        .select()
        .from(nleMediaTags)
        .where(inArray(nleMediaTags.sourceId, rows.map((r) => r.id)))
    : [];
  const tagsBySource = new Map<string, string[]>();
  for (const t of tagRows) {
    const arr = tagsBySource.get(t.sourceId);
    if (arr) arr.push(t.tag);
    else tagsBySource.set(t.sourceId, [t.tag]);
  }
  const enriched = rows.map((r) => ({ ...r, tags: tagsBySource.get(r.id) ?? [] }));

  return c.json(ok({ sources: enriched }));
});

/**
 * GET /api/nle/sources/tags — distinct tag list across the caller's
 * workspaces. Powers the bin's facet picker.
 */
nleRoutes.get("/sources/tags", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const accessible = await listAccessibleWorkspaces(user.sub);
  const ownership = buildOwnershipFilter({
    userIdColumn: nleMediaSources.userId,
    companyIdColumn: nleMediaSources.companyId,
    actorUserId: user.sub,
    ...accessible,
  });
  const rows = await db
    .selectDistinct({ tag: nleMediaTags.tag })
    .from(nleMediaTags)
    .innerJoin(nleMediaSources, eq(nleMediaTags.sourceId, nleMediaSources.id))
    .where(ownership)
    .orderBy(nleMediaTags.tag);
  return c.json(ok({ tags: rows.map((r) => r.tag) }));
});

/**
 * PATCH /api/nle/sources/:id — update bin metadata (folder, tags) or
 * relink the underlying URL when the original R2 object went stale
 * (closes #346). Tag list, when supplied, is replaced atomically — the
 * server owns the canonical state so the editor doesn't have to manage
 * add-vs-remove deltas.
 */
const PatchSourceSchema = z.object({
  binFolder: z.string().min(1).max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).max(64).optional(),
  /** Replaces `url` when set. Used by the relink-offline-media flow
   *  when the original R2 object is missing. */
  url: z.string().url().optional(),
  filename: z.string().min(1).max(500).optional(),
});

nleRoutes.patch("/sources/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSourceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(nleMediaSources)
    .where(eq(nleMediaSources.id, id))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Source not found"), 404);
  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (parsed.data.binFolder !== undefined) patch.binFolder = parsed.data.binFolder;
  if (parsed.data.url !== undefined) patch.url = parsed.data.url;
  if (parsed.data.filename !== undefined) patch.filename = parsed.data.filename;

  if (Object.keys(patch).length > 0) {
    await db.update(nleMediaSources).set(patch).where(eq(nleMediaSources.id, id));
  }

  if (parsed.data.tags) {
    // Replace the tag set atomically. Distinct + trim so duplicates
    // and whitespace-only entries don't smuggle through the body.
    const cleaned = Array.from(
      new Set(
        parsed.data.tags
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      ),
    );
    await db.delete(nleMediaTags).where(eq(nleMediaTags.sourceId, id));
    if (cleaned.length > 0) {
      await db
        .insert(nleMediaTags)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(cleaned.map((tag) => ({ sourceId: id, tag })) as any);
    }
  }

  // Return fresh row + tag list so callers can update local state in one shot.
  const [updated] = await db
    .select()
    .from(nleMediaSources)
    .where(eq(nleMediaSources.id, id))
    .limit(1);
  const tagRows = await db
    .select({ tag: nleMediaTags.tag })
    .from(nleMediaTags)
    .where(eq(nleMediaTags.sourceId, id));
  return c.json(ok({ source: { ...updated, tags: tagRows.map((t) => t.tag) } }));
});

/**
 * POST /api/nle/sources — multipart upload of a source file. Body:
 *   - file:           the binary
 *   - kind:           video|audio|image
 *   - durationFrames: from client probe (we don't have ffprobe here)
 *   - fps / width / height: optional, from client probe
 *   - workspace:      JSON-stringified workspace selector (optional)
 *
 * Dedupes by sha256(content_hash) within the workspace owner. Returns
 * the canonical MediaSource row the editor should reference by id.
 */
nleRoutes.post("/sources", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Multipart body required"), 400);

  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "");
  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing file"), 400);
  }
  if (!["video", "audio", "image"].includes(kind)) {
    return c.json(fail("VALIDATION_ERROR", "Invalid kind"), 400);
  }

  const durationFrames = Number(form.get("durationFrames") ?? 0);
  const fps = Number(form.get("fps") ?? 30);
  const widthRaw = form.get("width");
  const heightRaw = form.get("height");
  const width = widthRaw ? Number(widthRaw) : null;
  const height = heightRaw ? Number(heightRaw) : null;
  if (!Number.isFinite(durationFrames) || durationFrames <= 0) {
    return c.json(fail("VALIDATION_ERROR", "Invalid durationFrames"), 400);
  }

  const workspaceField = (form.get("workspace") as string | null) ?? null;
  let target;
  try {
    const parsedSelection: WorkspaceSelection = workspaceField ? JSON.parse(workspaceField) : null;
    target = await resolveWorkspaceForWrite(user.sub, parsedSelection);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    target = { ownerUserId: user.sub, ownerCompanyId: null };
  }

  const bytes = await file.arrayBuffer();
  const contentHash = await sha256Hex(bytes);
  const db = getDb();

  // Dedup: same (workspace owner, content_hash) returns the existing row.
  const ownerCompanyForCmp = target.ownerCompanyId ?? "00000000-0000-0000-0000-000000000000";
  const [existing] = await db
    .select()
    .from(nleMediaSources)
    .where(
      and(
        eq(nleMediaSources.userId, target.ownerUserId),
        eq(nleMediaSources.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (
    existing &&
    (existing.companyId ?? "00000000-0000-0000-0000-000000000000") === ownerCompanyForCmp
  ) {
    return c.json(ok({ source: existing, deduped: true }));
  }

  const url = await uploadSourceToR2(
    target.ownerUserId,
    contentHash,
    file.type || "application/octet-stream",
    bytes,
  );

  const [inserted] = await db
    .insert(nleMediaSources)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values({
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      kind,
      contentHash,
      url,
      durationFrames: Math.round(durationFrames),
      fps: Math.round(fps),
      width,
      height,
      filename: file.name,
    } as any)
    .returning();

  return c.json(ok({ source: inserted, deduped: false }));
});

/**
 * POST /api/nle/sources/:id/proxy — upload a downscaled proxy mp4 for
 * a source. Closes #341's plumbing: the editor preview path can now
 * point at `proxyUrl` for fast scrubbing while the render path keeps
 * reading `url` (the master). Caller produces the proxy bytes via
 * `frontend/lib/timeline/proxy-generator.ts`.
 *
 * Multipart body: `file` = the proxy mp4. Returns the patched source
 * row so the client updates state in one round-trip.
 */
nleRoutes.post("/sources/:id/proxy", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Multipart body required"), 400);
  const file = form.get("file") as File | null;
  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing proxy file"), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(nleMediaSources)
    .where(eq(nleMediaSources.id, id))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Source not found"), 404);
  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  const bytes = await file.arrayBuffer();
  const proxyHash = await sha256Hex(bytes);
  const bucket = getR2Bucket();
  const key = `nle-proxies/${existing.userId}/${existing.id}-${proxyHash}.mp4`;
  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: file.type || "video/mp4" },
    });
  } else {
    console.warn("[nle] R2 binding missing; proxy not persisted:", key);
  }
  const proxyUrl = cdnUrl(key);

  await db
    .update(nleMediaSources)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ proxyUrl } as any)
    .where(eq(nleMediaSources.id, id));

  const [updated] = await db
    .select()
    .from(nleMediaSources)
    .where(eq(nleMediaSources.id, id))
    .limit(1);
  const tagRows = await db
    .select({ tag: nleMediaTags.tag })
    .from(nleMediaTags)
    .where(eq(nleMediaTags.sourceId, id));
  return c.json(ok({ source: { ...updated, tags: tagRows.map((t) => t.tag) } }));
});

/**
 * DELETE /api/nle/sources/:id — remove a source the caller owns. Caller
 * is responsible for ensuring no Timeline still references it; the DB
 * layer doesn't enforce that for us (clips are inside jsonb).
 */
nleRoutes.delete("/sources/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select({ userId: nleMediaSources.userId, companyId: nleMediaSources.companyId })
    .from(nleMediaSources)
    .where(eq(nleMediaSources.id, id))
    .limit(1);

  if (!existing) return c.json(fail("NOT_FOUND", "Source not found"), 404);
  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  await db.delete(nleMediaSources).where(eq(nleMediaSources.id, id));
  return c.json(ok({ id }));
});

/**
 * DELETE /api/nle/projects/:id — same auth path as the studio.ts delete.
 * Cascade is handled by FK; we just write the auth check.
 */
nleRoutes.delete("/projects/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select({
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      kind: studioProjects.kind,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, id))
    .limit(1);

  if (!existing) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  if (existing.kind !== "nle") {
    return c.json(fail("WRONG_KIND", "Use /api/studio/projects/:id for non-NLE projects"), 400);
  }

  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) {
      return c.json(fail("FORBIDDEN", e.message), 403);
    }
    throw e;
  }

  await db.delete(studioProjects).where(eq(studioProjects.id, id));
  return c.json(ok({ id }));
});
