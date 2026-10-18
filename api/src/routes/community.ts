import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import {
  COMMUNITY_CHANNELS,
  createCommunityPost,
  deleteCommunityPost,
  listChannelPosts,
  listChannels,
} from "../services/community/employeeCommunity.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

/**
 * Employee Community — Pro Employer feature.
 *
 * Provides a company-scoped, channel-based community feed distinct from the
 * public professional feed. Channels map to the Engage / Inform / Inspire
 * framework shown on the pricing page.
 *
 * Routes are under /api/community and require both authentication and a
 * Pro subscription (enforced via requirePro middleware). Rules live in
 * services/community/employeeCommunity.ts.
 */
export const communityRoutes = new Hono<AppEnv>();

const CreatePostSchema = z.object({
  companyId: UuidLikeSchema,
  channel: z.enum(COMMUNITY_CHANNELS).default("general"),
  content: z.string().min(1).max(10000),
  media: z.array(z.object({ url: z.string().url(), type: z.string() })).default([]),
  isPinned: z.boolean().default(false),
});

// GET /api/community/posts?companyId=&channel=
communityRoutes.get("/posts", requirePro("Employee Community"), async (c) => {
  const userId = requireUser(c);
  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);
  const channel = c.req.query("channel") ?? "general";
  return c.json(success(await listChannelPosts(userId, companyId, channel)), 200);
});

// POST /api/community/posts
communityRoutes.post("/posts", requirePro("Employee Community"), validateJson(CreatePostSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const post = await createCommunityPost(userId, c.req.valid("json"));
  return c.json(success(post), 201);
});

// DELETE /api/community/posts/:id
communityRoutes.delete("/posts/:id", requirePro("Employee Community"), async (c) => {
  const userId = requireUser(c);
  await deleteCommunityPost(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// GET /api/community/channels?companyId= — list the channels
communityRoutes.get("/channels", requirePro("Employee Community"), async (c) => {
  const userId = requireUser(c);
  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);
  return c.json(success(await listChannels(userId, companyId)), 200);
});
