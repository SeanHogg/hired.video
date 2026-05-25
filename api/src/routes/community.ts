import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";

/**
 * Employee Community — Pro Employer feature.
 *
 * Provides a company-scoped, channel-based community feed distinct from the
 * public professional feed. Channels map to the Engage / Inform / Inspire
 * framework shown on the pricing page.
 *
 * Routes are under /api/community and require both authentication and a
 * Pro subscription (enforced via requirePro middleware).
 */
export const communityRoutes = new Hono<AppEnv>();

const VALID_CHANNELS = ["engage", "inform", "inspire", "general"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

const CreatePostSchema = z.object({
  companyId: z.string().uuid(),
  channel: z.enum(VALID_CHANNELS).default("general"),
  content: z.string().min(1).max(10000),
  media: z.array(z.object({ url: z.string().url(), type: z.string() })).default([]),
  isPinned: z.boolean().default(false),
});

// Helper: verify user is an admin/member of the company
async function verifyCompanyMembership(userId: string, companyId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.userCompanyRoleAssociations.id })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.companyId, companyId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// GET /api/community/posts?companyId=&channel=
// ---------------------------------------------------------------------------
communityRoutes.get("/posts", requirePro("Employee Community"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const isMember = await verifyCompanyMembership(userId, companyId);
  if (!isMember) return c.json(error("FORBIDDEN", "You are not a member of this company"), 403);

  const channel = (c.req.query("channel") ?? "general") as Channel;
  const db = getDb();

  // Community posts are stored in feedPosts with a "company:{companyId}:{channel}" tag
  const tag = `company:${companyId}:${channel}`;
  const posts = await db
    .select()
    .from(schema.feedPosts)
    .where(eq(schema.feedPosts.privacy, "Private")) // community posts use Privacy=Private
    .orderBy(desc(schema.feedPosts.createdAt))
    .limit(50);

  // Filter to posts that have the company tag (jsonb contains)
  const filtered = posts.filter((p) => Array.isArray(p.tags) && (p.tags as unknown as string[]).includes(tag));

  return c.json(success({ channel, companyId, posts: filtered }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/community/posts
// ---------------------------------------------------------------------------
communityRoutes.post("/posts", requirePro("Employee Community"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const isMember = await verifyCompanyMembership(userId, parsed.data.companyId);
  if (!isMember) return c.json(error("FORBIDDEN", "You are not a member of this company"), 403);

  const db = getDb();
  const tag = `company:${parsed.data.companyId}:${parsed.data.channel}`;

  const [post] = await db
    .insert(schema.feedPosts)
    .values({
      userId,
      content: parsed.data.content,
      privacy: "Private", // hidden from public feed
      media: parsed.data.media as any,
      tags: [tag, `channel:${parsed.data.channel}`] as any,
    } as any)
    .returning();

  // Notify all company members except the poster (#19)
  const members = await db
    .select({ userId: schema.userCompanyRoleAssociations.userId })
    .from(schema.userCompanyRoleAssociations)
    .where(eq(schema.userCompanyRoleAssociations.companyId, parsed.data.companyId));

  const recipientIds = members.map((m) => m.userId).filter((id) => id !== userId);
  if (recipientIds.length > 0) {
    await db
      .insert(schema.notifications)
      .values(
        recipientIds.map((rid) => ({
          userId: rid,
          type: "community_post",
          title: "New community post",
          message: `A new post was shared in the ${parsed.data.channel} channel.`,
          data: { postId: post.id, channel: parsed.data.channel, companyId: parsed.data.companyId } as any,
        })),
      )
      .catch(() => undefined); // fire-and-forget
  }

  return c.json(success(post), 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/community/posts/:id
// ---------------------------------------------------------------------------
communityRoutes.delete("/posts/:id", requirePro("Employee Community"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [post] = await db
    .select({ id: schema.feedPosts.id, userId: schema.feedPosts.userId })
    .from(schema.feedPosts)
    .where(and(eq(schema.feedPosts.id, c.req.param("id")), eq(schema.feedPosts.userId, userId)))
    .limit(1);

  if (!post) return c.json(error("NOT_FOUND", "Post not found"), 404);

  await db.delete(schema.feedPosts).where(eq(schema.feedPosts.id, post.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/community/channels?companyId= — list channels with post counts
// ---------------------------------------------------------------------------
communityRoutes.get("/channels", requirePro("Employee Community"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const isMember = await verifyCompanyMembership(userId, companyId);
  if (!isMember) return c.json(error("FORBIDDEN", "You are not a member of this company"), 403);

  return c.json(
    success({
      companyId,
      channels: VALID_CHANNELS.map((ch) => ({
        id: ch,
        name: ch.charAt(0).toUpperCase() + ch.slice(1),
        description: {
          engage: "Two-way conversations, polls, and team discussions",
          inform: "Company updates, announcements, and news",
          inspire: "Recognition, wins, and motivational content",
          general: "General company communication",
        }[ch],
        tag: `company:${companyId}:${ch}`,
      })),
    }),
    200,
  );
});

communityRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Community route not found" } }, 404),
);
