import { Hono } from "hono";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { feedPosts, feedPostLikes, feedPostComments, users, userProfiles } = schema;

export const feedRoutes = new Hono<{ Variables: Variables }>();

// ─────────────────────────────────────────────────────────────────────────────
// DTO builder
// ─────────────────────────────────────────────────────────────────────────────
function toPostDto(
  post: typeof feedPosts.$inferSelect,
  authorName: string,
  authorAvatar: string | null,
  likes: Array<{ id: string; userId: string }>,
  commentCount: number,
  currentUserId: string,
) {
  return {
    id: post.id,
    userId: post.userId,
    userName: authorName,
    userAvatar: authorAvatar ?? undefined,
    content: post.content,
    linkUrl: post.linkUrl ?? undefined,
    linkTitle: post.linkTitle ?? undefined,
    linkDescription: post.linkDescription ?? undefined,
    linkImageUrl: post.linkImageUrl ?? undefined,
    privacy: post.privacy as "Public" | "Connections" | "Private",
    createdAt: new Date(post.createdAt).toISOString(),
    updatedAt: new Date(post.updatedAt).toISOString(),
    media: post.media ?? [],
    tags: post.tags ?? [],
    likes: likes.map((l) => ({ id: l.id, feedPostId: post.id, userId: l.userId, userName: "" })),
    comments: [],
    likeCount: likes.length,
    commentCount,
    isLikedByCurrentUser: likes.some((l) => l.userId === currentUserId),
  };
}

