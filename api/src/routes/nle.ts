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
import { and, desc, eq } from "drizzle-orm";
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
import { TIMELINE_SCHEMA_VERSION } from "../../../shared/timeline.js";

const { studioProjects } = schema;

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

  const initialTimeline =
    parsed.data.timelineSpec ?? {
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      fps,
      width,
      height,
      backgroundColor: "#000000",
      tracks: [],
      markers: [],
    };

  const db = getDb();
  const [created] = await db
    .insert(studioProjects)
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
    })
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
    accessible,
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
    accessible,
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

  const patch: Partial<typeof studioProjects.$inferInsert> = {
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
