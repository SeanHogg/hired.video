/**
 * Article version history (#170 / #155): list, autosave / snapshot,
 * restore. Mirrors resumes + studio.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { pruneAutosaveVersions } from "../../repositories/autosaveVersionPruning.js";
import { uid } from "./shared.js";

const { articles, articleVersions } = schema;

export const articleVersionRoutes = new Hono<AppEnv>();

// ===========================================================================
// #170 / #155 — Article version history. Mirrors resumes + studio.
// ===========================================================================

const ARTICLE_AUTOSAVE_CAP = 50;
const ARTICLE_AUTOSAVE_RETENTION_DAYS = 30;

articleVersionRoutes.get("/:id/versions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [parent] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, c.req.param("id"))).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);
  const versions = await db.select({
    id: articleVersions.id,
    versionNumber: articleVersions.versionNumber,
    label: articleVersions.label,
    isAutosave: articleVersions.isAutosave,
    createdAt: articleVersions.createdAt,
  }).from(articleVersions)
    .where(eq(articleVersions.articleId, c.req.param("id")))
    .orderBy(desc(articleVersions.versionNumber))
    .limit(200);
  return c.json(success({ versions }), 200);
});

export const CreateArticleVersionSchema = z.object({
  label: z.string().trim().max(120).optional(),
  isAutosave: z.boolean().optional(),
});

articleVersionRoutes.post("/:id/versions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateArticleVersionSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid version payload"), 400);
  const db = getDb();
  const [parent] = await db.select({
    userId: articles.userId,
    title: articles.title,
    bodyMd: articles.bodyMd,
    bodyJson: articles.bodyJson,
  }).from(articles).where(eq(articles.id, id)).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);

  const [{ maxVersion }] = await db.select({
    maxVersion: sql<number>`COALESCE(MAX(${articleVersions.versionNumber}), 0)`,
  }).from(articleVersions).where(eq(articleVersions.articleId, id));

  const [created] = await db.insert(articleVersions).values({
    articleId: id,
    userId,
    versionNumber: (maxVersion ?? 0) + 1,
    label: parsed.data.label,
    title: parent.title,
    bodyMd: parent.bodyMd,
    bodyJson: parent.bodyJson as any,
    isAutosave: parsed.data.isAutosave ?? false,
  }).returning();

  if (created.isAutosave) {
    // Retention window + cap (drop oldest beyond the cap) in one statement.
    await pruneAutosaveVersions(
      db,
      {
        table: articleVersions,
        id: articleVersions.id,
        parentId: articleVersions.articleId,
        isAutosave: articleVersions.isAutosave,
        createdAt: articleVersions.createdAt,
      },
      id,
      { cap: ARTICLE_AUTOSAVE_CAP, retentionDays: ARTICLE_AUTOSAVE_RETENTION_DAYS },
    );
  }
  return c.json(success({ version: created }), 201);
});

articleVersionRoutes.post("/:id/versions/:vid/restore", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const vid = c.req.param("vid");
  const db = getDb();
  const [parent] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);
  const [version] = await db.select().from(articleVersions)
    .where(and(eq(articleVersions.id, vid), eq(articleVersions.articleId, id)))
    .limit(1);
  if (!version) return c.json(error("NOT_FOUND", "Version not found"), 404);
  const [updated] = await db.update(articles)
    .set({
      title: version.title,
      bodyMd: version.bodyMd ?? "",
      bodyJson: version.bodyJson as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(articles.id, id))
    .returning();
  bumpSearchVersion();
  return c.json(success({ restoredVersion: version, article: updated }), 200);
});

// ===========================================================================
// #171 — Engagement tracking. Three event paths upsert into
// article_engagement (per-day rollup). Only authenticated reads count
// toward the partner pool; the anonymous_read_seconds counter holds
// unauthenticated traffic for analytics.
// ===========================================================================