async function fetchPostDtos(
  postRows: Array<typeof feedPosts.$inferSelect>,
  currentUserId: string,
  db: ReturnType<typeof getDb>,
) {
  if (postRows.length === 0) return [];
  const postIds = postRows.map((p) => p.id);
  const authorIds = [...new Set(postRows.map((p) => p.userId))];

  const [authorRows, profileRows, likeRows, commentCounts] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)),
    db
      .select({ userId: userProfiles.userId, avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, authorIds)),
    db
      .select({ id: feedPostLikes.id, feedPostId: feedPostLikes.feedPostId, userId: feedPostLikes.userId })
      .from(feedPostLikes)
      .where(inArray(feedPostLikes.feedPostId, postIds)),
    db
      .select({ feedPostId: feedPostComments.feedPostId, count: sql<number>`count(*)::int` })
      .from(feedPostComments)
      .where(inArray(feedPostComments.feedPostId, postIds))
      .groupBy(feedPostComments.feedPostId),
  ]);

  const authorMap = new Map(authorRows.map((a) => [a.id, a.name]));
  const avatarMap = new Map(profileRows.map((p) => [p.userId, p.avatarUrl ?? null]));

  const likesByPost = new Map<string, Array<{ id: string; userId: string }>>();
  for (const like of likeRows) {
    if (!likesByPost.has(like.feedPostId)) likesByPost.set(like.feedPostId, []);
    likesByPost.get(like.feedPostId)!.push({ id: like.id, userId: like.userId });
  }

  const commentCountMap = new Map(commentCounts.map((c) => [c.feedPostId, c.count]));

  return postRows.map((post) =>
    toPostDto(
      post,
      authorMap.get(post.userId) ?? "Unknown",
      avatarMap.get(post.userId) ?? null,
      likesByPost.get(post.id) ?? [],
      commentCountMap.get(post.id) ?? 0,
      currentUserId,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/feed/posts */
feedRoutes.get("/posts", async (c) => {
  const currentUserId = c.var.user?.sub ?? "";
  const pageNumber = Math.max(1, Number(c.req.query("pageNumber") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? "20") || 20));
  const offset = (pageNumber - 1) * pageSize;
  const db = getDb();

  const [totalRow, postRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(feedPosts),
    db.select().from(feedPosts).orderBy(desc(feedPosts.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = totalRow[0]?.count ?? 0;
  const dtos = await fetchPostDtos(postRows, currentUserId, db);

  return c.json(
    success({
      posts: dtos,
      totalCount: total,
      pageNumber,
      pageSize,
      hasNextPage: offset + pageSize < total,
      hasPreviousPage: pageNumber > 1,
    }),
    200,
  );
});

/** GET /api/feed/posts/:postId */
feedRoutes.get("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const currentUserId = c.var.user?.sub ?? "";
  const db = getDb();

  const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  if (!post) return c.json(error("NOT_FOUND", "Post not found"), 404);

  const [dto] = await fetchPostDtos([post], currentUserId, db);
  return c.json(success(dto), 200);
});

/** POST /api/feed/posts */
feedRoutes.post("/posts", async (c) => {
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();

  const [post] = await db
    .insert(feedPosts)
    .values({
      userId,
      content: typeof body.content === "string" ? body.content : "",
      linkUrl: typeof body.linkUrl === "string" ? body.linkUrl : null,
      privacy:
        body.privacy === "Private" || body.privacy === "Connections" ? String(body.privacy) : "Public",
      media: Array.isArray(body.media)
        ? (body.media as any[]).map((m: any, idx: number) => ({
            id: crypto.randomUUID(),
            mediaType: m.mediaType === "Video" ? "Video" : "Image",
            mediaUrl: m.mediaUrl ?? "",
            thumbnailUrl: m.thumbnailUrl ?? undefined,
            altText: m.altText ?? undefined,
            displayOrder: typeof m.displayOrder === "number" ? m.displayOrder : idx,
          }))
        : [],
      tags: [],
    } as any)
    .returning();

  const [dto] = await fetchPostDtos([post], userId, db);
  return c.json(success(dto), 201);
});

/** PUT /api/feed/posts/:postId */
feedRoutes.put("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();

  const [existing] = await db.select().from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Post not found"), 404);
  if (existing.userId !== userId) return c.json(error("FORBIDDEN", "Not your post"), 403);

  const [updated] = await db
    .update(feedPosts)
    .set({
      content: typeof body.content === "string" ? body.content : existing.content,
      privacy:
        body.privacy === "Private" || body.privacy === "Connections" || body.privacy === "Public"
          ? String(body.privacy)
          : existing.privacy,
      updatedAt: new Date(),
    } as any)
    .where(eq(feedPosts.id, postId))
    .returning();

  const [dto] = await fetchPostDtos([updated], userId, db);
  return c.json(success(dto), 200);
});

/** DELETE /api/feed/posts/:postId */
feedRoutes.delete("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const db = getDb();

  const [existing] = await db
    .select({ id: feedPosts.id, userId: feedPosts.userId })
    .from(feedPosts)
    .where(eq(feedPosts.id, postId))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Post not found"), 404);
  if (existing.userId !== userId) return c.json(error("FORBIDDEN", "Not your post"), 403);

  await db.delete(feedPosts).where(eq(feedPosts.id, postId));
  return c.json(success(true), 200);
});

/** POST /api/feed/posts/:postId/like */
feedRoutes.post("/posts/:postId/like", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const db = getDb();

  const [existing] = await db
    .select({ id: feedPostLikes.id })
    .from(feedPostLikes)
    .where(and(eq(feedPostLikes.feedPostId, postId), eq(feedPostLikes.userId, userId)))
    .limit(1);

  if (existing) return c.json(success({ id: existing.id, feedPostId: postId, userId }), 200);

  const [like] = await db.insert(feedPostLikes).values({ feedPostId: postId, userId }).returning();
  return c.json(success({ id: like.id, feedPostId: postId, userId }), 200);
});

/** DELETE /api/feed/posts/:postId/like */
feedRoutes.delete("/posts/:postId/like", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const db = getDb();

  await db
    .delete(feedPostLikes)
    .where(and(eq(feedPostLikes.feedPostId, postId), eq(feedPostLikes.userId, userId)));

  return c.json(success(true), 200);
});

