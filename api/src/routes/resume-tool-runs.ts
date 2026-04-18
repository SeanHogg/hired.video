// resume-tool-runs.ts — Persist & retrieve the history of resume-input
// tool runs per resume (AI Resume Scorer, Resume Optimizer, Resume Tailor,
// etc.). All endpoints are owner-scoped: callers can only see / write runs
// against resumes they own.

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const resumeToolRunsRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// Owner-check helper — resumeInformation rows are the authoritative mapping
// between a resume and its owner. Anything mutating or reading a resume's
// tool-run history must go through this.
async function ownsResume(db: ReturnType<typeof getDb>, userId: string, resumeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.resumeInformation.id })
    .from(schema.resumeInformation)
    .where(and(
      eq(schema.resumeInformation.id, resumeId),
      eq(schema.resumeInformation.userId, userId),
    ))
    .limit(1);
  return rows.length > 0;
}

// ─── POST /api/resume-tool-runs ──────────────────────────────────────────────
// Record the outcome of a tool run against one of the caller's resumes.
resumeToolRunsRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const toolId = typeof body.toolId === "string" ? body.toolId : "";
  if (!resumeId || !toolId) {
    return c.json(error("VALIDATION_ERROR", "resumeId and toolId are required"), 400);
  }

  const db = getDb();
  if (!(await ownsResume(db, userId, resumeId))) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  const [run] = await db
    .insert(schema.resumeToolRuns)
    .values({
      userId,
      resumeId,
      toolId,
      // `score` is stored as numeric; Drizzle accepts string or number.
      score: typeof body.score === "number" ? String(body.score) : null,
      result: (body.result ?? {}) as Record<string, unknown>,
      jobDescription: typeof body.jobDescription === "string" ? body.jobDescription : null,
      summary: typeof body.summary === "string" ? body.summary : null,
    } as any)
    .returning();

  return c.json(success(run), 201);
});

// ─── GET /api/resume-tool-runs?resumeId=…&toolId=…&limit=… ──────────────────
// List runs for one of the caller's resumes. Optionally filter by toolId.
resumeToolRunsRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const resumeId = c.req.query("resumeId");
  if (!resumeId) return c.json(error("VALIDATION_ERROR", "resumeId is required"), 400);

  const toolId = c.req.query("toolId");
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const db = getDb();
  if (!(await ownsResume(db, userId, resumeId))) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  const rows = await db
    .select()
    .from(schema.resumeToolRuns)
    .where(and(
      eq(schema.resumeToolRuns.resumeId, resumeId),
      ...(toolId ? [eq(schema.resumeToolRuns.toolId, toolId)] : []),
    ))
    .orderBy(desc(schema.resumeToolRuns.createdAt))
    .limit(limit);

  return c.json(success(rows), 200);
});

// ─── GET /api/resume-tool-runs/:id ───────────────────────────────────────────
// Fetch a single run — used to re-open a historical result panel.
resumeToolRunsRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.resumeToolRuns)
    .where(and(
      eq(schema.resumeToolRuns.id, c.req.param("id")),
      eq(schema.resumeToolRuns.userId, userId),
    ))
    .limit(1);

  if (!run) return c.json(error("NOT_FOUND", "Tool run not found"), 404);
  return c.json(success(run), 200);
});

// ─── DELETE /api/resume-tool-runs/:id ───────────────────────────────────────
resumeToolRunsRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const result = await db
    .delete(schema.resumeToolRuns)
    .where(and(
      eq(schema.resumeToolRuns.id, c.req.param("id")),
      eq(schema.resumeToolRuns.userId, userId),
    ))
    .returning({ id: schema.resumeToolRuns.id });

  if (result.length === 0) return c.json(error("NOT_FOUND", "Tool run not found"), 404);
  return c.json(success({ id: result[0].id }), 200);
});
