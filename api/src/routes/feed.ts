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
import { recordArtifactView, ipCountryFromCtx } from "../services/analytics/artifactView.js";
import {
  FEED_REACTIONS,
  normalizeReaction,
  reactionDef,
  summarizeReactions,
  type ReactionCount,
} from "../../../shared/feed-reactions.js";
import { getOrSetCached } from "../utils/edge-cache.js";

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

// Post kind discriminator (gap #1828): text | video | article.
const FEED_KIND_VALUES = ["text", "video", "article"] as const;
type FeedKind = (typeof FEED_KIND_VALUES)[number];

// Resolve the post kind. An explicit body value wins; otherwise infer 'video'
// when the post carries video media so callers that don't send `kind` still
// get the right type for reels.
function resolveKind(value: unknown, media: Array<{ mediaType?: string }>, fallback: FeedKind = "text"): FeedKind {
  if ((FEED_KIND_VALUES as readonly string[]).includes(String(value))) {
    return String(value) as FeedKind;
  }
  if (media.some((m) => m.mediaType === "Video")) return "video";
  return fallback;
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

const { feedPosts, feedPostLikes, feedPostComments, feedPostReports, feedCommentReactions, users, userProfiles } = schema;

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
    .where(inArray(sql`lower(${users.name})`, mentionedNames));

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

/** Notify a post's author that someone reacted (fire-and-forget). Skips
 *  self-reactions. `feed_reaction` has no preference category, so it goes
 *  out as an in-app notification under the channel-level gate. */
async function notifyPostReaction(
  postId: string,
  reactorId: string,
  reactionType: string,
  db: ReturnType<typeof getDb>,
) {
  const [post] = await db
    .select({ userId: feedPosts.userId })
    .from(feedPosts)
    .where(eq(feedPosts.id, postId))
    .limit(1);
  if (!post || post.userId === reactorId) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, reactorId);
  const def = reactionDef(reactionType);
  await emitNotification(
    { repos },
    {
      recipientIds: [post.userId],
      type: "feed_reaction",
      actor,
      title: `${actorName} reacted to your post`,
      message: `${actorName} reacted ${def.emoji} ${def.label} to your post`,
      target: { id: postId, type: "feed_post" },
    },
  );
}

