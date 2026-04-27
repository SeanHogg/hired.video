import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";

export const performanceRoutes = new Hono<{ Variables: Variables }>();

const CreateCycleSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["quarterly", "annual", "mid-year", "probationary"]).default("quarterly"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const CreateReviewSchema = z.object({
  cycleId: z.string().uuid(),
  revieweeUserId: z.string().uuid(),
  overallRating: z.number().min(1).max(5).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.array(z.object({ goal: z.string(), status: z.string(), notes: z.string().optional() })).optional(),
  ratings: z.record(z.string(), z.number()).optional(),
  reviewerNotes: z.string().optional(),
});

const CreateGoalSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(["professional", "personal", "team"]).default("professional"),
  targetDate: z.string().datetime().optional(),
  cycleId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Performance Cycles
// ---------------------------------------------------------------------------

// GET /api/performance/cycles
performanceRoutes.get("/cycles", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const cycles = await db
    .select()
    .from(schema.performanceCycles)
    .where(eq(schema.performanceCycles.createdByUserId, userId))
    .orderBy(desc(schema.performanceCycles.createdAt));

  return c.json(success(cycles), 200);
});

// POST /api/performance/cycles
performanceRoutes.post("/cycles", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateCycleSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [cycle] = await db
    .insert(schema.performanceCycles)
    .values({
      createdByUserId: userId,
      name: parsed.data.name,
      type: parsed.data.type,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      status: "active",
    } as any)
    .returning();

  return c.json(success(cycle), 201);
});

// GET /api/performance/cycles/:id
performanceRoutes.get("/cycles/:id", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [cycle] = await db
    .select()
    .from(schema.performanceCycles)
    .where(and(eq(schema.performanceCycles.id, c.req.param("id")), eq(schema.performanceCycles.createdByUserId, userId)))
    .limit(1);

  if (!cycle) return c.json(error("NOT_FOUND", "Cycle not found"), 404);

  const reviews = await db
    .select()
    .from(schema.performanceReviews)
    .where(eq(schema.performanceReviews.cycleId, cycle.id));

  return c.json(success({ ...cycle, reviews }), 200);
});

// PATCH /api/performance/cycles/:id/complete
performanceRoutes.patch("/cycles/:id/complete", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [cycle] = await db
    .select({ id: schema.performanceCycles.id })
    .from(schema.performanceCycles)
    .where(and(eq(schema.performanceCycles.id, c.req.param("id")), eq(schema.performanceCycles.createdByUserId, userId)))
    .limit(1);

  if (!cycle) return c.json(error("NOT_FOUND", "Cycle not found"), 404);

  const [updated] = await db
    .update(schema.performanceCycles)
    .set({ status: "completed", updatedAt: new Date() } as any)
    .where(eq(schema.performanceCycles.id, cycle.id))
    .returning();

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// Performance Reviews
// ---------------------------------------------------------------------------

// POST /api/performance/reviews
performanceRoutes.post("/reviews", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [review] = await db
    .insert(schema.performanceReviews)
    .values({
      cycleId: parsed.data.cycleId,
      revieweeUserId: parsed.data.revieweeUserId,
      reviewerUserId: userId,
      status: "in_progress",
      overallRating: parsed.data.overallRating ? String(parsed.data.overallRating) : undefined,
      strengths: parsed.data.strengths,
      areasForImprovement: parsed.data.areasForImprovement,
      goals: parsed.data.goals ?? [],
      ratings: parsed.data.ratings ?? {},
      reviewerNotes: parsed.data.reviewerNotes,
    } as any)
    .returning();

  return c.json(success(review), 201);
});

// GET /api/performance/reviews — reviews I've written or received
performanceRoutes.get("/reviews", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [asReviewer, asReviewee] = await Promise.all([
    db.select().from(schema.performanceReviews).where(eq(schema.performanceReviews.reviewerUserId, userId)).orderBy(desc(schema.performanceReviews.createdAt)),
    db.select().from(schema.performanceReviews).where(eq(schema.performanceReviews.revieweeUserId, userId)).orderBy(desc(schema.performanceReviews.createdAt)),
  ]);

  return c.json(success({ asReviewer, asReviewee }), 200);
});

// PATCH /api/performance/reviews/:id/submit
performanceRoutes.patch("/reviews/:id/submit", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [review] = await db
    .select({ id: schema.performanceReviews.id })
    .from(schema.performanceReviews)
    .where(and(eq(schema.performanceReviews.id, c.req.param("id")), eq(schema.performanceReviews.reviewerUserId, userId)))
    .limit(1);

  if (!review) return c.json(error("NOT_FOUND", "Review not found"), 404);

  const [updated] = await db
    .update(schema.performanceReviews)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(schema.performanceReviews.id, review.id))
    .returning();

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// Goals / OKRs
// ---------------------------------------------------------------------------

// GET /api/performance/goals
performanceRoutes.get("/goals", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const goals = await db
    .select()
    .from(schema.performanceGoals)
    .where(eq(schema.performanceGoals.userId, userId))
    .orderBy(desc(schema.performanceGoals.createdAt));

  return c.json(success(goals), 200);
});

