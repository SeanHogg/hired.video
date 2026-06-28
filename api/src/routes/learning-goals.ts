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
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";

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

  // LLM re-rank only runs on a cache miss (per goal, 600s TTL) — bounds cost.
  const llm = hasAnyLLMProviderKey(c.env as any)
    ? createLLMClient(c.env as any, c.var.user ?? null)
    : null;

  const items = await getOrSetCached<unknown[]>({
    key: recsCacheKey(id),
    ttlSeconds: 600,
    loader: async () => {
      // Recall: cheap keyword candidate set (wider than we'll return).
      const candidates = await recommendCoursesForText(goal.goalText, 12);
      if (candidates.length <= 1) return candidates.slice(0, 6);
      // Precision: have the LLM re-rank candidates against the goal. On any
      // failure (no key, refusal, drift) fall back to the keyword order.
      const orderedIds = llm
        ? await llmRerankCandidates(llm, goal.goalText, candidates).catch(() => null)
        : null;
      if (!orderedIds || orderedIds.length === 0) return candidates.slice(0, 6);
      const byId = new Map(candidates.map((c2) => [c2.id, c2]));
      const ranked = orderedIds.map((cid) => byId.get(cid)).filter(Boolean);
      // Append any candidate the model dropped, preserving keyword order, so
      // we always return up to 6 even if the model returned fewer.
      for (const cand of candidates) if (!orderedIds.includes(cand.id)) ranked.push(cand);
      return ranked.slice(0, 6);
    },
    revive: (raw) => (Array.isArray(raw) ? raw : null),
  });
  return c.json(success(items), 200);
});

// POST /api/learning-goals/:id/generate-path — #2068 GAP-3.
// Materialise a DRAFT learning_path from the goal: pull keyword candidates,
// have the LLM pick + order the courses that form a coherent path and name it,
// then persist a draft path the learner can refine + publish. Falls back to the
// top keyword courses + a goal-derived title when the LLM is unavailable.
learningGoalsRoutes.post("/:id/generate-path", async (c) => {
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

  const candidates = await recommendCoursesForText(goal.goalText, 12);
  if (candidates.length === 0) {
    return c.json(error("NO_COURSES", "No published courses match this goal yet"), 422);
  }

  const llm = hasAnyLLMProviderKey(c.env as any)
    ? createLLMClient(c.env as any, c.var.user ?? null)
    : null;

  let plan: { title: string; summary: string; orderedCourseIds: string[] } | null = null;
  if (llm) plan = await llmPlanPath(llm, goal.goalText, candidates).catch(() => null);

  // Fallback: top keyword courses in keyword order, generic goal-derived title.
  const validIds = new Set(candidates.map((c2) => c2.id));
  const orderedIds = (plan?.orderedCourseIds ?? [])
    .filter((cid) => validIds.has(cid));
  const finalIds = (orderedIds.length > 0 ? orderedIds : candidates.slice(0, 5).map((c2) => c2.id));
  const title = (plan?.title?.trim() || `Path: ${goal.goalText}`).slice(0, 255);
  const summary = (plan?.summary?.trim() || `A learning path toward "${goal.goalText}".`).slice(0, 1000);

  const baseSlug =
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "learning-path";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

  const [path] = await db
    .insert(schema.learningPaths)
    .values({
      userId,
      slug,
      title,
      summary,
      status: "draft",
      tags: [],
    } as any)
    .returning();

  await db.insert(schema.learningPathCourses).values(
    finalIds.map((courseId, i) => ({
      pathId: path.id,
      courseId,
      displayOrder: i,
      isRequired: true,
    })) as any,
  );

  return c.json(
    success({ path, courseCount: finalIds.length, generatedByLlm: Boolean(plan) }),
    201,
  );
});

// Ask the LLM to assemble a coherent ordered path from the candidate courses.
async function llmPlanPath(
  llm: ReturnType<typeof createLLMClient>,
  goalText: string,
  candidates: Array<{ id: string; title: string; summary: string | null; category: string | null; difficulty: string | null }>,
): Promise<{ title: string; summary: string; orderedCourseIds: string[] }> {
  const list = candidates
    .map(
      (c2, i) =>
        `${i + 1}. id=${c2.id} | ${c2.title}${c2.difficulty ? ` (${c2.difficulty})` : ""}${c2.summary ? ` — ${c2.summary.slice(0, 140)}` : ""}`,
    )
    .join("\n");
  const { data } = await llm.callJson(
    "course_recommend",
    {
      useCase: "course_recommend",
      systemPrompt:
        "You design a learning path: pick ONLY the candidate courses that build toward the learner's goal and order them from foundational to advanced. Give the path a short title and a one-sentence summary. Use ONLY the supplied course ids; never invent ids; drop irrelevant courses.",
      userMessage: `Learner goal: "${goalText}"\n\nCandidate courses:\n${list}\n\nReturn { title, summary, orderedCourseIds } — orderedCourseIds foundational-first.`,
      responseFormat: "json_object",
    },
    z.object({
      title: z.string(),
      summary: z.string(),
      orderedCourseIds: z.array(z.string()),
    }),
  );
  return data;
}

// Re-rank keyword candidates by relevance to the goal. Returns an ordered list
// of course ids (best first) or throws → caller falls back to keyword order.
async function llmRerankCandidates(
  llm: ReturnType<typeof createLLMClient>,
  goalText: string,
  candidates: Array<{ id: string; title: string; summary: string | null; category: string | null; difficulty: string | null }>,
): Promise<string[]> {
  const list = candidates
    .map(
      (c2, i) =>
        `${i + 1}. id=${c2.id} | ${c2.title}${c2.category ? ` [${c2.category}]` : ""}${c2.difficulty ? ` (${c2.difficulty})` : ""}${c2.summary ? ` — ${c2.summary.slice(0, 140)}` : ""}`,
    )
    .join("\n");
  const { data } = await llm.callJson(
    "course_recommend",
    {
      useCase: "course_recommend",
      systemPrompt:
        "You rank courses by how well they help a learner reach a stated goal. Return ONLY the ids of the genuinely relevant courses, best first (most directly on-goal). Drop irrelevant ones entirely. Never invent ids.",
      userMessage: `Learner goal: "${goalText}"\n\nCandidate courses:\n${list}\n\nReturn the relevant course ids, best first.`,
      responseFormat: "json_object",
    },
    z.object({ orderedIds: z.array(z.string()) }),
  );
  const validIds = new Set(candidates.map((c2) => c2.id));
  return data.orderedIds.filter((cid) => validIds.has(cid));
}

// Stop words we never want to match on — they'd pull in every course.
const STOP_WORDS = new Set([
  "i", "to", "the", "a", "an", "and", "or", "of", "for", "in", "on", "how",
  "want", "learn", "learning", "become", "get", "better", "with", "my",
  "about", "more", "build", "building", "make", "using", "use",
]);

interface RecommendCard {
  id: string;
  type: "course";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[] | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: Date | string | null;
  author: { id: string; name: string | null; avatarUrl: string | null; slug: string };
}

async function recommendCoursesForText(goalText: string, limit = 6): Promise<RecommendCard[]> {
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
    .limit(limit);

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
