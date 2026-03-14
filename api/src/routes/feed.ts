import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const feedRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

const nowIso = () => new Date().toISOString();

type FeedPostLike = {
  id: string;
  feedPostId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  createdAt: string;
};

type FeedPostComment = {
  id: string;
  feedPostId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type FeedPost = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUrl?: string;
  privacy: "Public" | "Private" | "Connections";
  createdAt: string;
  updatedAt: string;
  media: Array<{
    id: string;
    feedPostId: string;
    mediaType: "Image" | "Video";
    mediaUrl: string;
    thumbnailUrl?: string;
    altText?: string;
    displayOrder: number;
    createdAt: string;
  }>;
  tags: Array<{
    id: string;
    feedPostId: string;
    tagType: "Hashtag" | "Mention";
    tagValue: string;
    mentionedUserId?: string;
    position: number;
    createdAt: string;
  }>;
  likes: FeedPostLike[];
  comments: FeedPostComment[];
  likeCount: number;
  commentCount: number;
  isLikedByCurrentUser: boolean;
};

function createPost(body: Record<string, unknown>, existing?: FeedPost): FeedPost {
  const now = nowIso();
  const postId = existing?.id ?? crypto.randomUUID();
  const likes = existing?.likes ?? [];
  const comments = existing?.comments ?? [];

  return {
    id: postId,
    userId: existing?.userId ?? "",
    userName: existing?.userName ?? "",
    userAvatar: existing?.userAvatar,
    content: typeof body.content === "string" ? body.content : existing?.content ?? "",
    linkUrl: typeof body.linkUrl === "string" ? body.linkUrl : existing?.linkUrl,
    linkTitle: existing?.linkTitle,
    linkDescription: existing?.linkDescription,
    linkImageUrl: existing?.linkImageUrl,
    privacy:
      body.privacy === "Private" || body.privacy === "Connections" || body.privacy === "Public"
        ? body.privacy
        : existing?.privacy ?? "Public",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    media: Array.isArray(body.media)
      ? body.media.map((m, idx) => {
          const media = (m ?? {}) as Record<string, unknown>;
          return {
            id: crypto.randomUUID(),
            feedPostId: postId,
            mediaType: media.mediaType === "Video" ? "Video" : "Image",
            mediaUrl: typeof media.mediaUrl === "string" ? media.mediaUrl : "",
            thumbnailUrl: typeof media.thumbnailUrl === "string" ? media.thumbnailUrl : undefined,
            altText: typeof media.altText === "string" ? media.altText : undefined,
            displayOrder: typeof media.displayOrder === "number" ? media.displayOrder : idx,
            createdAt: now,
          };
        })
      : existing?.media ?? [],
    tags: existing?.tags ?? [],
    likes,
    comments,
    likeCount: likes.length,
    commentCount: comments.length,
    isLikedByCurrentUser: false,
  };
}

const posts = new Map<string, FeedPost>();

feedRoutes.get("/posts", (c) => {
  const pageNumber = Number(c.req.query("pageNumber") ?? "1") || 1;
  const pageSize = Number(c.req.query("pageSize") ?? "20") || 20;

  const all = Array.from(posts.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const start = (pageNumber - 1) * pageSize;
  const slice = all.slice(start, start + pageSize);

  return c.json(
    ok({
      posts: slice,
      totalCount: all.length,
      pageNumber,
      pageSize,
      hasNextPage: start + pageSize < all.length,
      hasPreviousPage: pageNumber > 1,
    }),
    200,
  );
});

feedRoutes.get("/posts/:postId", (c) => {
  const postId = c.req.param("postId");
  const post = posts.get(postId);
  if (!post) {
    return c.json(ok(createPost({ content: "", privacy: "Public", media: [] }, { ...createPost({}, undefined), id: postId })), 200);
  }
  return c.json(ok(post), 200);
});

feedRoutes.post("/posts", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const post = createPost(body);
  posts.set(post.id, post);
  return c.json(ok(post), 201);
});

feedRoutes.put("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = posts.get(postId);
  const updated = createPost(body, existing ?? { ...createPost({}, undefined), id: postId });
  posts.set(postId, updated);
  return c.json(ok(updated), 200);
});

