/**
 * Sends ONE claimed scheduled post (#2047) through the path a "post now"
 * takes — never a parallel publish implementation:
 *
 *   lane self, a network   → publishProjectVideo (ownership → render →
 *                             runSelfPublishGate → adapter → publication row)
 *   lane managed           → submitForPromotion (Lane A review queue)
 *   destination feed       → crossPostToFeed (a feed_posts row)
 *
 * Fitted cuts (#2045): the client rendered the cut before scheduling (all
 * encoding is in the browser) and the job names it. At send time the cut is
 * used only while it still shows what the master shows; after a re-render
 * (or once the cut was reclaimed) the master is posted instead.
 *
 * Errors come back as PublishJobError, `permanent` when retrying can't help.
 * Also: `producedRecord`, the drainer's "did an earlier attempt already
 * post this?" check.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { studioProjects } from "../../db/schema/resumes.js";
import { videos } from "../../db/schema/videos.js";
import {
  FEED_DESTINATION,
  isNetworkDestination,
  isPromotionDestination,
  type DistributionDestination,
} from "../../../../shared/social-publish-jobs.js";
import type { TikTokPostSettings } from "../../../../shared/tiktok-post-settings.js";
import * as jobs from "../../repositories/socialPublishJobRepository.js";
import { agentJobNeedsPreparedClip } from "../../../../shared/posting-agent.js";
import { currentCutVideoId } from "../studio/render-variants.js";
import { requireCompiledVideo, PublishVideoError } from "../studio/compiled-video.js";
import {
  publishProjectVideo,
  PublishProjectVideoError,
} from "../social/publish-project-video.js";
import type { SocialPublisherEnv } from "../social/build-social-publisher.js";
import type { YouTubePostSettings } from "../social/publishers/index.js";
import { PromotionError, submitForPromotion, type PromotionEnv } from "../promotions/promotionUseCases.js";
import { crossPostToFeed } from "./feed-cross-post.js";
import { PublishJobError } from "./drain-publish-jobs.js";

export type DistributionEnv = SocialPublisherEnv & PromotionEnv;

/** The per-network choices a job carries (post_settings). */
export interface JobPostSettings {
  tiktok?: TikTokPostSettings;
  youtube?: YouTubePostSettings;
  /** This destination's own title (PRD §4.2); absent = the video's title. */
  title?: string;
  /** Overflow: the creator posts this destination themselves. */
  postYourself?: boolean;
}

/** Title length every network's adapter accepts (the publish route's cap). */
const TITLE_MAX = 100;

interface JobProject {
  id: string;
  userId: string;
  slug: string | null;
  isPublic: boolean;
  videoId: string | null;
  masterHash: string | null;
  title: string;
}

async function loadProject(db: Db, projectId: string): Promise<JobProject> {
  const [row] = await db
    .select({
      id: studioProjects.id,
      userId: studioProjects.userId,
      slug: studioProjects.slug,
      isPublic: studioProjects.isPublic,
      videoId: studioProjects.videoId,
      masterHash: sql<string | null>`${studioProjects.timelineSpec}->'_meta'->>'bakedHash'`,
      title: videos.title,
    })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) throw new PublishJobError("The video was deleted.", true);
  return { ...row, title: (row.title ?? "").trim().slice(0, TITLE_MAX) || "hired.video" };
}

/** The cut to post, or undefined for the master (see header). */
async function cutFor(db: Db, job: jobs.PublishJob, project: JobProject): Promise<string | undefined> {
  return (await currentCutVideoId(db, job.renderVariantId, project.masterHash)) ?? undefined;
}

/** Lane B errors that retrying won't fix. */
const PERMANENT_SELF = new Set([
  "PROJECT_NOT_FOUND",
  "FORBIDDEN",
  "VIDEO_NOT_READY",
  "INVALID_VARIANT",
  "CHANNEL_LIMIT",
  "NOT_CONNECTED",
  "ACCOUNT_UNSUPPORTED",
]);

