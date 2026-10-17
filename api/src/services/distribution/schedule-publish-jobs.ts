/**
 * Scheduling use cases (#2047) behind /api/distribution — the Distribution
 * Hub and the Post dock's "Schedule" option both create jobs here:
 *
 *   schedulePosts   one compose → one job per (destination, lane), all at
 *                   the same send time, each with its EFFECTIVE caption
 *                   (its own override, else the shared one) and title
 *                   override (post_settings.title). Validated up front: an account (not
 *                   a guest session), the send window (not in the past, not
 *                   more than 90 days ahead), each lane valid for its
 *                   destination, TikTok's own settings chosen, the project
 *                   writable and rendered, and any fitted cut a cut of THIS
 *                   project. A destination already queued for the project is
 *                   skipped, never queued twice.
 *   listPosts       the creator's upcoming / sent / failed jobs — cached
 *                   isolate-locally (getOrSetIsolateCached) under a
 *                   per-creator key prefix that every write and every
 *                   drained job drops (other isolates converge in the TTL)
 *   cancelPost      a job that hasn't started
 *   retryPost       a failed or cancelled job, back in the queue
 *
 * The channel cap, connections and tokens are NOT checked here: they can
 * change before the send time, so the drainer runs the real gate
 * (runSelfPublishGate) when the post goes out.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { studioProjects } from "../../db/schema/resumes.js";
import {
  isLaneValidFor,
  MAX_DESTINATIONS_PER_POST,
  postTextProblem,
  PUBLISH_JOB_VIEW_STATUSES,
  scheduleProblem,
  type DistributionDestination,
  type DistributionLane,
  type PublishJobView,
  type ScheduleProblem,
} from "../../../../shared/social-publish-jobs.js";
import { tiktokSettingsProblem } from "../../../../shared/tiktok-post-settings.js";
import { getOrSetIsolateCached, invalidateIsolatePrefix } from "../../utils/isolate-cache.js";
import * as repo from "../../repositories/socialPublishJobRepository.js";
import { assertCanWrite, WorkspaceForbiddenError } from "../studio/workspace.js";
import { resolvePostedVariant } from "../studio/render-variants.js";
import type { JobPostSettings } from "./send-publish-job.js";

export type ScheduleErrorKind =
  | ScheduleProblem
  | "ACCOUNT_REQUIRED"
  | "NO_DESTINATIONS"
  | "TOO_MANY_DESTINATIONS"
  | "INVALID_LANE"
  | "CAPTION_TOO_LONG"
  | "TITLE_TOO_LONG"
  | "TITLE_NOT_SUPPORTED"
  | "TIKTOK_SETTINGS_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "FORBIDDEN"
  | "VIDEO_NOT_READY"
  | "INVALID_VARIANT"
  | "NOT_FOUND"
  | "ALREADY_SCHEDULED";

export class ScheduleError extends Error {
  constructor(
    public readonly kind: ScheduleErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export interface ScheduleDestinationInput {
  destination: DistributionDestination;
  lane: DistributionLane;
  /** The fitted cut the client rendered for this network (#2045). */
  variantVideoId?: string;
  settings?: JobPostSettings;
  /** This destination's own caption (PRD §4.2); absent = the shared one. */
  caption?: string;
  /** This destination's own title, where the network shows one. */
  title?: string;
}

export interface SchedulePostsInput {
  actor: { userId: string; isGuest: boolean };
  projectId: string;
  caption: string;
  scheduledAt: Date;
  destinations: ScheduleDestinationInput[];
}

/** The Hub's view of one job. */
export interface PublishJobDto {
  id: string;
  projectId: string;
  projectTitle: string | null;
  destination: string;
  lane: string;
  caption: string;
  status: string;
  scheduledAt: string;
  nextAttemptAt: string;
  attempts: number;
  lastError: string | null;
  completedAt: string | null;
  externalUrl: string | null;
  promotionStatus: string | null;
  feedPostId: string | null;
}

export interface ScheduleDeps {
  db?: Db;
  now?: () => Date;
  assertWrite?: typeof assertCanWrite;
  resolveVariant?: typeof resolvePostedVariant;
  insert?: typeof repo.insertJobs;
}

const LIST_TTL_SECONDS = 60;
const listKeyPrefix = (userId: string) => `distribution:jobs:${userId}:`;

/** Every write to a creator's jobs (and every drained job) calls this. */
export function invalidateJobLists(userId: string): void {
  invalidateIsolatePrefix(listKeyPrefix(userId));
}