/** Notify a comment's author that someone reacted to their comment. */
async function notifyCommentReaction(
  commentId: string,
  reactorId: string,
  reactionType: string,
  db: ReturnType<typeof getDb>,
) {
  const [comment] = await db
    .select({ userId: feedPostComments.userId, feedPostId: feedPostComments.feedPostId })
    .from(feedPostComments)
    .where(eq(feedPostComments.id, commentId))
    .limit(1);
  if (!comment || comment.userId === reactorId) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, reactorId);
  const def = reactionDef(reactionType);
  await emitNotification(
    { repos },
    {
      recipientIds: [comment.userId],
      type: "feed_reaction",
      actor,
      title: `${actorName} reacted to your comment`,
      message: `${actorName} reacted ${def.emoji} ${def.label} to your comment`,
      target: { id: comment.feedPostId, type: "feed_post" },
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
interface PostDtoSupport {
  authorName: string;
  authorAvatar: string | null;
  likes: Array<{ id: string; userId: string; reactionType: string }>;
  // Professional reaction rollup (count-per-type, display-sorted) + the
  // current viewer's own reaction, so the picker can render its selected
  // state without a second round-trip.
  reactions: ReactionCount[];
  currentUserReaction: string | null;
  commentCount: number;
  repostCount: number;
}

function toPostDto(
  post: typeof feedPosts.$inferSelect,
  support: PostDtoSupport,
  currentUserId: string,
  // Embedded reshare original — typed loosely to avoid a self-referential
  // return-type cycle; it's the same DTO shape with repostOf already null.
  repostOf: Record<string, unknown> | null,
) {
  const { authorName, authorAvatar, likes, reactions, currentUserReaction, commentCount, repostCount } = support;
  return {
    id: post.id,
    userId: post.userId,
    userName: authorName,
    userAvatar: authorAvatar ?? undefined,
    content: post.content,
    kind: (post.kind as FeedKind) ?? "text",
    linkUrl: post.linkUrl ?? undefined,
    linkTitle: post.linkTitle ?? undefined,
    linkDescription: post.linkDescription ?? undefined,
    linkImageUrl: post.linkImageUrl ?? undefined,
    privacy: post.privacy as FeedPrivacy,
    createdAt: new Date(post.createdAt).toISOString(),
    updatedAt: new Date(post.updatedAt).toISOString(),
    media: post.media ?? [],
    tags: post.tags ?? [],
    likes: likes.map((l) => ({ id: l.id, feedPostId: post.id, userId: l.userId, userName: "", reactionType: l.reactionType })),
    comments: [],
    // `likeCount` stays the total reaction count (back-compat); `reactions`
    // is the per-type breakdown and `currentUserReaction` the viewer's pick.
    likeCount: likes.length,
    reactions,
    currentUserReaction,
    commentCount,
    repostCount,
    isLikedByCurrentUser: currentUserReaction != null,
    // Polymorphic surfacing — when set, the renderer mounts the
    // canonical card for `subjectType` (e.g. <ReviewCard>) instead
    // of the default text/link card. `embedPayload` carries the
    // minimal display data so the feed list is one query.
    subjectType: post.subjectType ?? undefined,
    subjectId: post.subjectId ?? undefined,
    embedPayload: post.embedPayload ?? undefined,
    // Reshare. `repostOfId` flags this row as a repost; `repostOf` is the
    // embedded original (one level deep — a repost of a repost still only
    // carries its immediate parent) so the renderer never N+1s.
    repostOfId: post.repostOfId ?? undefined,
    repostOf: repostOf ?? undefined,
  };
}

/** Load the author / avatar / likes / comment-count / reshare-count maps
 *  for a set of post rows in one batched round-trip each (no N+1). Shared
 *  by the main post rows AND the embedded reshare originals. */
async function loadSupport(
  rows: Array<typeof feedPosts.$inferSelect>,
  db: ReturnType<typeof getDb>,
  currentUserId: string,
): Promise<Map<string, PostDtoSupport>> {
  const out = new Map<string, PostDtoSupport>();
  if (rows.length === 0) return out;
  const postIds = rows.map((p) => p.id);
  const authorIds = [...new Set(rows.map((p) => p.userId))];

  const [authorRows, profileRows, likeRows, commentCounts, repostCounts] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)),
    db
      .select({ userId: userProfiles.userId, avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, authorIds)),
    db
      .select({
        id: feedPostLikes.id,
        feedPostId: feedPostLikes.feedPostId,
        userId: feedPostLikes.userId,
        reactionType: feedPostLikes.reactionType,
      })
      .from(feedPostLikes)
      .where(inArray(feedPostLikes.feedPostId, postIds)),
    db
      .select({ feedPostId: feedPostComments.feedPostId, count: sql<number>`count(*)::int` })
      .from(feedPostComments)
      .where(inArray(feedPostComments.feedPostId, postIds))
      .groupBy(feedPostComments.feedPostId),
    db
      .select({ repostOfId: feedPosts.repostOfId, count: sql<number>`count(*)::int` })
      .from(feedPosts)
      .where(inArray(feedPosts.repostOfId, postIds))
      .groupBy(feedPosts.repostOfId),
  ]);

  const authorMap = new Map(authorRows.map((a) => [a.id, a.name]));
  const avatarMap = new Map(profileRows.map((p) => [p.userId, p.avatarUrl ?? null]));
  const likesByPost = new Map<string, Array<{ id: string; userId: string; reactionType: string }>>();
  for (const like of likeRows) {
    if (!likesByPost.has(like.feedPostId)) likesByPost.set(like.feedPostId, []);
    likesByPost.get(like.feedPostId)!.push({
      id: like.id,
      userId: like.userId,
      reactionType: normalizeReaction(like.reactionType),
    });
  }
  const commentCountMap = new Map(commentCounts.map((c) => [c.feedPostId, c.count]));
  const repostCountMap = new Map(
    repostCounts.filter((r) => r.repostOfId).map((r) => [r.repostOfId as string, c2n(r.count)]),
  );

  for (const post of rows) {
    const likes = likesByPost.get(post.id) ?? [];
    out.set(post.id, {
      authorName: authorMap.get(post.userId) ?? "Unknown",
      authorAvatar: avatarMap.get(post.userId) ?? null,
      likes,
      reactions: summarizeReactions(likes),
      currentUserReaction:
        likes.find((l) => l.userId === currentUserId)?.reactionType ?? null,
      commentCount: commentCountMap.get(post.id) ?? 0,
      repostCount: repostCountMap.get(post.id) ?? 0,
    });
  }
  return out;
}

function c2n(v: number): number {
  return Number(v) || 0;
}

