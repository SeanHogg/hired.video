/**
 * Publish a Studio project's rendered video to one of the user's own social
 * accounts (Lane B) — YouTube, TikTok, Instagram, X, a Facebook Page or the
 * LinkedIn member feed — through the platform's publisher adapter
 * (publishers/, assembled by buildSocialPublisher).
 *
 * Order matters, and lives here so every caller gets it:
 *   1. the project exists and the caller may write it        (canActFor SSoT)
 *   2. it has a rendered MP4                                  (VIDEO_NOT_READY)
 *      — or, when the dock baked a fitted cut for this network (#2045),
 *      that cut, which must be a cut of THIS project          (INVALID_VARIANT)
 *   3. runSelfPublishGate: channel cap → connection → fresh token
 *                                                  (CHANNEL_LIMIT / NOT_CONNECTED)
 *   4. publish, then record ONE publication row under the platform id
 *      (with the cut it posted, when one was)
 *      (a YouTube post also lands on the video row — linkYouTubeUpload)
 *
 * Every collaborator is injectable so the flow is unit-testable without a
 * DB, KMS or network.
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../../db/index.js";
import type { VideoPublishPlatform } from "../../../../shared/social-platforms.js";
import type { TikTokPostSettings } from "../../../../shared/tiktok-post-settings.js";
import { assertCanWrite, WorkspaceForbiddenError } from "../studio/workspace.js";
import { recordPublication, type PublicationRecord } from "../studio/publication-service.js";
import { canPostToDestination } from "../studio/post-channel-gate.js";
import {
  fetchCompiledVideoBytes,
  linkYouTubeUpload,
  PublishVideoError,
  requireCompiledVideo,
} from "../studio/compiled-video.js";
import { cdnUrl } from "../../utils/cdn.js";
import { resolvePostedVariant } from "../studio/render-variants.js";
import { buildSocialPublisher, type SelfTokenSource, type SocialPublisherEnv } from "./build-social-publisher.js";
import { runSelfPublishGate } from "./self-publish-gate.js";
import { SocialPublishError, type SocialVideoPublisher, type YouTubePostSettings } from "./publishers/index.js";

export type PublishProjectVideoErrorKind =
  | "PROJECT_NOT_FOUND"
  | "FORBIDDEN"
  | "VIDEO_NOT_READY"
  | "INVALID_VARIANT"
  | "CHANNEL_LIMIT"
  | "NOT_CONNECTED"
  | "ACCOUNT_UNSUPPORTED"
  | "PUBLISH_FAILED";

export class PublishProjectVideoError extends Error {
  constructor(
    public readonly kind: PublishProjectVideoErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PublishProjectVideoError";
  }
}

export interface PublishProjectVideoInput {
  actor: { userId: string };
  projectId: string;
  platform: VideoPublishPlatform;
  title: string;
  caption: string;
  /** The creator's TikTok post settings (required by the route for TikTok). */
  tiktok?: TikTokPostSettings;
  /** YouTube privacy / tags / Shorts flag. */
  youtube?: YouTubePostSettings;
  /** A fitted cut of this project to post instead of the master render
   *  (studio_project_render_variants.video_id, #2045). */
  variantVideoId?: string;
  env: SocialPublisherEnv | undefined;
}

export interface PublishProjectVideoDeps {
  db?: Db;
  publishers?: Record<VideoPublishPlatform, SocialVideoPublisher>;
  getAccessToken?: SelfTokenSource;
  canPost?: typeof canPostToDestination;
  record?: typeof recordPublication;
  resolveVariant?: typeof resolvePostedVariant;
  linkYouTube?: typeof linkYouTubeUpload;
  fetchMedia?: (url: string) => Promise<Response>;
}

export async function publishProjectVideo(
  input: PublishProjectVideoInput,
  deps: PublishProjectVideoDeps = {},
): Promise<PublicationRecord> {
  const db = deps.db ?? getDb();
  const { actor, projectId, platform } = input;

  const [project] = await db
    .select({
      id: schema.studioProjects.id,
      userId: schema.studioProjects.userId,
      companyId: schema.studioProjects.companyId,
      videoId: schema.studioProjects.videoId,
    })
    .from(schema.studioProjects)
    .where(eq(schema.studioProjects.id, projectId))
    .limit(1);
  if (!project) throw new PublishProjectVideoError("PROJECT_NOT_FOUND", "Project not found");
  try {
    await assertCanWrite(actor.userId, project.userId, project.companyId ?? null, { db });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw new PublishProjectVideoError("FORBIDDEN", e.message);
    throw e;
  }

  if (!project.videoId) throw new PublishProjectVideoError("VIDEO_NOT_READY", "Render the video before posting it.");
  // A fitted cut must be a cut of THIS project — never another project's file.
  const variant = input.variantVideoId
    ? await (deps.resolveVariant ?? resolvePostedVariant)(db, { projectId, videoId: input.variantVideoId })
    : null;
  if (input.variantVideoId && !variant) {
    throw new PublishProjectVideoError("INVALID_VARIANT", "That cut doesn't belong to this video.");
  }
  let video: Awaited<ReturnType<typeof requireCompiledVideo>>;
  try {
    // The video row mirrors the project's owner, not a delegated actor.
    video = await requireCompiledVideo(db, { videoId: variant?.videoId ?? project.videoId, ownerUserId: project.userId });
  } catch (e) {
    if (e instanceof PublishVideoError) throw new PublishProjectVideoError("VIDEO_NOT_READY", e.message);
    throw e;
  }

  // Cheap to build: closures over the env, no I/O until a token is asked for.
  const seam = buildSocialPublisher(input.env);
  const gate = await runSelfPublishGate(
    { actor, projectId, platform },
    { canPost: deps.canPost, selfAccessToken: deps.getAccessToken ?? seam.selfAccessToken },
  );
  if ("kind" in gate) {
    throw gate.kind === "CHANNEL_LIMIT"
      ? new PublishProjectVideoError("CHANNEL_LIMIT", "Your plan's channel limit is reached for this video.")
      : new PublishProjectVideoError("NOT_CONNECTED", `Connect your ${platform} account first.`);
  }

  const publisher = (deps.publishers ?? seam.adapters)[platform];
  let result: Awaited<ReturnType<SocialVideoPublisher["publish"]>>;
  try {
    result = await publisher.publish({
      accessToken: gate.accessToken,
      title: input.title,
      caption: input.caption,
      tiktok: input.tiktok,
      youtube: input.youtube,
      video: {
        url: cdnUrl(video.r2Key!),
        bytes: () => fetchCompiledVideoBytes(video, deps.fetchMedia),
      },
    });
  } catch (e) {
    if (e instanceof SocialPublishError) {
      if (e.kind === "NOT_AUTHORIZED") throw new PublishProjectVideoError("NOT_CONNECTED", e.message);
      if (e.kind === "ACCOUNT_UNSUPPORTED") throw new PublishProjectVideoError("ACCOUNT_UNSUPPORTED", e.message);
      throw new PublishProjectVideoError("PUBLISH_FAILED", e.message);
    }
    if (e instanceof PublishVideoError) throw new PublishProjectVideoError("PUBLISH_FAILED", e.message);
    throw e;
  }

  // The public pages read the MASTER's row, so a posted cut links there too.
  if (platform === "youtube") await (deps.linkYouTube ?? linkYouTubeUpload)(db, project.videoId, result);

  return (deps.record ?? recordPublication)(
    {
      projectId,
      destination: platform,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      status: "published",
      renderVariantId: variant?.id ?? null,
      // The post went out on the actor's own connection (#2048 metrics).
      publishedBy: actor.userId,
    },
    db,
  );
}
