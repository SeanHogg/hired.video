import { Hono } from "hono";
import { eq, and, desc, inArray, sql, ilike } from "drizzle-orm";
import type { Variables, JwtPayload, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { emitNotification, resolveActor } from "../services/notifications/notificationService.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";
import { FEED_POST_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";

// ─── Privacy / visibility helpers ────────────────────────────────────────────
// Feed post privacy mirrors resume privacy (KISS): Public | Recruiter | Connections | Private.
//   Public      → anyone (logged in or out)
//   Recruiter   → recruiters, employers, super-admins, and the author
//   Connections → author only (connection graph not yet wired in — treat as private-to-author)
//   Private     → author only
// Community posts (pro Employee Community feature) are stored in this table with
// privacy="Private" AND a "company:{id}:{channel}" tag. They must never appear in the
// public feed, even for their own author — that feed lives at /api/community/posts.
const FEED_PRIVACY_VALUES = ["Public", "Recruiter", "Connections", "Private"] as const;
type FeedPrivacy = (typeof FEED_PRIVACY_VALUES)[number];

function normalizePrivacy(value: unknown, fallback: FeedPrivacy = "Public"): FeedPrivacy {
  return (FEED_PRIVACY_VALUES as readonly string[]).includes(String(value))
    ? (String(value) as FeedPrivacy)
    : fallback;
}

function isRecruiterLike(user: JwtPayload | undefined): boolean {
  if (!user) return false;
  const roles = user.roles ?? [];
  return (
    Boolean(user.isSuperAdmin) ||
    roles.includes("recruiter") ||
    roles.includes("employer") ||
    roles.includes("admin")
  );
}

/**
 * SQL predicate enforcing feed visibility rules.
 *
 * Always excludes community posts (any tag starting with "company:") — those belong to
 * the pro Employee Community surface, not the public feed.
 */
function feedVisibilityCondition(currentUserId: string, isRecruiter: boolean) {
  const privacyClause = isRecruiter
    ? sql`(${feedPosts.privacy} IN ('Public', 'Recruiter') OR ${feedPosts.userId} = ${currentUserId})`
    : sql`(${feedPosts.privacy} = 'Public' OR ${feedPosts.userId} = ${currentUserId})`;
  // Community posts store tags as raw string elements like "company:uuid:channel".
  // Regular feed posts store tags as objects ({"tagType":..., "tagValue":...}), so the
  // quoted "company: prefix reliably distinguishes them in the jsonb text form.
  const excludeCommunity = sql`NOT (${feedPosts.tags}::text LIKE '%"company:%')`;
  return sql`${privacyClause} AND ${excludeCommunity}`;
}

const { feedPosts, feedPostLikes, feedPostComments, feedPostReports, users, userProfiles } = schema;

// ─── Tag helpers ─────────────────────────────────────────────────────────────

function extractHashtags(content: string): string[] {
  const matches = content.match(/#([a-zA-Z0-9_]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

function buildTagsField(content: string): Array<{
  id: string; tagType: "Hashtag" | "Mention"; tagValue: string; position: number;
}> {
  const tags: Array<{ id: string; tagType: "Hashtag" | "Mention"; tagValue: string; position: number }> = [];
  let idx = 0;
  for (const match of content.matchAll(/#([a-zA-Z0-9_]+)/g)) {
    tags.push({ id: crypto.randomUUID(), tagType: "Hashtag", tagValue: match[1].toLowerCase(), position: match.index ?? idx++ });
  }
  for (const match of content.matchAll(/@([a-zA-Z0-9_.-]+)/g)) {
    tags.push({ id: crypto.randomUUID(), tagType: "Mention", tagValue: match[1].toLowerCase(), position: match.index ?? idx++ });
  }
  return tags;
}

async function createMentionNotifications(
  content: string,
  postId: string,
  postAuthorId: string,
  db: ReturnType<typeof getDb>,
) {
  const mentionedNames = extractMentions(content);
  if (mentionedNames.length === 0) return;

  // Mentions match by lowercased full `name` — the @-syntax doesn't carry
  // ids, so a name lookup is the only way to resolve who's being talked to.
  const mentionedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.name}) = ANY(ARRAY[${sql.join(mentionedNames.map((n) => sql`${n}`), sql`, `)}])`);

  const recipientIds = mentionedUsers.map((u) => u.id);
  if (recipientIds.length === 0) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, postAuthorId);
  await emitNotification(
    { repos },
    {
      recipientIds,
      type: "feed_mention",
      actor,
      title: `${actorName} mentioned you`,
      message: `${actorName} mentioned you in a post`,
      target: { id: postId, type: "feed_post" },
    },
  );
}

export const feedRoutes = new Hono<AppEnv>();

// Feed reads are visibility-filtered per-user (privacy + recruiter role +
// connection graph), so cache is `private` — never CDN-cached. 30s is
// short enough that a new post lands in the timeline on the next refresh
// without being noticeable, and saves a query every page transition.
// ETag turns the "first poll after the window" into a 304 when nothing
// actually changed.
feedRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 30 }));
feedRoutes.use("/*", etagMiddleware());

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
    privacy: post.privacy as FeedPrivacy,
    createdAt: new Date(post.createdAt).toISOString(),
    updatedAt: new Date(post.updatedAt).toISOString(),
    media: post.media ?? [],
    tags: post.tags ?? [],
    likes: likes.map((l) => ({ id: l.id, feedPostId: post.id, userId: l.userId, userName: "" })),
    comments: [],
    likeCount: likes.length,
    commentCount,
    isLikedByCurrentUser: likes.some((l) => l.userId === currentUserId),
    // Polymorphic surfacing — when set, the renderer mounts the
    // canonical card for `subjectType` (e.g. <ReviewCard>) instead
    // of the default text/link card. `embedPayload` carries the
    // minimal display data so the feed list is one query.
    subjectType: post.subjectType ?? undefined,
    subjectId: post.subjectId ?? undefined,
    embedPayload: post.embedPayload ?? undefined,
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
  const tag = c.req.query("tag")?.toLowerCase() ?? "";
  const db = getDb();

  const visibility = feedVisibilityCondition(currentUserId, isRecruiterLike(c.var.user));
  const tagFilter = tag
    ? sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${feedPosts.tags}) t WHERE lower(t->>'tagValue') = ${tag} AND t->>'tagType' = 'Hashtag')`
    : null;
  const whereClause = tagFilter ? sql`${visibility} AND ${tagFilter}` : visibility;

  const [totalRow, postRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(feedPosts).where(whereClause),
    db.select().from(feedPosts).where(whereClause).orderBy(desc(feedPosts.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = totalRow[0]?.count ?? 0;
  const dtos = await fetchPostDtos(postRows, currentUserId, db);

  // `?fields=` projection (gap #1370 / #1446). Feed-card view rarely needs
  // the full post body or media metadata blob.
  const fields = parseFields(c.req.query("fields"), FEED_POST_LIST_FIELDS);
  const posts = projectRows(dtos as Array<Record<string, unknown>>, fields);

  return c.json(
    success({
      posts,
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

  const visibility = feedVisibilityCondition(currentUserId, isRecruiterLike(c.var.user));
  const [post] = await db
    .select()
    .from(feedPosts)
    .where(sql`${eq(feedPosts.id, postId)} AND ${visibility}`)
    .limit(1);
  if (!post) return c.json(error("NOT_FOUND", "Post not found"), 404);

  const [dto] = await fetchPostDtos([post], currentUserId, db);
  return c.json(success(dto), 200);
});

/** POST /api/feed/posts */
feedRoutes.post("/posts", async (c) => {
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();
  const content = typeof body.content === "string" ? body.content : "";

  const [post] = await db
    .insert(feedPosts)
    .values({
      userId,
      content,
      linkUrl: typeof body.linkUrl === "string" ? body.linkUrl : null,
      privacy: normalizePrivacy(body.privacy, "Public"),
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
      tags: buildTagsField(content),
    } as any)
    .returning();

  // Send mention notifications (fire-and-forget). The author lookup happens
  // inside `createMentionNotifications` via `resolveActor`, so no upfront
  // name fetch is needed here.
  c.executionCtx?.waitUntil(createMentionNotifications(content, post.id, userId, db));

  // Gamification award (fire-and-forget). Drives the `first_post` badge
  // + streak signal.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "feed-post-created", (game, role, uid) =>
    game.onFeedPostCreated({ userId: uid, role, postId: post.id }),
  );

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

  const newContent = typeof body.content === "string" ? body.content : existing.content;
  const [updated] = await db
    .update(feedPosts)
    .set({
      content: newContent,
      privacy: body.privacy !== undefined
        ? normalizePrivacy(body.privacy, existing.privacy as FeedPrivacy)
        : existing.privacy,
      tags: buildTagsField(newContent),
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
  const visibility = feedVisibilityCondition(currentUserId, isRecruiterLike(c.var.user));
  const postRows = await db
    .select()
    .from(feedPosts)
    .where(sql`${ilike(feedPosts.content, `%${searchTerm}%`)} AND ${visibility}`)
    .orderBy(desc(feedPosts.createdAt))
    .limit(pageSize)
    .offset(offset);

  const dtos = await fetchPostDtos(postRows, currentUserId, db);
  return c.json(success({ posts: dtos, totalCount: dtos.length, pageNumber, pageSize }), 200);
});

/** GET /api/feed/trending-tags — top hashtags by post frequency (last 30 days) */
feedRoutes.get("/trending-tags", async (c) => {
  const db = getDb();
  const limit = Math.min(50, Number(c.req.query("limit") ?? "20") || 20);

  // Only count hashtags from Public posts and exclude community posts — trending tags
  // are anonymous-visible, so they must never leak content from non-public posts.
  const rows = await db.execute(sql`
    SELECT
      lower(tag->>'tagValue') AS tag,
      count(*)::int           AS post_count
    FROM feed_posts,
         jsonb_array_elements(tags) AS tag
    WHERE tag->>'tagType' = 'Hashtag'
      AND created_at > now() - interval '30 days'
      AND privacy = 'Public'
      AND NOT (tags::text LIKE '%"company:%')
    GROUP BY lower(tag->>'tagValue')
    ORDER BY post_count DESC
    LIMIT ${limit}
  `);

  return c.json(success(rows.rows as Array<{ tag: string; post_count: number }>), 200);
});

/** POST /api/feed/posts/:postId/report */
feedRoutes.post("/posts/:postId/report", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason : "other";
  const details = typeof body.details === "string" ? body.details : null;
  const db = getDb();

  const [existing] = await db.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Post not found"), 404);

  // Prevent duplicate reports
  const [alreadyReported] = await db
    .select({ id: feedPostReports.id })
    .from(feedPostReports)
    .where(and(eq(feedPostReports.feedPostId, postId), eq(feedPostReports.userId, userId)))
    .limit(1);

  if (alreadyReported) return c.json(success({ reported: true }), 200);

  await db.insert(feedPostReports).values({ feedPostId: postId, userId, reason, details } as any);
  return c.json(success({ reported: true }), 201);
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