async function fetchPostDtos(
  postRows: Array<typeof feedPosts.$inferSelect>,
  currentUserId: string,
  db: ReturnType<typeof getDb>,
) {
  if (postRows.length === 0) return [];

  // Resolve embedded reshare originals (one level deep). Fetch only the
  // originals NOT already present in `postRows` to avoid a redundant query.
  const presentIds = new Set(postRows.map((p) => p.id));
  const originalIds = [
    ...new Set(
      postRows
        .map((p) => p.repostOfId)
        .filter((id): id is string => Boolean(id) && !presentIds.has(id as string)),
    ),
  ];
  const originalRows =
    originalIds.length > 0
      ? await db.select().from(feedPosts).where(inArray(feedPosts.id, originalIds))
      : [];

  const support = await loadSupport([...postRows, ...originalRows], db, currentUserId);

  const originalDtoById = new Map<string, Record<string, unknown>>();
  for (const row of [...postRows, ...originalRows]) {
    if (!originalDtoById.has(row.id)) {
      originalDtoById.set(
        row.id,
        toPostDto(row, support.get(row.id)!, currentUserId, null),
      );
    }
  }

  return postRows.map((post) =>
    toPostDto(
      post,
      support.get(post.id)!,
      currentUserId,
      post.repostOfId ? originalDtoById.get(post.repostOfId) ?? null : null,
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

  // Impression tracking → polymorphic artifact_views (kind 'post'). The
  // helper no-ops when the viewer IS the author, so an owner reading their
  // own post never inflates their stats. Fire-and-forget — telemetry must
  // not slow or break the read.
  c.executionCtx?.waitUntil(
    recordArtifactView({
      artifactKind: "post",
      artifactId: post.id,
      ownerUserId: post.userId,
      viewerId: currentUserId || null,
      ipCountry: ipCountryFromCtx(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    }),
  );

  const [dto] = await fetchPostDtos([post], currentUserId, db);
  return c.json(success(dto), 200);
});

/** POST /api/feed/posts/:postId/reshare — repost (optionally with a quote).
 *  A reshare is a new feed_posts row whose repost_of_id points at the
 *  original; `content` (if any) is the quote commentary shown above the
 *  embedded original. */
feedRoutes.post("/posts/:postId/reshare", async (c) => {
  const originalId = c.req.param("postId");
  const userId = c.var.user.sub;
  const db = getDb();
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  // The original must exist AND be visible to this user — you can't reshare
  // a private post you can't see.
  const visibility = feedVisibilityCondition(userId, isRecruiterLike(c.var.user));
  const [original] = await db
    .select()
    .from(feedPosts)
    .where(sql`${eq(feedPosts.id, originalId)} AND ${visibility}`)
    .limit(1);
  if (!original) return c.json(error("NOT_FOUND", "Post not found"), 404);

  // Reshare the ROOT, not a reshare — keeps the embed one level deep and
  // the reshare count anchored on the original.
  const rootId = original.repostOfId ?? original.id;
  const content = typeof body.content === "string" ? body.content : "";

  const [post] = await db
    .insert(feedPosts)
    .values({
      userId,
      content,
      kind: "text",
      privacy: normalizePrivacy(body.privacy, "Public"),
      media: [],
      tags: buildTagsField(content),
      repostOfId: rootId,
    } as any)
    .returning();

  if (content) {
    c.executionCtx?.waitUntil(createMentionNotifications(content, post.id, userId, db));
  }

  const [dto] = await fetchPostDtos([post], userId, db);
  return c.json(success(dto), 201);
});

/** POST /api/feed/posts */
feedRoutes.post("/posts", async (c) => {
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();
  const content = typeof body.content === "string" ? body.content : "";
  const mediaItems = Array.isArray(body.media)
    ? (body.media as any[]).map((m: any, idx: number) => ({
        id: crypto.randomUUID(),
        mediaType: m.mediaType === "Video" ? "Video" : "Image",
        mediaUrl: m.mediaUrl ?? "",
        thumbnailUrl: m.thumbnailUrl ?? undefined,
        altText: m.altText ?? undefined,
        displayOrder: typeof m.displayOrder === "number" ? m.displayOrder : idx,
      }))
    : [];

  const [post] = await db
    .insert(feedPosts)
    .values({
      userId,
      content,
      kind: resolveKind(body.kind, mediaItems),
      linkUrl: typeof body.linkUrl === "string" ? body.linkUrl : null,
      privacy: normalizePrivacy(body.privacy, "Public"),
      media: mediaItems,
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
      kind: body.kind !== undefined
        ? resolveKind(body.kind, (existing.media ?? []) as Array<{ mediaType?: string }>, existing.kind as FeedKind)
        : existing.kind,
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

/** POST /api/feed/posts/:postId/react — add or change a professional
 *  reaction (like / celebrate / support / insightful / curious / funny).
 *  Idempotent per (post, user): a second react UPDATEs the reaction_type. */
feedRoutes.post("/posts/:postId/react", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reactionType = normalizeReaction(body.reactionType);
  const db = getDb();

  // Was the viewer already reacting? Drives the new-reaction notification
  // (we only notify the author on a NEW reaction, not on a switch).
  const [prior] = await db
    .select({ id: feedPostLikes.id, postUserId: feedPosts.userId })
    .from(feedPostLikes)
    .where(and(eq(feedPostLikes.feedPostId, postId), eq(feedPostLikes.userId, userId)))
    .limit(1);

  const [reaction] = await db
    .insert(feedPostLikes)
    .values({ feedPostId: postId, userId, reactionType })
    .onConflictDoUpdate({
      target: [feedPostLikes.feedPostId, feedPostLikes.userId],
      set: { reactionType },
    })
    .returning();

  if (!prior) {
    c.executionCtx?.waitUntil(notifyPostReaction(postId, userId, reactionType, db));
  }

  return c.json(success({ id: reaction.id, feedPostId: postId, userId, reactionType }), 200);
});

/** DELETE /api/feed/posts/:postId/react — remove the viewer's reaction. */
feedRoutes.delete("/posts/:postId/react", async (c) => {
  const postId = c.req.param("postId");
  const userId = c.var.user.sub;
  const db = getDb();

  await db
    .delete(feedPostLikes)
    .where(and(eq(feedPostLikes.feedPostId, postId), eq(feedPostLikes.userId, userId)));

  return c.json(success(true), 200);
});

/** Batch-load author name/avatar + reaction rollups for a set of comment
 *  rows (no N+1) and shape them into the comment DTO. Shared by the thread
 *  GET and the single-comment create/react responses. */
async function buildCommentDtos(
  rows: Array<typeof feedPostComments.$inferSelect>,
  currentUserId: string,
  db: ReturnType<typeof getDb>,
) {
  if (rows.length === 0) return [];
  const commentIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.userId))];

  const [authorRows, profileRows, reactionRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)),
    db
      .select({ userId: userProfiles.userId, avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, authorIds)),
    db
      .select({
        commentId: feedCommentReactions.commentId,
        userId: feedCommentReactions.userId,
        reactionType: feedCommentReactions.reactionType,
      })
      .from(feedCommentReactions)
      .where(inArray(feedCommentReactions.commentId, commentIds)),
  ]);

  const nameMap = new Map(authorRows.map((a) => [a.id, a.name]));
  const avatarMap = new Map(profileRows.map((p) => [p.userId, p.avatarUrl ?? undefined]));
  const reactionsByComment = new Map<string, Array<{ userId: string; reactionType: string }>>();
  for (const r of reactionRows) {
    if (!reactionsByComment.has(r.commentId)) reactionsByComment.set(r.commentId, []);
    reactionsByComment.get(r.commentId)!.push({ userId: r.userId, reactionType: normalizeReaction(r.reactionType) });
  }

  return rows.map((r) => {
    const rx = reactionsByComment.get(r.id) ?? [];
    return {
      id: r.id,
      feedPostId: r.feedPostId,
      userId: r.userId,
      userName: nameMap.get(r.userId) ?? "Unknown",
      userAvatar: avatarMap.get(r.userId),
      content: r.content,
      reactions: summarizeReactions(rx),
      reactionCount: rx.length,
      currentUserReaction: rx.find((x) => x.userId === currentUserId)?.reactionType ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  });
}

