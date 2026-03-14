import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types";
import { success, error } from "../types";
import { getDb, schema } from "../db";

const { resumes } = schema;

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateResumeSchema = z.object({
  title: z.string().min(1),
  content: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const UpdateResumeSchema = CreateResumeSchema.partial();

// ============================================================================
// ROUTES
// ============================================================================

export const resumeRoutes = new Hono<AppEnv>();

/** GET /api/resumes — list authenticated user's resumes */
resumeRoutes.get("/", async (c) => {
  const user = c.var.user;
  const db = getDb(c.env.DATABASE_URL);

  const userResumes = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, user.sub))
    .orderBy(resumes.updatedAt);

  return c.json(success(userResumes));
});

/** POST /api/resumes — create a new resume */
resumeRoutes.post("/", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
    })
    .returning();

  return c.json(success(resume), 201);
});

/** GET /api/resumes/:id — get a specific resume */
resumeRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!resume) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  return c.json(success(resume));
});

/** PUT /api/resumes/:id — update a resume */
resumeRoutes.put("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  const [updated] = await db
    .update(resumes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(resumes.id, id))
    .returning();

  return c.json(success(updated));
});

/** DELETE /api/resumes/:id — delete a resume */
resumeRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  await db.delete(resumes).where(eq(resumes.id, id));

  return c.json(success(null, "Resume deleted"));
});

/** POST /api/resumes/:id/clone — duplicate a resume */
resumeRoutes.post("/:id/clone", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [original] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!original) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  const [cloned] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: `${original.title} (copy)`,
      content: original.content ?? {},
      status: "draft",
    })
    .returning();

  return c.json(success(cloned), 201);
});

/** POST /api/resumes/:id/publish — set resume status to published */
resumeRoutes.post("/:id/publish", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Resume not found"), 404);
  }

  const [updated] = await db
    .update(resumes)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(resumes.id, id))
    .returning();

  return c.json(success(updated));
});
