// Workspace taxonomy endpoints (Tags / Job Types / Sources — gaps
// #231, #232, #238). One router covers all three because they share
// the same read+write shape and admin pages render them as a single
// settings surface.
//
// All endpoints require an authenticated user. Workspace scoping is
// inferred from the user's active workspace context downstream; for v1
// the workspace_id column on the rows is left null and reads return
// every row (single-tenant-per-user model). Multi-tenant scoping ships
// in the workspace-aware follow-up.

import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { workspaceTags, tagAssignments, workspaceJobTypes, workspaceSources } = schema;

export const taxonomyRoutes = new Hono<AppEnv>();

function viewerId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const TAG_AXES = ["company", "job", "person"] as const;
type TagAxis = (typeof TAG_AXES)[number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// ── Tags ──────────────────────────────────────────────────────────────
const CreateTagSchema = z.object({
  axis: z.enum(TAG_AXES),
  name: z.string().trim().min(1).max(64),
  colorHex: z.string().regex(HEX_COLOR).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

taxonomyRoutes.get("/tags", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const axisParam = c.req.query("axis");
  const axis = TAG_AXES.includes(axisParam as TagAxis) ? (axisParam as TagAxis) : null;
  const db = getDb();
  const baseQuery = db.select().from(workspaceTags);
  const rows = await (axis
    ? baseQuery.where(eq(workspaceTags.axis, axis))
    : baseQuery
  ).orderBy(asc(workspaceTags.axis), asc(workspaceTags.orderIndex), asc(workspaceTags.name));
  return c.json(success({ tags: rows }), 200);
});

taxonomyRoutes.post("/tags", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateTagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid tag", parsed.error.flatten()), 400);
  }
  const db = getDb();
  const [row] = await db
    .insert(workspaceTags)
    .values({
      axis: parsed.data.axis,
      name: parsed.data.name,
      colorHex: parsed.data.colorHex ?? "#94a3b8",
      orderIndex: parsed.data.orderIndex ?? 0,
      isBuiltIn: false,
    })
    .returning();
  return c.json(success({ tag: row }), 201);
});

// Assign / unassign tag → entity.
const AssignSchema = z.object({
  tagId: z.string().uuid(),
  axis: z.enum(TAG_AXES),
  entityId: z.string().uuid(),
});

taxonomyRoutes.post("/tags/assign", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid assignment", parsed.error.flatten()), 400);
  }
  const db = getDb();
  await db
    .insert(tagAssignments)
    .values({ tagId: parsed.data.tagId, axis: parsed.data.axis, entityId: parsed.data.entityId })
    .onConflictDoNothing();
  return c.json(success({}), 200);
});

taxonomyRoutes.post("/tags/unassign", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid assignment", parsed.error.flatten()), 400);
  }
  const db = getDb();
  await db
    .delete(tagAssignments)
    .where(
      and(
        eq(tagAssignments.tagId, parsed.data.tagId),
        eq(tagAssignments.entityId, parsed.data.entityId),
      ),
    );
  return c.json(success({}), 200);
});

// ── Job Types ─────────────────────────────────────────────────────────
taxonomyRoutes.get("/job-types", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceJobTypes)
    .orderBy(asc(workspaceJobTypes.orderIndex), asc(workspaceJobTypes.label));
  return c.json(success({ jobTypes: rows }), 200);
});

// ── #237 — Built-in delete guard middleware ───────────────────────────
// Cross-cutting: every taxonomy row carrying `is_built_in = true` is
// owned by the platform (seeded via migration) and MUST NOT be deletable
// by any caller. The frontend hides the Delete affordance on built-ins;
// this is the backend backstop so a curl against the public DELETE
// endpoint still 409s with a clear reason. Applied to every taxonomy
// table that carries the flag — workspace_tags (#231), workspace_job_types
// (#232), workspace_sources (#238), and any future taxonomy that ships
// built-ins.
//
// Returns null on success or a 409 Hono Response on denial. Call sites:
//   const denied = await assertNotBuiltIn(c, workspaceTags, id);
//   if (denied) return denied;
async function assertNotBuiltIn(
  c: any,
  table: typeof workspaceTags | typeof workspaceJobTypes | typeof workspaceSources,
  rowId: string,
): Promise<Response | null> {
  const db = getDb();
  const [row] = await db
    .select({ isBuiltIn: (table as any).isBuiltIn })
    .from(table)
    .where(eq((table as any).id, rowId))
    .limit(1);
  if (!row) {
    return c.json(error("NOT_FOUND", "Taxonomy row not found"), 404);
  }
  if (row.isBuiltIn) {
    return c.json(
      error(
        "BUILT_IN_LOCKED",
        "This row was seeded by the platform and can't be deleted. Hide it by setting orderIndex out of view if you don't want to use it.",
      ),
      409,
    );
  }
  return null;
}

taxonomyRoutes.delete("/tags/:id", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const denied = await assertNotBuiltIn(c, workspaceTags, id);
  if (denied) return denied;
  const db = getDb();
  await db.delete(workspaceTags).where(eq(workspaceTags.id, id));
  return c.json(success({}), 200);
});

taxonomyRoutes.delete("/job-types/:id", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const denied = await assertNotBuiltIn(c, workspaceJobTypes, id);
  if (denied) return denied;
  const db = getDb();
  await db.delete(workspaceJobTypes).where(eq(workspaceJobTypes.id, id));
  return c.json(success({}), 200);
});

taxonomyRoutes.delete("/sources/:id", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const denied = await assertNotBuiltIn(c, workspaceSources, id);
  if (denied) return denied;
  const db = getDb();
  await db.delete(workspaceSources).where(eq(workspaceSources.id, id));
  return c.json(success({}), 200);
});

// ── Sources ───────────────────────────────────────────────────────────
taxonomyRoutes.get("/sources", async (c) => {
  if (!viewerId(c)) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceSources)
    .orderBy(asc(workspaceSources.orderIndex), asc(workspaceSources.label));
  return c.json(success({ sources: rows }), 200);
});

