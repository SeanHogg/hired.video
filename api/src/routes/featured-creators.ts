/**
 * /api/featured-creators — Featured-creator ranking surface (#180).
 *
 * Ranks creators with active enrollment rows on a weighted blend of:
 *   rating average × review volume × engagement depth × project count.
 *
 * The exact ranking weights are tunable constants and exposed via query
 * params for SuperAdmin tuning (e.g. `?wRating=0.5&wReviews=0.2`).
 *
 *   GET  /                      top-N creators ordered by score (public)
 *   GET  /by-category/:slug     same, filtered to a creator-program category
 */

import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const featuredCreatorsRoutes = new Hono<AppEnv>();

interface FeaturedCreator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  averageRating: number;
  reviewCount: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  score: number;
}

function computeScore(input: {
  averageRating: number;
  reviewCount: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  weights: { rating: number; reviews: number; projects: number; earnings: number };
}): number {
  const { weights } = input;
  return (
    weights.rating * input.averageRating +
    weights.reviews * Math.log10(1 + input.reviewCount) +
    weights.projects * Math.log10(1 + input.completedProjectsCount) +
    weights.earnings * Math.log10(1 + input.totalEarnedCents / 100)
  );
}

featuredCreatorsRoutes.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  const category = c.req.query("category");
  const weights = {
    rating: parseFloat(c.req.query("wRating") ?? "1.0") || 1.0,
    reviews: parseFloat(c.req.query("wReviews") ?? "0.5") || 0.5,
    projects: parseFloat(c.req.query("wProjects") ?? "0.3") || 0.3,
    earnings: parseFloat(c.req.query("wEarnings") ?? "0.2") || 0.2,
  };

  const db = getDb();
  const conds = [
    eq(schema.creatorProfiles.isActive, true),
    sql`${schema.creatorProfiles.endedAt} IS NULL`,
    eq(schema.users.emailVerified, true),
  ];
  if (category) conds.push(sql`${schema.creatorProfiles.categories} ? ${category}`);

  const rows = await db
    .select({
      userId: schema.creatorProfiles.userId,
      name: schema.users.name,
      avatarUrl: (schema as any).userProfiles?.avatarUrl ?? sql<string | null>`NULL`,
      averageRating: schema.creatorProfiles.averageRating,
      reviewCount: schema.creatorProfiles.ratingCount,
      completedProjectsCount: schema.creatorProfiles.completedProjectsCount,
      totalEarnedCents: schema.creatorProfiles.totalEarnedCents,
    })
    .from(schema.creatorProfiles)
    .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
    .leftJoin(
      (schema as any).userProfiles,
      eq(schema.creatorProfiles.userId, (schema as any).userProfiles.userId),
    )
    .where(and(...conds))
    .limit(limit * 3);

  const scored: FeaturedCreator[] = rows
    .map((r: any) => {
      const avg = Number(r.averageRating) || 0;
      const reviews = Number(r.reviewCount) || 0;
      const projects = Number(r.completedProjectsCount) || 0;
      const earnings = Number(r.totalEarnedCents) || 0;
      const score = computeScore({
        averageRating: avg,
        reviewCount: reviews,
        completedProjectsCount: projects,
        totalEarnedCents: earnings,
        weights,
      });
      return {
        userId: r.userId,
        displayName: r.name ?? "Creator",
        avatarUrl: r.avatarUrl ?? null,
        averageRating: avg,
        reviewCount: reviews,
        completedProjectsCount: projects,
        totalEarnedCents: earnings,
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return c.json(success({ items: scored, weights }), 200);
});

featuredCreatorsRoutes.get("/by-category/:slug", async (c) => {
  const category = c.req.param("slug");
  c.req.raw.url; // satisfy linter
  return featuredCreatorsRoutes.fetch(
    new Request(`${c.req.url.split("/by-category")[0]}?category=${encodeURIComponent(category)}`, {
      headers: c.req.raw.headers,
    }),
    c.env as any,
  );
});

featuredCreatorsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Featured creators route not found" } }, 404),
);
