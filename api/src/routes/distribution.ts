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
  schedulePosts,
} from "../services/distribution/schedule-publish-jobs.js";
import { projectOffPlatformReach } from "../services/distribution/metrics/read-post-metrics.js";
import { markPostedManually } from "../services/distribution/manual-post.js";
import { postingAgentRoutes } from "./posting-agent-routes.js";
import { validateJson } from "./helpers/validate.js";

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

distributionRoutes.post("/jobs", validateJson(ScheduleSchema, () => error("VALIDATION_ERROR", "Invalid schedule request"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const user = c.var.user;
  const result = await schedulePosts({
    actor: { userId: user.sub, isGuest: !!user.guest },
    projectId: body.projectId,
    caption: body.caption,
    scheduledAt: new Date(body.scheduledAt),
    destinations: body.destinations,
  });
  return c.json(
    success({
      scheduled: result.jobs.map((j) => ({ id: j.id, destination: j.destination, lane: j.lane })),
      skipped: result.skipped,
    }),
    201,
  );
});

distributionRoutes.get("/jobs", async (c) => {
  const view = c.req.query("view") ?? "upcoming";
  if (!isPublishJobView(view)) return c.json(error("VALIDATION_ERROR", "Unknown list"), 400);
  return c.json(success({ jobs: await listPosts(c.var.userId, view) }));
});

/** A job id that isn't a uuid can't name a job (and must not reach the DB). */
function badJobId(c: Context<AppEnv>) {
  return !UuidLikeSchema.safeParse(c.req.param("jobId")).success;
}

distributionRoutes.post("/jobs/:jobId/cancel", async (c) => {
  if (badJobId(c)) return c.json(error("NOT_FOUND", "Post not found"), 404);
  await cancelPost(c.var.userId, c.req.param("jobId"));
  return c.json(success({ cancelled: true }));
});

distributionRoutes.post("/jobs/:jobId/retry", async (c) => {
  if (badJobId(c)) return c.json(error("NOT_FOUND", "Post not found"), 404);
  await retryPost(c.var.userId, c.req.param("jobId"));
  return c.json(success({ queued: true }));
});

distributionRoutes.get("/projects/:projectId/reach", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("projectId")).success) return c.json(error("PROJECT_NOT_FOUND", "Project not found"), 404);
  return c.json(success(await projectOffPlatformReach(c.var.userId, c.req.param("projectId"))));
});

const ManualPostSchema = z.object({
  destination: z.string().min(1).max(48),
  url: z.string().min(8).max(2000),
});

distributionRoutes.post("/projects/:projectId/manual-post", validateJson(ManualPostSchema, () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("PROJECT_NOT_FOUND", "Project not found"), 404);
  const body = c.req.valid("json");
  const result = await markPostedManually({ actorUserId: c.var.userId, projectId, ...body });
  return c.json(success(result), 201);
});