/** GET /api/feed/posts/:postId/comments */
feedRoutes.get("/posts/:postId/comments", async (c) => {
  const postId = c.req.param("postId");
  const currentUserId = c.var.user?.sub ?? "";
  const db = getDb();

  const rows = await db
    .select()
    .from(feedPostComments)
    .where(eq(feedPostComments.feedPostId, postId))
    .orderBy(desc(feedPostComments.createdAt));

  return c.json(success(await buildCommentDtos(rows, currentUserId, db)), 200);
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

  const [dto] = await buildCommentDtos([comment], userId, db);
  return c.json(success(dto), 201);
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

  const [dto] = await buildCommentDtos([updated], userId, db);
  return c.json(success(dto), 200);
});

/** POST /api/feed/comments/:commentId/react — add/change a reaction to a
 *  comment (same professional set as posts). Idempotent per (comment, user). */
feedRoutes.post("/comments/:commentId/react", async (c) => {
  const commentId = c.req.param("commentId");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reactionType = normalizeReaction(body.reactionType);
  const db = getDb();

  const [prior] = await db
    .select({ id: feedCommentReactions.id })
    .from(feedCommentReactions)
    .where(and(eq(feedCommentReactions.commentId, commentId), eq(feedCommentReactions.userId, userId)))
    .limit(1);

  const [reaction] = await db
    .insert(feedCommentReactions)
    .values({ commentId, userId, reactionType })
    .onConflictDoUpdate({
      target: [feedCommentReactions.commentId, feedCommentReactions.userId],
      set: { reactionType },
    })
    .returning();

  if (!prior) {
    c.executionCtx?.waitUntil(notifyCommentReaction(commentId, userId, reactionType, db));
  }

  return c.json(success({ id: reaction.id, commentId, userId, reactionType }), 200);
});

