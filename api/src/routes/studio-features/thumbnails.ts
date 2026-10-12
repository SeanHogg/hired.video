/**
 * Studio features — AI thumbnail generator. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { invalidatePublicEngagement } from "../../services/studio/public-engagement.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { ok, fail, viewerCanActOnProject, studioThumbnails } from "./shared.js";

export const thumbnailRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  18. AI THUMBNAIL GENERATOR — gap #142
// ██
// ██  Heuristic + LLM scoring of candidate frames extracted from a project's
// ██  video. The frames themselves are extracted client-side (browser
// ██  `<canvas>` from `<video>`) and uploaded as data URLs / R2 keys, since
// ██  the Worker runtime cannot decode video frames. The route receives
// ██  candidate frames + their source timestamps, asks an LLM to rank them,
// ██  and persists the ranked candidates so the user can pick one.
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/projects/:projectId/thumbnails/score
// Body: { candidates: Array<{ imageUrl, sourceTimeSec }>, headlineHint? }
thumbnailRoutes.post("/projects/:projectId/thumbnails/score", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    candidates: z.array(z.object({
      imageUrl: z.string().url(),
      storageKey: z.string().optional(),
      sourceTimeSec: z.number().min(0).optional(),
    })).min(1).max(12),
    headlineHint: z.string().max(80).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  // Candidates are served by the PUBLIC engagement read and this replaces
  // the project's unselected set — owner / company / delegate only.
  if (!(await viewerCanActOnProject(user.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  const db = getDb();

  // Heuristic score: prefer frames slightly past the start (skip the first
  // 1.5 s of typical fade-ins) and that are not in the final 10 % of the video.
  // The LLM step (when an API key is present) refines the ranking.
  const heuristic = parsed.data.candidates.map((cand, i) => {
    const t = cand.sourceTimeSec ?? i;
    let score = 0.5;
    if (t > 1.5) score += 0.15;
    if (t > 5) score += 0.1;
    score += Math.max(0, 0.25 - Math.abs(t - 8) / 100);
    return { ...cand, score: Math.min(1, score) };
  });

  let ranked = heuristic;
  if (hasAnyLLMProviderKey(c.env)) {
    try {
      const RankSchema = z.object({
        ranked: z.array(z.object({
          index: z.number().int().nonnegative(),
          score: z.number().min(0).max(1),
          reason: z.string().optional(),
        })),
      });
      const llm = createLLMClient(c.env, c.var.user);
      const { data } = await llm.callJson(
        "studio_thumbnail_score",
        {
          useCase: "studio_misc",
          systemPrompt: "You score video thumbnail candidates for click-through rate. Favour frames that show a clear face, strong eye contact, vivid colour contrast, and uncluttered backgrounds. Return JSON only.",
          userMessage: `Score the following ${parsed.data.candidates.length} candidate frames on a 0..1 scale (1 = best CTR). Frames are described only by their position in the video so use position as a tie-breaker.\n\nCandidates: ${parsed.data.candidates.map((c, i) => `[${i}] t=${c.sourceTimeSec ?? "?"}s`).join(", ")}\n\nReturn JSON: { "ranked": [{ "index": 0, "score": 0.8, "reason": "..." }, ...] }`,
        },
        RankSchema,
      );
      // Merge LLM scores back onto heuristic order
      ranked = heuristic.map((cand, i) => {
        const llmRank = data.ranked.find((r) => r.index === i);
        return llmRank ? { ...cand, score: llmRank.score } : cand;
      });
    } catch (err) {
      console.warn("[thumbnails/score] LLM scoring failed, falling back to heuristic:", err);
    }
  }

  // Persist all candidates as new rows; clear any prior un-selected candidates.
  await db.delete(studioThumbnails).where(and(
    eq(studioThumbnails.projectId, projectId),
    eq(studioThumbnails.isSelected, false),
  ));

  const inserted = await db.insert(studioThumbnails).values(
    ranked.map((r) => ({
      projectId,
      userId: user.sub,
      imageUrl: r.imageUrl,
      storageKey: r.storageKey ?? null,
      sourceTimeSec: r.sourceTimeSec ?? null,
      headlineText: parsed.data.headlineHint ?? null,
      score: r.score,
      isSelected: false,
    }) as any),
  ).returning();
  invalidatePublicEngagement(projectId);

  return c.json(ok({
    candidates: inserted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  }), 201);
});

// GET /api/studio/projects/:projectId/thumbnails — list
thumbnailRoutes.get("/projects/:projectId/thumbnails", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();
  const rows = await db.select().from(studioThumbnails)
    .where(eq(studioThumbnails.projectId, projectId))
    .orderBy(desc(studioThumbnails.score));
  return c.json(ok({ thumbnails: rows }));
});


// PATCH /api/studio/projects/:projectId/thumbnail — select active thumbnail
thumbnailRoutes.patch("/projects/:projectId/thumbnail", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ thumbnailId: UuidLikeSchema }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  // Authorised through the thumbnail's project (owner / company / delegate),
  // and the thumbnail must belong to THIS project; checked before the
  // selection is cleared, so a bad id never unselects the live thumbnail.
  const access = await resolveActableEngagementRow(user.sub, "thumbnail", parsed.data.thumbnailId);
  if (!access || access.projectId !== projectId) {
    return c.json(fail("NOT_FOUND", "Thumbnail not found"), 404);
  }

  const db = getDb();

  // Clear existing selection
  await db.update(studioThumbnails)
    .set({ isSelected: false } as any)
    .where(eq(studioThumbnails.projectId, projectId));

  const [selected] = await db.update(studioThumbnails)
    .set({ isSelected: true } as any)
    .where(and(
      eq(studioThumbnails.id, parsed.data.thumbnailId),
      eq(studioThumbnails.projectId, projectId),
    ))
    .returning();

  invalidatePublicEngagement(projectId);
  if (!selected) return c.json(fail("NOT_FOUND", "Thumbnail not found"), 404);
  return c.json(ok(selected));
});
