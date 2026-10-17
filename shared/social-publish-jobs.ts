/**
 * Scheduled social posts (#2047) — the framework-free vocabulary shared by
 * the queue (api/src/services/distribution), the Distribution Hub and the
 * Post dock's "Schedule" option.
 *
 * A job is ONE post of ONE project to ONE destination at a set time:
 *
 *   destination  a network (VIDEO_PUBLISH_PLATFORMS) or `feed` — the
 *                hired.video social feed (native cross-post, PRD §5.7)
 *   lane         `self`    → the user's own account (Lane B, runSelfPublishGate)
 *                `managed` → hired.video's brand account (Lane A — the job
 *                            SUBMITS to the promotion review queue)
 *
 *   scheduled → running → done
 *                       ↘ scheduled (retry, with backoff) … → failed
 *   scheduled → cancelled
 *
 * The DB CHECK constraints (migration 0524) mirror these lists.
 */
import { PROMOTION_PLATFORMS, type PromotionPlatform } from "./promotions.js";
import { POST_TEXT_LIMITS, VIDEO_PUBLISH_PLATFORMS, type VideoPublishPlatform } from "./social-platforms.js";

export const FEED_DESTINATION = "feed" as const;

export const DISTRIBUTION_DESTINATIONS = [...VIDEO_PUBLISH_PLATFORMS, FEED_DESTINATION] as const;
export type DistributionDestination = (typeof DISTRIBUTION_DESTINATIONS)[number];

export const DISTRIBUTION_LANES = ["self", "managed"] as const;
export type DistributionLane = (typeof DISTRIBUTION_LANES)[number];

export const PUBLISH_JOB_STATUSES = ["scheduled", "running", "done", "failed", "cancelled", "draft", "expired"] as const;
export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

/** The three lists the Hub shows. Drafts live on the Agent tab. */
export const PUBLISH_JOB_VIEWS = ["upcoming", "sent", "failed"] as const;
export type PublishJobView = (typeof PUBLISH_JOB_VIEWS)[number];

export function isPublishJobView(v: string): v is PublishJobView {
  return (PUBLISH_JOB_VIEWS as readonly string[]).includes(v);
}

/** Which statuses each Hub list holds. A cancelled job sits with the failed
 *  ones: it didn't go out, and it can be scheduled again from there. Draft
 *  and expired jobs belong on no Hub list. */
export const PUBLISH_JOB_VIEW_STATUSES: Record<PublishJobView, readonly PublishJobStatus[]> = {
  upcoming: ["scheduled", "running"],
  sent: ["done"],
  failed: ["failed", "cancelled"],
};

export function publishJobView(status: PublishJobStatus): PublishJobView | null {
  if (status === "done") return "sent";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "scheduled" || status === "running") return "upcoming";
  return null;
}

/** A lane is valid for a destination: the feed is always the creator's own
 *  post; the brand lane exists only where hired.video has a brand publisher. */
export function isLaneValidFor(destination: DistributionDestination, lane: DistributionLane): boolean {
  if (destination === FEED_DESTINATION) return lane === "self";
  if (lane === "managed") return (PROMOTION_PLATFORMS as readonly string[]).includes(destination);
  return (VIDEO_PUBLISH_PLATFORMS as readonly string[]).includes(destination);
}

export function isNetworkDestination(d: DistributionDestination): d is VideoPublishPlatform {
  return d !== FEED_DESTINATION;
}

export function isPromotionDestination(d: DistributionDestination): d is PromotionPlatform {
  return (PROMOTION_PLATFORMS as readonly string[]).includes(d);
}

// ─── Per-destination text (PRD §4.2) ─────────────────────────────────────────
//
// One compose has a shared caption; each destination may override its
// caption and (where the network shows one) its title. The job stores the
// EFFECTIVE text, so the limits below are checked once, at schedule time.

/** The feed takes long posts; this is the composer's cap for it. */
export const FEED_POST_TEXT_MAX = 5000;
/** A brand-channel submission's title (promotion_submissions.title). */
export const PROMOTION_TITLE_MAX = 100;