export interface SendDeps {
  db?: Db;
  publishSelf?: typeof publishProjectVideo;
  submitManaged?: typeof submitForPromotion;
  postToFeed?: typeof crossPostToFeed;
}

export async function sendPublishJob(
  job: jobs.PublishJob,
  env: DistributionEnv | undefined,
  deps: SendDeps = {},
): Promise<jobs.JobResultRef> {
  const db = deps.db ?? getDb();
  const project = await loadProject(db, job.projectId);
  const destination = job.destination as DistributionDestination;
  const settings = (job.postSettings ?? {}) as JobPostSettings;
  if (
    agentJobNeedsPreparedClip({
      source: job.source,
      destination,
      renderVariantId: job.renderVariantId,
      postYourself: settings.postYourself === true,
    })
  ) {
    throw new PublishJobError("Prepare the clip before posting.", false);
  }
  const variantVideoId = await cutFor(db, job, project);
  const title = settings.title?.trim() || project.title;

  if (destination === FEED_DESTINATION) {
    if (!project.videoId) throw new PublishJobError("Render the video before posting it.", true);
    let video: Awaited<ReturnType<typeof requireCompiledVideo>>;
    try {
      video = await requireCompiledVideo(db, { videoId: variantVideoId ?? project.videoId, ownerUserId: project.userId });
    } catch (e) {
      if (e instanceof PublishVideoError) throw new PublishJobError(e.message, true);
      throw e;
    }
    const feedPostId = await (deps.postToFeed ?? crossPostToFeed)(
      { userId: job.createdBy, project, video: { r2Key: video.r2Key!, thumbnailUrl: video.thumbnailUrl ?? null }, caption: job.caption },
      db,
    );
    return { feedPostId };
  }

  if (job.lane === "managed") {
    if (!isPromotionDestination(destination)) throw new PublishJobError("hired.video doesn't post there.", true);
    try {
      const submission = await (deps.submitManaged ?? submitForPromotion)({
        actorUserId: job.createdBy,
        projectId: job.projectId,
        platform: destination,
        title,
        description: job.caption,
        variantVideoId,
        env,
      });
      return { promotionSubmissionId: submission.id };
    } catch (e) {
      if (!(e instanceof PromotionError)) throw e;
      if (e.kind === "ALREADY_SUBMITTED") {
        // Already waiting for review: that submission IS this post.
        const open = await jobs.findOpenPromotion({ projectId: job.projectId, platform: destination }, db);
        if (open) return { promotionSubmissionId: open };
      }
      throw new PublishJobError(e.message, true);
    }
  }

  if (!isNetworkDestination(destination)) throw new PublishJobError("Unknown destination.", true);
  try {
    const publication = await (deps.publishSelf ?? publishProjectVideo)({
      actor: { userId: job.createdBy, isGuest: false },
      projectId: job.projectId,
      platform: destination,
      title,
      caption: job.caption,
      tiktok: settings.tiktok,
      youtube: settings.youtube,
      variantVideoId,
      env,
    });
    return { publicationId: publication.id };
  } catch (e) {
    if (e instanceof PublishProjectVideoError) throw new PublishJobError(e.message, PERMANENT_SELF.has(e.kind));
    throw e;
  }
}

/** What an earlier attempt of `job` already produced (see the drainer). */
export async function producedRecord(job: jobs.PublishJob, db: Db = getDb()): Promise<jobs.JobResultRef | null> {
  const since = job.startedAt;
  if (!since) return null;
  if (job.destination === FEED_DESTINATION) {
    const feedPostId = await jobs.findFeedPostSince({ userId: job.createdBy, projectId: job.projectId, since }, db);
    return feedPostId ? { feedPostId } : null;
  }
  if (job.lane === "managed") {
    const id = await jobs.findPromotionSince({ projectId: job.projectId, platform: job.destination, since }, db);
    return id ? { promotionSubmissionId: id } : null;
  }
  const publicationId = await jobs.findPublicationSince({ projectId: job.projectId, destination: job.destination, since }, db);
  return publicationId ? { publicationId } : null;
}
