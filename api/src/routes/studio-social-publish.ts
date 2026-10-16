/**
 * POST /api/studio/projects/:projectId/publish/social/:platform
 *
 * Post a project's rendered video to the caller's own YouTube channel,
 * TikTok, Instagram, X, Facebook Page or LinkedIn account. Thin HTTP layer
 * over `publishProjectVideo` (ownership, render, runSelfPublishGate — the
 * plan's channel cap, connection, token refresh — publish, publication
 * record); this file only validates input and maps the use case's error kinds.
 *
 * GET /api/studio/social/tiktok/creator-info
 *
 * The caller's TikTok account state for the Post dock's TikTok settings form.
 *
 * The Post dock's "Write it for me" caption AI is POST
 * /api/studio/social/generate-caption (studio-features.ts) — caption help
 * only; the post itself goes through here.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { isVideoPublishPlatform } from "../../../shared/social-platforms.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  publishProjectVideo,
  PublishProjectVideoError,
  type PublishProjectVideoErrorKind,
} from "../services/social/publish-project-video.js";
import { channelLimitResponse } from "../services/studio/post-channel-gate.js";
import { getTikTokCreatorInfo } from "../services/social/tiktok-creator-info.js";
import { SocialPublishError } from "../services/social/publishers/index.js";

export const studioSocialPublishRoutes = new Hono<AppEnv>();

const TikTokSettingsSchema = z.object({
  privacyLevel: z.string().min(1).max(64),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  discloseContent: z.boolean(),
  yourBrand: z.boolean(),
  brandedContent: z.boolean(),
});

const YouTubeSettingsSchema = z.object({
  privacy: z.enum(["public", "private", "unlisted"]).default("unlisted"),
  tags: z.array(z.string().max(30)).max(15).optional(),
  shorts: z.boolean().optional(),
});

const BodySchema = z.object({
  title: z.string().min(1).max(100),
  caption: z.string().max(5000).default(""),
  /** Required for TikTok: the creator picks these in the Post dock (TikTok's
   *  sharing guidelines forbid posting with defaulted settings). */
  tiktok: TikTokSettingsSchema.optional(),
  /** YouTube privacy / tags / Shorts. Absent → unlisted. */
  youtube: YouTubeSettingsSchema.optional(),
  /** A fitted cut of this project to post instead of the master (#2045). */
  variantVideoId: UuidLikeSchema.optional(),
});

const STATUS: Record<Exclude<PublishProjectVideoErrorKind, "CHANNEL_LIMIT">, 403 | 404 | 409 | 422 | 502> = {
  PROJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VIDEO_NOT_READY: 409,
  INVALID_VARIANT: 422,
  CONSENT_REQUIRED: 403,
  NOT_CONNECTED: 409,
  ACCOUNT_UNSUPPORTED: 422,
  PUBLISH_FAILED: 502,
};

studioSocialPublishRoutes.post("/projects/:projectId/publish/social/:platform", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isVideoPublishPlatform(platform)) return c.json(error("NOT_FOUND", `Unknown platform: ${platform}`), 404);
  const parsed = BodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid publish request"), 400);
  if (platform === "tiktok" && !parsed.data.tiktok) {
    return c.json(error("VALIDATION_ERROR", "Choose your TikTok post settings first"), 400);
  }

  const user = c.var.user;
  try {
    const publication = await publishProjectVideo({
      actor: { userId: user.sub },
      projectId: c.req.param("projectId"),
      platform,
      title: parsed.data.title,
      caption: parsed.data.caption,
      tiktok: parsed.data.tiktok,
      youtube: parsed.data.youtube,
      variantVideoId: parsed.data.variantVideoId,
      env: c.env,
    });
    return c.json(success({ publication }));
  } catch (err) {
    if (!(err instanceof PublishProjectVideoError)) throw err;
    if (err.kind === "CHANNEL_LIMIT") return channelLimitResponse(c);
    // NOT_CONNECTED carries the platform-specific code the dock maps to "connect again".
    const code = err.kind === "NOT_CONNECTED" ? "SOCIAL_NOT_CONNECTED" : err.kind;
    return c.json(error(code, err.message, err.details), STATUS[err.kind]);
  }
});

studioSocialPublishRoutes.get("/social/tiktok/creator-info", async (c) => {
  try {
    const creator = await getTikTokCreatorInfo(c.var.user.sub, c.env);
    if (!creator) return c.json(error("SOCIAL_NOT_CONNECTED", "Connect your TikTok account first."), 409);
    return c.json(success({ creator }));
  } catch (err) {
    if (!(err instanceof SocialPublishError)) throw err;
    if (err.kind === "NOT_AUTHORIZED") return c.json(error("SOCIAL_NOT_CONNECTED", err.message), 409);
    return c.json(error("PLATFORM_ERROR", err.message), 502);
  }
});