feedRoutes.delete("/posts/:postId", (c) => {
  posts.delete(c.req.param("postId"));
  return c.json(ok(true), 200);
});

feedRoutes.post("/posts/:postId/like", (c) => {
  const postId = c.req.param("postId");
  const existing = posts.get(postId);
  const basePost = existing ?? { ...createPost({}, undefined), id: postId };

  const like: FeedPostLike = {
    id: crypto.randomUUID(),
    feedPostId: postId,
    userId: "",
    userName: "",
    createdAt: nowIso(),
  };

  const likes = [...basePost.likes, like];
  const updated: FeedPost = {
    ...basePost,
    likes,
    likeCount: likes.length,
    isLikedByCurrentUser: true,
    updatedAt: nowIso(),
  };

  posts.set(postId, updated);
  return c.json(ok(like), 200);
});

feedRoutes.delete("/posts/:postId/like", (c) => {
  const postId = c.req.param("postId");
  const existing = posts.get(postId);
  if (existing) {
    const likes = existing.likes.slice(0, Math.max(0, existing.likes.length - 1));
    posts.set(postId, {
      ...existing,
      likes,
      likeCount: likes.length,
      isLikedByCurrentUser: false,
      updatedAt: nowIso(),
    });
  }
  return c.json(ok(true), 200);
});

feedRoutes.post("/comments", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const postId = typeof body.feedPostId === "string" ? body.feedPostId : "";
  const existing = posts.get(postId) ?? { ...createPost({}, undefined), id: postId };

  const comment: FeedPostComment = {
    id: crypto.randomUUID(),
    feedPostId: postId,
    userId: "",
    userName: "",
    content: typeof body.content === "string" ? body.content : "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const comments = [...existing.comments, comment];
  posts.set(postId, {
    ...existing,
    comments,
    commentCount: comments.length,
    updatedAt: nowIso(),
  });

  return c.json(ok(comment), 201);
});

feedRoutes.put("/comments/:commentId", async (c) => {
  const commentId = c.req.param("commentId");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  for (const [postId, post] of posts.entries()) {
    const idx = post.comments.findIndex((it) => it.id === commentId);
    if (idx >= 0) {
      const updatedComment: FeedPostComment = {
        ...post.comments[idx],
        content: typeof body.content === "string" ? body.content : post.comments[idx].content,
        updatedAt: nowIso(),
      };
      const comments = [...post.comments];
      comments[idx] = updatedComment;
      posts.set(postId, { ...post, comments, updatedAt: nowIso() });
      return c.json(ok(updatedComment), 200);
    }
  }

  return c.json(
    ok({
      id: commentId,
      feedPostId: "",
      userId: "",
      userName: "",
      content: typeof body.content === "string" ? body.content : "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }),
    200,
  );
});

feedRoutes.delete("/comments/:commentId", (c) => {
  const commentId = c.req.param("commentId");
  for (const [postId, post] of posts.entries()) {
    const filtered = post.comments.filter((it) => it.id !== commentId);
    if (filtered.length !== post.comments.length) {
      posts.set(postId, {
        ...post,
        comments: filtered,
        commentCount: filtered.length,
        updatedAt: nowIso(),
      });
      break;
    }
  }
  return c.json(ok(true), 200);
});

feedRoutes.get("/search", (c) => {
  const searchTerm = (c.req.query("searchTerm") ?? "").toLowerCase();
  const pageNumber = Number(c.req.query("pageNumber") ?? "1") || 1;
  const pageSize = Number(c.req.query("pageSize") ?? "20") || 20;

  const matches = Array.from(posts.values()).filter((p) => p.content.toLowerCase().includes(searchTerm));
  const start = (pageNumber - 1) * pageSize;
  const slice = matches.slice(start, start + pageSize);

  return c.json(
    ok({
      posts: slice,
      totalCount: matches.length,
      pageNumber,
      pageSize,
      hasNextPage: start + pageSize < matches.length,
      hasPreviousPage: pageNumber > 1,
    }),
    200,
  );
});

feedRoutes.post("/link-preview", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = typeof body.url === "string" ? body.url : "";
  return c.json(
    ok({
      url,
      title: "Link Preview",
      description: "Preview data is currently stubbed.",
      imageUrl: undefined,
      siteName: undefined,
    }),
    200,
  );
});

feedRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Feed routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
