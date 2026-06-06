// /api/learning-goals — a learner's own stated objectives. Captured in the
// onboarding funnel and on the learner home; drives course recommendations
// and gives the AI brain a durable signal of intent.
//
// Recommendations are a deterministic keyword match over published courses
// (title / summary / category / tags), cached read-through per goal. An
// LLM-ranked variant is tracked in the gap register — the keyword pass is
// fast, free, and good enough to seed the funnel.

import { Hono } from "hono";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { LEARNING_GOAL_STATUSES } from "../db/schema/learning.js";
import { getOrSetCached, invalidateCachedKey } from "../utils/edge-cache.js";

export const learningGoalsRoutes = new Hono<AppEnv>();

const CreateGoalSchema = z.object({
  goalText: z.string().min(2).max(280),
  source: z.enum(["onboarding", "manual"]).default("manual"),
});

const UpdateGoalSchema = z.object({
  goalText: z.string().min(2).max(280).optional(),
  status: z.enum(LEARNING_GOAL_STATUSES).optional(),
});

function recsCacheKey(goalId: string): string {
  return `learning-goal:recs:${goalId}`;
}

// GET /api/learning-goals/me — the caller's goals, newest first.
learningGoalsRoutes.get("/me", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.learningGoals)
    .where(eq(schema.learningGoals.userId, userId))
    .orderBy(desc(schema.learningGoals.createdAt));
  return c.json(success(rows), 200);
});

// POST /api/learning-goals — capture a new goal.
learningGoalsRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [row] = await db
    .insert(schema.learningGoals)
    .values({
      userId,
      goalText: parsed.data.goalText.trim(),
      source: parsed.data.source,
      status: "active",
    } as any)
    .returning();
  return c.json(success(row), 201);
});

// PATCH /api/learning-goals/:id — edit text or change status.
learningGoalsRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(schema.learningGoals)
    .where(and(eq(schema.learningGoals.id, id), eq(schema.learningGoals.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Goal not found"), 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.goalText !== undefined) updates.goalText = parsed.data.goalText.trim();
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [updated] = await db
    .update(schema.learningGoals)
    .set(updates as any)
    .where(eq(schema.learningGoals.id, id))
    .returning();

  // Goal text drives the cached recommendation set.
  if (parsed.data.goalText !== undefined) invalidateCachedKey(recsCacheKey(id));
  return c.json(success(updated), 200);
});

// DELETE /api/learning-goals/:id
learningGoalsRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const id = c.req.param("id");
  const [existing] = await db
    .select({ id: schema.learningGoals.id })
    .from(schema.learningGoals)
    .where(and(eq(schema.learningGoals.id, id), eq(schema.learningGoals.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Goal not found"), 404);

  await db.delete(schema.learningGoals).where(eq(schema.learningGoals.id, id));
  invalidateCachedKey(recsCacheKey(id));
  return c.json(success({ deleted: true }), 200);
});

// GET /api/learning-goals/:id/recommendations — published courses matching the
// goal text. Cached read-through; keyword-ranked.
learningGoalsRoutes.get("/:id/recommendations", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const id = c.req.param("id");
  const [goal] = await db
    .select()
    .from(schema.learningGoals)
    .where(and(eq(schema.learningGoals.id, id), eq(schema.learningGoals.userId, userId)))
    .limit(1);
  if (!goal) return c.json(error("NOT_FOUND", "Goal not found"), 404);

  const items = await getOrSetCached<unknown[]>({
    key: recsCacheKey(id),
    ttlSeconds: 600,
    loader: () => recommendCoursesForText(goal.goalText),
    revive: (raw) => (Array.isArray(raw) ? raw : null),
  });
  return c.json(success(items), 200);
});

// Stop words we never want to match on — they'd pull in every course.
const STOP_WORDS = new Set([
  "i", "to", "the", "a", "an", "and", "or", "of", "for", "in", "on", "how",
  "want", "learn", "learning", "become", "get", "better", "with", "my",
  "about", "more", "build", "building", "make", "using", "use",
]);

async function recommendCoursesForText(goalText: string): Promise<unknown[]> {
  const db = getDb();
  const tokens = goalText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 8);

  const { courses, users, userProfiles } = schema;

  // No usable tokens → fall back to the most-enrolled published courses.
  const matchClause =
    tokens.length > 0
      ? or(
          ...tokens.flatMap((tok) => {
            const like = `%${tok}%`;
            return [
              sql`${courses.title} ILIKE ${like}`,
              sql`${courses.summary} ILIKE ${like}`,
              sql`${courses.category} ILIKE ${like}`,
              sql`${courses.tags}::text ILIKE ${like}`,
            ];
          }),
        )
      : undefined;

  const whereClause = matchClause
    ? and(eq(courses.status, "published"), matchClause)
    : eq(courses.status, "published");

  const rows = await db
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: {
        avatarUrl: userProfiles.avatarUrl,
        customUrlSlug: userProfiles.customUrlSlug,
      },
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(whereClause)
    .orderBy(desc(courses.enrollmentCount))
    .limit(6);

  return rows.map((r) => ({
    id: r.course.id,
    type: "course" as const,
    title: r.course.title,
    slug: r.course.slug,
    summary: r.course.summary,
    coverImageUrl: r.course.coverImageUrl,
    category: r.course.category,
    tags: r.course.tags,
    difficulty: r.course.difficulty,
    estimatedMinutes: r.course.estimatedMinutes,
    priceCents: r.course.priceVisible ? r.course.priceCents : null,
    issuesCertificate: r.course.issuesCertificate,
    enrollmentCount: r.course.enrollmentCount,
    averageRating: r.course.averageRating,
    ratingCount: r.course.ratingCount,
    publishedAt: r.course.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  }));
}

learningGoalsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Learning-goals route not found" } }, 404),
);