function iso(d: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

function toDto(row: repo.JobListRow): PublishJobDto {
  return {
    id: row.id,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    destination: row.destination,
    lane: row.lane,
    caption: row.caption,
    status: row.status,
    scheduledAt: iso(row.scheduledAt)!,
    nextAttemptAt: iso(row.runAt)!,
    attempts: row.attempts,
    lastError: row.lastError,
    completedAt: iso(row.completedAt),
    externalUrl: row.externalUrl,
    promotionStatus: row.promotionStatus,
    feedPostId: row.feedPostId,
  };
}

const TEXT_MESSAGES = {
  CAPTION_TOO_LONG: "The caption is longer than that network allows.",
  TITLE_TOO_LONG: "The title is longer than that network allows.",
  TITLE_NOT_SUPPORTED: "That network doesn't show a title.",
} as const;

/** A destination's effective caption and title (override, else shared). */
export function effectiveText(d: ScheduleDestinationInput, sharedCaption: string): { caption: string; title: string | null } {
  const caption = (d.caption ?? sharedCaption).trim();
  const title = d.title?.trim() || null;
  return { caption, title };
}

function validateDestinations(destinations: ScheduleDestinationInput[], sharedCaption: string): void {
  if (destinations.length === 0) throw new ScheduleError("NO_DESTINATIONS", "Pick at least one place to post.");
  if (destinations.length > MAX_DESTINATIONS_PER_POST) {
    throw new ScheduleError("TOO_MANY_DESTINATIONS", `Pick at most ${MAX_DESTINATIONS_PER_POST} places per post.`);
  }
  const seen = new Set<string>();
  for (const d of destinations) {
    const key = `${d.destination}:${d.lane}`;
    if (!isLaneValidFor(d.destination, d.lane) || seen.has(key)) {
      throw new ScheduleError("INVALID_LANE", `Can't post to ${d.destination} that way.`);
    }
    seen.add(key);
    const textProblem = postTextProblem(d.destination, d.lane, effectiveText(d, sharedCaption));
    if (textProblem) throw new ScheduleError(textProblem, `${d.destination}: ${TEXT_MESSAGES[textProblem]}`);
    if (d.destination === "tiktok" && d.lane === "self") {
      const tiktok = d.settings?.tiktok;
      // The creator's own privacy pick is required (TikTok's sharing rules);
      // whether the account still offers it is re-checked when it posts.
      if (!tiktok || tiktokSettingsProblem(tiktok, tiktok.privacyLevel ? [tiktok.privacyLevel] : []) !== null) {
        throw new ScheduleError("TIKTOK_SETTINGS_REQUIRED", "Choose your TikTok post settings first.");
      }
    }
  }
}

export async function schedulePosts(
  input: SchedulePostsInput,
  deps: ScheduleDeps = {},
): Promise<{ jobs: repo.PublishJob[]; skipped: Array<{ destination: string; lane: string }> }> {
  const db = deps.db ?? getDb();
  const now = (deps.now ?? (() => new Date()))();
  if (input.actor.isGuest) throw new ScheduleError("ACCOUNT_REQUIRED", "Create a free account to schedule posts.");
  const problem = scheduleProblem(input.scheduledAt, now);
  if (problem) throw new ScheduleError(problem, "Pick a send time between now and 90 days from now.");
  validateDestinations(input.destinations, input.caption);

  const [project] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId, companyId: studioProjects.companyId, videoId: studioProjects.videoId })
    .from(studioProjects)
    .where(eq(studioProjects.id, input.projectId))
    .limit(1);
  if (!project) throw new ScheduleError("PROJECT_NOT_FOUND", "Project not found");
  try {
    await (deps.assertWrite ?? assertCanWrite)(input.actor.userId, project.userId, project.companyId ?? null, { db });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw new ScheduleError("FORBIDDEN", e.message);
    throw e;
  }
  if (!project.videoId) throw new ScheduleError("VIDEO_NOT_READY", "Render the video before scheduling it.");

  // A named cut must be a cut of THIS project; resolve each distinct one once.
  const resolve = deps.resolveVariant ?? resolvePostedVariant;
  const cutIds = new Map<string, string>();
  for (const videoId of new Set(input.destinations.map((d) => d.variantVideoId).filter((v): v is string => !!v))) {
    const cut = await resolve(db, { projectId: project.id, videoId });
    if (!cut) throw new ScheduleError("INVALID_VARIANT", "That cut doesn't belong to this video.");
    cutIds.set(videoId, cut.id);
  }

  const rows = input.destinations.map((d) => {
    const { caption, title } = effectiveText(d, input.caption);
    const settings: JobPostSettings = { ...d.settings, ...(title ? { title } : {}) };
    return {
      projectId: project.id,
      createdBy: input.actor.userId,
      destination: d.destination,
      lane: d.lane,
      renderVariantId: d.variantVideoId ? cutIds.get(d.variantVideoId)! : null,
      caption,
      postSettings: Object.keys(settings).length > 0 ? (settings as Record<string, unknown>) : null,
      scheduledAt: input.scheduledAt,
      runAt: input.scheduledAt,
    };
  });
  const created = await (deps.insert ?? repo.insertJobs)(rows, db);
  invalidateJobLists(input.actor.userId);
  const made = new Set(created.map((j) => `${j.destination}:${j.lane}`));
  return {
    jobs: created,
    skipped: input.destinations
      .filter((d) => !made.has(`${d.destination}:${d.lane}`))
      .map((d) => ({ destination: d.destination, lane: d.lane })),
  };
}

export async function listPosts(userId: string, view: PublishJobView, db: Db = getDb()): Promise<PublishJobDto[]> {
  return getOrSetIsolateCached<PublishJobDto[]>({
    key: `${listKeyPrefix(userId)}${view}`,
    ttlSeconds: LIST_TTL_SECONDS,
    loader: async () => (await repo.listForCreator(userId, PUBLISH_JOB_VIEW_STATUSES[view], db)).map(toDto),
  });
}

export async function cancelPost(userId: string, jobId: string, db: Db = getDb()): Promise<void> {
  const row = await repo.cancelJob(jobId, userId, new Date(), db);
  if (!row) throw new ScheduleError("NOT_FOUND", "That post isn't waiting to go out.");
  invalidateJobLists(userId);
}

/** Postgres unique_violation — the same post is already queued. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function retryPost(userId: string, jobId: string, db: Db = getDb()): Promise<void> {
  let row: repo.PublishJob | null;
  try {
    row = await repo.requeueJob(jobId, userId, new Date(), db);
  } catch (e) {
    if (isUniqueViolation(e)) throw new ScheduleError("ALREADY_SCHEDULED", "This post is already queued.");
    throw e;
  }
  if (!row) throw new ScheduleError("NOT_FOUND", "That post can't be retried.");
  invalidateJobLists(userId);
}
