/**
 * /api/distribution — scheduled posts (#2047) and off-platform reach (#2048).
 *
 *   POST /jobs                              schedule one post to several
 *                                           destinations (Distribution Hub,
 *                                           Post dock "Schedule")
 *   GET  /jobs?view=upcoming|sent|failed    the caller's jobs (cached)
 *   POST /jobs/:jobId/cancel                a job that hasn't started
 *   POST /jobs/:jobId/retry                 a failed / cancelled job
 *   GET  /projects/:projectId/reach         a project's off-platform reach
 *                                           (cached, owner only)
 *   POST /projects/:projectId/manual-post   "Mark as posted": record a post
 *                                           the creator uploaded themselves
 *
 * Thin HTTP layer: validates input and maps the use cases' error kinds
 * (services/distribution/**).
 *
 * AI posting-agent routes live in posting-agent-routes.ts and are mounted
 * below so this file stays the Hub queue surface.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  DISTRIBUTION_DESTINATIONS,
  DISTRIBUTION_LANES,
  isPublishJobView,
  MAX_DESTINATIONS_PER_POST,
} from "../../../shared/social-publish-jobs.js";
import {
  cancelPost,
  listPosts,
  retryPost,
  ScheduleError,
  schedulePosts,
  type ScheduleErrorKind,
} from "../services/distribution/schedule-publish-jobs.js";
import { projectOffPlatformReach, ReachAccessError } from "../services/distribution/metrics/read-post-metrics.js";
import { ManualPostError, markPostedManually, type ManualPostErrorKind } from "../services/distribution/manual-post.js";
import { postingAgentRoutes } from "./posting-agent-routes.js";

export const distributionRoutes = new Hono<AppEnv>();
distributionRoutes.route("/", postingAgentRoutes);

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
  privacy: z.enum(["public", "private", "unlisted"]),
  tags: z.array(z.string().max(30)).max(15).optional(),
  shorts: z.boolean().optional(),
});

const ScheduleSchema = z.object({
  projectId: UuidLikeSchema,
  caption: z.string().max(5000).default(""),
  scheduledAt: z.string().datetime({ offset: true }),
  destinations: z
    .array(
      z.object({
        destination: z.enum(DISTRIBUTION_DESTINATIONS),
        lane: z.enum(DISTRIBUTION_LANES),
        variantVideoId: UuidLikeSchema.optional(),
        settings: z.object({ tiktok: TikTokSettingsSchema.optional(), youtube: YouTubeSettingsSchema.optional() }).optional(),
        /** Per-destination overrides (PRD §4.2); limits are checked per network by the use case. */
        caption: z.string().max(5000).optional(),
        title: z.string().max(255).optional(),
      }),
    )
    .min(1)
    .max(MAX_DESTINATIONS_PER_POST),
});

const STATUS: Record<ScheduleErrorKind, 400 | 403 | 404 | 409 | 422> = {
  INVALID: 400,
  IN_PAST: 422,
  TOO_FAR_AHEAD: 422,
  ACCOUNT_REQUIRED: 403,
  NO_DESTINATIONS: 400,
  TOO_MANY_DESTINATIONS: 400,
  INVALID_LANE: 400,
  CAPTION_TOO_LONG: 422,
  TITLE_TOO_LONG: 422,
  TITLE_NOT_SUPPORTED: 422,
  TIKTOK_SETTINGS_REQUIRED: 400,
  PROJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VIDEO_NOT_READY: 409,
  INVALID_VARIANT: 422,
  NOT_FOUND: 404,
  ALREADY_SCHEDULED: 409,
};

/** ScheduleError → its envelope; anything else rethrows to the app handler. */
function scheduleFailure(c: Context<AppEnv>, err: unknown) {
  if (!(err instanceof ScheduleError)) throw err;
  return c.json(error(err.kind, err.message), STATUS[err.kind]);
}

distributionRoutes.post("/jobs", async (c) => {
  const parsed = ScheduleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid schedule request"), 400);
  const user = c.var.user;
  try {
    const result = await schedulePosts({
      actor: { userId: user.sub, isGuest: !!user.guest },
      projectId: parsed.data.projectId,
      caption: parsed.data.caption,
      scheduledAt: new Date(parsed.data.scheduledAt),
      destinations: parsed.data.destinations,
    });
    return c.json(
      success({
        scheduled: result.jobs.map((j) => ({ id: j.id, destination: j.destination, lane: j.lane })),
        skipped: result.skipped,
      }),
      201,
    );
  } catch (err) {
    return scheduleFailure(c, err);
  }
});

distributionRoutes.get("/jobs", async (c) => {
  const view = c.req.query("view") ?? "upcoming";
  if (!isPublishJobView(view)) return c.json(error("VALIDATION_ERROR", "Unknown list"), 400);
  return c.json(success({ jobs: await listPosts(c.var.user.sub, view) }));
});

/** A job id that isn't a uuid can't name a job (and must not reach the DB). */
function badJobId(c: Context<AppEnv>) {
  return !UuidLikeSchema.safeParse(c.req.param("jobId")).success;
}

distributionRoutes.post("/jobs/:jobId/cancel", async (c) => {
  if (badJobId(c)) return c.json(error("NOT_FOUND", "Post not found"), 404);
  try {
    await cancelPost(c.var.user.sub, c.req.param("jobId"));
    return c.json(success({ cancelled: true }));
  } catch (err) {
    return scheduleFailure(c, err);
  }
});

distributionRoutes.post("/jobs/:jobId/retry", async (c) => {
  if (badJobId(c)) return c.json(error("NOT_FOUND", "Post not found"), 404);
  try {
    await retryPost(c.var.user.sub, c.req.param("jobId"));
    return c.json(success({ queued: true }));
  } catch (err) {
    return scheduleFailure(c, err);
  }
});

distributionRoutes.get("/projects/:projectId/reach", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("projectId")).success) return c.json(error("PROJECT_NOT_FOUND", "Project not found"), 404);
  try {
    return c.json(success(await projectOffPlatformReach(c.var.user.sub, c.req.param("projectId"))));
  } catch (err) {
    if (!(err instanceof ReachAccessError)) throw err;
    return c.json(error(err.kind, err.message), err.kind === "FORBIDDEN" ? 403 : 404);
  }
});

const ManualPostSchema = z.object({
  destination: z.string().min(1).max(48),
  url: z.string().min(8).max(2000),
});

const MANUAL_STATUS: Record<ManualPostErrorKind, 400 | 403 | 404 | 422> = {
  PROJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNKNOWN_DESTINATION: 400,
  INVALID_URL: 422,
};

distributionRoutes.post("/projects/:projectId/manual-post", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("PROJECT_NOT_FOUND", "Project not found"), 404);
  const parsed = ManualPostSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request"), 400);
  try {
    const result = await markPostedManually({ actorUserId: c.var.user.sub, projectId, ...parsed.data });
    return c.json(success(result), 201);
  } catch (err) {
    if (!(err instanceof ManualPostError)) throw err;
    return c.json(error(err.kind, err.message), MANUAL_STATUS[err.kind]);
  }
});