// POST /api/performance/goals
performanceRoutes.post("/goals", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateGoalSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [goal] = await db
    .insert(schema.performanceGoals)
    .values({
      userId,
      cycleId: parsed.data.cycleId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
      progressPercentage: 0,
      status: "in_progress",
    } as any)
    .returning();

  return c.json(success(goal), 201);
});

// PATCH /api/performance/goals/:id
performanceRoutes.patch("/goals/:id", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [goal] = await db
    .select({ id: schema.performanceGoals.id })
    .from(schema.performanceGoals)
    .where(and(eq(schema.performanceGoals.id, c.req.param("id")), eq(schema.performanceGoals.userId, userId)))
    .limit(1);

  if (!goal) return c.json(error("NOT_FOUND", "Goal not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.progressPercentage === "number") updates.progressPercentage = Math.min(100, Math.max(0, body.progressPercentage));
  if (typeof body.status === "string") updates.status = body.status;
  if (body.status === "completed") updates.completedAt = new Date();

  const [updated] = await db
    .update(schema.performanceGoals)
    .set(updates as any)
    .where(eq(schema.performanceGoals.id, goal.id))
    .returning();

  return c.json(success(updated), 200);
});

// DELETE /api/performance/goals/:id
performanceRoutes.delete("/goals/:id", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [goal] = await db
    .select({ id: schema.performanceGoals.id })
    .from(schema.performanceGoals)
    .where(and(eq(schema.performanceGoals.id, c.req.param("id")), eq(schema.performanceGoals.userId, userId)))
    .limit(1);

  if (!goal) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  await db.delete(schema.performanceGoals).where(eq(schema.performanceGoals.id, goal.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/performance/goals/:id/progress — dedicated OKR progress update (#14)
// Body: { progressPercentage: number, keyResults?: Array<{title,current,target,unit}> }
// Key results are stored in the goal's existing JSONB description field as structured data.
// ---------------------------------------------------------------------------
performanceRoutes.patch("/goals/:id/progress", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [goal] = await db
    .select()
    .from(schema.performanceGoals)
    .where(and(eq(schema.performanceGoals.id, c.req.param("id")), eq(schema.performanceGoals.userId, userId)))
    .limit(1);

  if (!goal) return c.json(error("NOT_FOUND", "Goal not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const progress = typeof body.progressPercentage === "number"
    ? Math.min(100, Math.max(0, body.progressPercentage))
    : goal.progressPercentage;

  const updates: Record<string, unknown> = {
    progressPercentage: progress,
    updatedAt: new Date(),
  };

  // Auto-complete at 100%
  if (progress >= 100 && goal.status !== "completed") {
    updates.status = "completed";
    updates.completedAt = new Date();
  }

  // Store key results in goal description as JSON supplement if provided
  if (Array.isArray(body.keyResults) && body.keyResults.length > 0) {
    // Derive overall progress from key results if not explicitly provided
    const keyResults = body.keyResults as Array<{ title: string; current: number; target: number; unit?: string }>;
    if (typeof body.progressPercentage !== "number") {
      const avgProgress = keyResults.reduce((sum, kr) => {
        const pct = kr.target > 0 ? Math.min(100, (kr.current / kr.target) * 100) : 0;
        return sum + pct;
      }, 0) / keyResults.length;
      updates.progressPercentage = Math.round(avgProgress);
      if (avgProgress >= 100 && goal.status !== "completed") {
        updates.status = "completed";
        updates.completedAt = new Date();
      }
    }
    // Append keyResults JSON to description (non-destructive if description already has text)
    const krJson = JSON.stringify({ keyResults, updatedAt: new Date().toISOString() });
    updates.description = `${goal.description ?? ""}\n<!-- keyResults: ${krJson} -->`.trimStart();
  }

  const [updated] = await db
    .update(schema.performanceGoals)
    .set(updates as any)
    .where(eq(schema.performanceGoals.id, goal.id))
    .returning();

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/performance/reviews/:id/acknowledge — employee acknowledges review (#14)
// ---------------------------------------------------------------------------
performanceRoutes.patch("/reviews/:id/acknowledge", requirePro("Performance Management"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [review] = await db
    .select({ id: schema.performanceReviews.id, revieweeUserId: schema.performanceReviews.revieweeUserId, status: schema.performanceReviews.status })
    .from(schema.performanceReviews)
    .where(eq(schema.performanceReviews.id, c.req.param("id")))
    .limit(1);

  if (!review) return c.json(error("NOT_FOUND", "Review not found"), 404);
  if (review.revieweeUserId !== userId) return c.json(error("FORBIDDEN", "Only the reviewee can acknowledge their review"), 403);
  if (review.status !== "submitted") return c.json(error("CONFLICT", "Review must be submitted before it can be acknowledged"), 409);

  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(schema.performanceReviews)
    .set({
      status: "acknowledged",
      acknowledgedAt: new Date(),
      revieweeResponse: typeof body.response === "string" ? body.response.slice(0, 5000) : undefined,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.performanceReviews.id, review.id))
    .returning();

  return c.json(success(updated), 200);
});

performanceRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Performance route not found" } }, 404),
);
