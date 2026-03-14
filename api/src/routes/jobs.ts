import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types";
import { success, error } from "../types";
import { getDb, schema } from "../db";

const { jobs } = schema;

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  company: z.string().min(1),
  location: z.string().default(""),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
});

const UpdateJobSchema = CreateJobSchema.partial();

// ============================================================================
// ROUTES
// ============================================================================

export const jobRoutes = new Hono<AppEnv>();

/** GET /api/jobs — list authenticated user's jobs */
jobRoutes.get("/", async (c) => {
  const user = c.var.user;
  const db = getDb(c.env.DATABASE_URL);

  const userJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, user.sub))
    .orderBy(jobs.updatedAt);

  return c.json(success(userJobs));
});

/** POST /api/jobs — create a new job */
jobRoutes.post("/", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  const [job] = await db
    .insert(jobs)
    .values({ userId: user.sub, ...parsed.data })
    .returning();

  return c.json(success(job), 201);
});

/** GET /api/jobs/:id — get a specific job */
jobRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.sub)))
    .limit(1);

  if (!job) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  return c.json(success(job));
});

/** PUT /api/jobs/:id — update a job */
jobRoutes.put("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  const [updated] = await db
    .update(jobs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();

  return c.json(success(updated));
});

/** DELETE /api/jobs/:id — delete a job */
jobRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  await db.delete(jobs).where(eq(jobs.id, id));

  return c.json(success(null, "Job deleted"));
});