/** DELETE /api/feed/comments/:commentId/react — remove the viewer's reaction. */
feedRoutes.delete("/comments/:commentId/react", async (c) => {
  const commentId = c.req.param("commentId");
  const userId = c.var.user.sub;
  const db = getDb();

  await db
    .delete(feedCommentReactions)
    .where(and(eq(feedCommentReactions.commentId, commentId), eq(feedCommentReactions.userId, userId)));

  return c.json(success(true), 200);
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

/** GET /api/feed/trending-posts — public posts ranked by recent engagement
 *  (weighted reactions + reposts + comments) over the last 21 days. Powers
 *  the "Trending" sidebar; clicking a row deep-links to /feed/:id.
 *
 *  Anonymous-visible (Public posts only, community excluded), so it is
 *  served through the shared read-through cache with a short TTL — ranking
 *  is slow-changing and a per-reaction invalidation would be far heavier
 *  than a 5-minute refresh window. */
feedRoutes.get("/trending-posts", async (c) => {
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") ?? "5") || 5));
  const db = getDb();

  // Reaction weights live in the shared SSoT — build the CASE from there so
  // the ranking can't drift from the picker. Values are code constants
  // (no user input), so raw interpolation is safe.
  const reactionWeightCase = FEED_REACTIONS.map(
    (r) => `WHEN '${r.type}' THEN ${r.weight}`,
  ).join(" ");

  const trending = await getOrSetCached<Array<Record<string, unknown>>>({
    key: `feed:trending-posts:${limit}`,
    ttlSeconds: 300,
    loader: async () => {
      const rows = await db.execute(sql`
        WITH reaction_stats AS (
          SELECT feed_post_id,
                 COUNT(*)::int AS reaction_count,
                 COALESCE(SUM(CASE reaction_type ${sql.raw(reactionWeightCase)} ELSE 1 END), 0) AS reaction_score
          FROM feed_post_likes
          GROUP BY feed_post_id
        ),
        comment_stats AS (
          SELECT feed_post_id, COUNT(*)::int AS comment_count
          FROM feed_post_comments
          GROUP BY feed_post_id
        ),
        repost_stats AS (
          SELECT repost_of_id, COUNT(*)::int AS repost_count
          FROM feed_posts
          WHERE repost_of_id IS NOT NULL
          GROUP BY repost_of_id
        )
        SELECT
          p.id,
          p.user_id        AS "userId",
          u.name           AS "userName",
          up.avatar_url    AS "userAvatar",
          left(p.content, 140) AS "excerpt",
          p.kind,
          p.created_at     AS "createdAt",
          COALESCE(rs.reaction_count, 0) AS "reactionCount",
          COALESCE(cs.comment_count, 0)  AS "commentCount",
          COALESCE(ps.repost_count, 0)   AS "repostCount",
          (COALESCE(rs.reaction_score, 0)
            + 2 * COALESCE(ps.repost_count, 0)
            + 1.5 * COALESCE(cs.comment_count, 0)) AS "score"
        FROM feed_posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN user_profiles up ON up.user_id = p.user_id
        LEFT JOIN reaction_stats rs ON rs.feed_post_id = p.id
        LEFT JOIN comment_stats  cs ON cs.feed_post_id = p.id
        LEFT JOIN repost_stats   ps ON ps.repost_of_id = p.id
        WHERE p.privacy = 'Public'
          AND p.repost_of_id IS NULL
          AND p.created_at > now() - interval '21 days'
          AND NOT (p.tags::text LIKE '%"company:%')
        ORDER BY "score" DESC, p.created_at DESC
        LIMIT ${limit}
      `);
      // Keep only posts with any engagement — a brand-new feed shouldn't
      // surface a "Trending" box full of zero-engagement posts.
      return (rows.rows as Array<Record<string, unknown>>).filter(
        (r) => Number(r.score) > 0,
      );
    },
  });

  return c.json(success(trending), 200);
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