/** GET /api/feed/posts/:postId/comments */
feedRoutes.get("/posts/:postId/comments", async (c) => {
  const postId = c.req.param("postId");
  const db = getDb();

  const rows = await db
    .select()
    .from(feedPostComments)
    .where(eq(feedPostComments.feedPostId, postId))
    .orderBy(desc(feedPostComments.createdAt));

  return c.json(
    success(
      rows.map((r) => ({
        id: r.id,
        feedPostId: r.feedPostId,
        userId: r.userId,
        userName: "",
        content: r.content,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      })),
    ),
    200,
  );
});

/** POST /api/feed/comments */
feedRoutes.post("/comments", async (c) => {
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const postId = typeof body.feedPostId === "string" ? body.feedPostId : "";
  const content = typeof body.content === "string" ? body.content : "";
  const db = getDb();

  const [comment] = await db
    .insert(feedPostComments)
    .values({ feedPostId: postId, userId, content })
    .returning();

  return c.json(
    success({
      id: comment.id,
      feedPostId: comment.feedPostId,
      userId: comment.userId,
      userName: "",
      content: comment.content,
      createdAt: new Date(comment.createdAt).toISOString(),
      updatedAt: new Date(comment.updatedAt).toISOString(),
    }),
    201,
  );
});

/** PUT /api/feed/comments/:commentId */
feedRoutes.put("/comments/:commentId", async (c) => {
  const commentId = c.req.param("commentId");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(feedPostComments)
    .where(eq(feedPostComments.id, commentId))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Comment not found"), 404);
  if (existing.userId !== userId) return c.json(error("FORBIDDEN", "Not your comment"), 403);

  const [updated] = await db
    .update(feedPostComments)
    .set({
      content: typeof body.content === "string" ? body.content : existing.content,
      updatedAt: new Date(),
    } as any)
    .where(eq(feedPostComments.id, commentId))
    .returning();

  return c.json(
    success({
      id: updated.id,
      feedPostId: updated.feedPostId,
      userId: updated.userId,
      userName: "",
      content: updated.content,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    }),
    200,
  );
});

/** DELETE /api/feed/comments/:commentId */
feedRoutes.delete("/comments/:commentId", async (c) => {
  const commentId = c.req.param("commentId");
  const userId = c.var.user.sub;
  const db = getDb();

  const [existing] = await db
    .select({ id: feedPostComments.id, userId: feedPostComments.userId })
    .from(feedPostComments)
    .where(eq(feedPostComments.id, commentId))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Comment not found"), 404);
  if (existing.userId !== userId) return c.json(error("FORBIDDEN", "Not your comment"), 403);

  await db.delete(feedPostComments).where(eq(feedPostComments.id, commentId));
  return c.json(success(true), 200);
});

/** GET /api/feed/search */
feedRoutes.get("/search", async (c) => {
  const currentUserId = c.var.user?.sub ?? "";
  const searchTerm = c.req.query("searchTerm") ?? "";
  const pageNumber = Math.max(1, Number(c.req.query("pageNumber") ?? "1") || 1);
  const pageSize = Math.min(50, Number(c.req.query("pageSize") ?? "20") || 20);
  const offset = (pageNumber - 1) * pageSize;

  const db = getDb();
  const { ilike } = await import("drizzle-orm");
  const postRows = await db
    .select()
    .from(feedPosts)
    .where(ilike(feedPosts.content, `%${searchTerm}%`))
    .orderBy(desc(feedPosts.createdAt))
    .limit(pageSize)
    .offset(offset);

  const dtos = await fetchPostDtos(postRows, currentUserId, db);
  return c.json(success({ posts: dtos, totalCount: dtos.length, pageNumber, pageSize }), 200);
});

/** POST /api/feed/link-preview */
feedRoutes.post("/link-preview", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = typeof body.url === "string" ? body.url : "";
  return c.json(
    success({ url, title: null, description: null, imageUrl: null, siteName: null }),
    200,
  );
});