/** Networks that show a title apart from the post text, with their limit. */
export const POST_TITLE_LIMITS: Partial<Record<VideoPublishPlatform, number>> = {
  youtube: 100,
  facebook: 255,
  linkedin: 200,
};

/** The longest caption a destination takes. */
export function captionLimitFor(destination: DistributionDestination): number {
  return destination === FEED_DESTINATION ? FEED_POST_TEXT_MAX : POST_TEXT_LIMITS[destination];
}

/** The longest title a destination takes, or null when it shows none. */
export function titleLimitFor(destination: DistributionDestination, lane: DistributionLane): number | null {
  if (destination === FEED_DESTINATION) return null;
  if (lane === "managed") return PROMOTION_TITLE_MAX;
  return POST_TITLE_LIMITS[destination] ?? null;
}

/** Why a destination's text can't be posted, or null. */
export function postTextProblem(
  destination: DistributionDestination,
  lane: DistributionLane,
  text: { caption: string; title?: string | null },
): "CAPTION_TOO_LONG" | "TITLE_TOO_LONG" | "TITLE_NOT_SUPPORTED" | null {
  if (text.caption.length > captionLimitFor(destination)) return "CAPTION_TOO_LONG";
  if (text.title) {
    const max = titleLimitFor(destination, lane);
    if (max === null) return "TITLE_NOT_SUPPORTED";
    if (text.title.length > max) return "TITLE_TOO_LONG";
  }
  return null;
}

// ─── Schedule window ─────────────────────────────────────────────────────────

/** A post may be scheduled at most this far ahead (tokens and plans change). */
export const SCHEDULE_MAX_AHEAD_DAYS = 90;
/** "Now" from a slow form still counts as now (clock skew, a slow submit). */
export const SCHEDULE_PAST_GRACE_MS = 2 * 60 * 1000;
/** Destinations one compose may fan out to. */
export const MAX_DESTINATIONS_PER_POST = 8;

export type ScheduleProblem = "INVALID" | "IN_PAST" | "TOO_FAR_AHEAD";

/** Null when `at` is a valid send time relative to `now`. */
export function scheduleProblem(at: Date, now: Date): ScheduleProblem | null {
  const t = at.getTime();
  if (!Number.isFinite(t)) return "INVALID";
  if (t < now.getTime() - SCHEDULE_PAST_GRACE_MS) return "IN_PAST";
  if (t > now.getTime() + SCHEDULE_MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000) return "TOO_FAR_AHEAD";
  return null;
}

/** The latest valid send time from `now` (for the date picker's `max`). */
export function latestScheduleTime(now: Date): Date {
  return new Date(now.getTime() + SCHEDULE_MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000);
}

// ─── Off-platform reach (#2048) ──────────────────────────────────────────────

/** A post's counts as the network reported them; null = the network doesn't
 *  report that count (or didn't answer), never a made-up zero. */
export interface PostMetricCounts {
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
}

// ─── AI Posting Agent (#2300) ────────────────────────────────────────────────

/** Cadence presets for the AI agent. */
export const AGENT_CADENCES = ["light", "steady", "daily"] as const;
export type AgentCadence = (typeof AGENT_CADENCES)[number];

/** Agent default settings. */
export const AGENT_DEFAULT_POST_MINUTE = 720; // 12:00 local
export const AGENT_DEFAULT_QUIET_START = 1260; // 21:00
export const AGENT_DEFAULT_QUIET_END = 480; // 08:00

/** Agent limits. */
export const AGENT_CLIP_SECONDS = 30;
export const AGENT_UNDO_WINDOW_MIN = 10;
export const AGENT_PLANS_PER_RUN = 1;
export const AGENT_SUBREQUEST_BUDGET = 12;
export const AGENT_YOUTUBE_DAILY_MAX = 3;
export const AGENT_COOLDOWN_DAYS = 14;
export const AGENT_POST_IT_YOURSELF_EXPIRY_HOURS = 48;
