/**
 * social_publish_jobs persistence (migration 0524, #2047): the scheduled
 * post queue's writes, the drainer's atomic claim, and the Hub's list read.
 * Plus the three "did this job already produce its post?" lookups the
 * drainer runs before it re-sends a job (idempotency).
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { signalWork } from "../services/scheduling/work-signals.js";
import { socialPublishJobs, type SocialPublishJobInsert, type SocialPublishJobRow } from "../db/schema/distribution.js";
import { studioProjects } from "../db/schema/resumes.js";
import { videos } from "../db/schema/videos.js";
import { studioProjectPublications } from "../db/schema/studioPublications.js";
import { promotionSubmissions } from "../db/schema/promotions.js";
import { feedPosts } from "../db/schema/feed.js";
import { AGENT_UNDO_WINDOW_MIN, type PublishJobStatus } from "../../../shared/social-publish-jobs.js";
import { agentJobNeedsPreparedClip, canUndoAgentApproval } from "../../../shared/posting-agent.js";

export type PublishJob = SocialPublishJobRow;

/** What a finished job produced (exactly one is set). */
export interface JobResultRef {
  publicationId?: string;
  promotionSubmissionId?: string;
  feedPostId?: string;
}

/** The Hub's list is bounded: the newest 50 per list. */
export const JOB_LIST_LIMIT = 50;

/** The feed post subject a cross-posted project is filed under. */
export const FEED_SUBJECT_STUDIO_PROJECT = "studio_project";

/** Insert the jobs one compose produced. A destination that already has an
 *  open job for this project + lane is skipped (uq_social_publish_jobs_open)
 *  and left out of the result. */
export async function insertJobs(rows: SocialPublishJobInsert[], db: Db = getDb()): Promise<PublishJob[]> {
  if (rows.length === 0) return [];
  const inserted = await db.insert(socialPublishJobs).values(rows).onConflictDoNothing().returning();
  const dueTimes = inserted.filter((j) => j.status === "scheduled").map((j) => new Date(j.runAt).getTime());
  if (dueTimes.length > 0) await signalWork("social-publish", new Date(Math.min(...dueTimes)));
  return inserted;
}

/** Restrict a claim to these (destination, lane) kinds — the ones whose
 *  send still fits the run's subrequest budget. Null = any kind. */
export type JobKindFilter = ReadonlyArray<{ destination: string; lane: string }> | null;

export interface ClaimArgs {
  limit: number;
  now: Date;
  staleBefore: Date;
  kinds?: JobKindFilter;
  /** When the global kill switch is off, skip agent jobs. */
  excludeSource?: "agent";
}

/**
 * The drainer's claim — ONE statement, so two overlapping cron runs never
 * take the same job: due `scheduled` jobs, plus `running` jobs whose run
 * died (locked before `staleBefore`), oldest first, optionally only of the
 * affordable `kinds`, locked with FOR UPDATE SKIP LOCKED and flipped to
 * `running` (attempts + 1) together.
 */
export function buildClaimDueJobs(db: Db, args: ClaimArgs) {
  const isDue = or(
    and(eq(socialPublishJobs.status, "scheduled"), lte(socialPublishJobs.runAt, args.now)),
    and(eq(socialPublishJobs.status, "running"), lt(socialPublishJobs.lockedAt, args.staleBefore)),
  );
  const kindFilter = args.kinds
    ? or(...args.kinds.map((k) => and(eq(socialPublishJobs.destination, k.destination), eq(socialPublishJobs.lane, k.lane))))
    : undefined;
  const sourceFilter = args.excludeSource ? ne(socialPublishJobs.source, args.excludeSource) : undefined;
  const dueWhere = and(isDue, kindFilter, sourceFilter);
  const due = db
    .select({ id: socialPublishJobs.id })
    .from(socialPublishJobs)
    .where(dueWhere)
    .orderBy(socialPublishJobs.runAt)
    .limit(args.limit)
    .for("update", { skipLocked: true });
  return db
    .update(socialPublishJobs)
    .set({
      status: "running",
      lockedAt: args.now,
      startedAt: sql`coalesce(${socialPublishJobs.startedAt}, ${args.now.toISOString()}::timestamptz)`,
      attempts: sql`${socialPublishJobs.attempts} + 1`,
      updatedAt: args.now,
    })
    .where(inArray(socialPublishJobs.id, due))
    .returning();
}

export async function claimDueJobs(args: ClaimArgs, db: Db = getDb()): Promise<PublishJob[]> {
  return buildClaimDueJobs(db, args);
}

/** Claim the next due job (of the affordable kinds), or null. */
export async function claimNextJob(
  args: Omit<ClaimArgs, "limit">,
  db: Db = getDb(),
): Promise<PublishJob | null> {
  const [job] = await buildClaimDueJobs(db, { ...args, limit: 1 });
  return job ?? null;
}

export async function markDone(id: string, ref: JobResultRef, now: Date, db: Db = getDb()): Promise<void> {
  await db
    .update(socialPublishJobs)
    .set({
      status: "done",
      completedAt: now,
      lockedAt: null,
      lastError: null,
      publicationId: ref.publicationId ?? null,
      promotionSubmissionId: ref.promotionSubmissionId ?? null,
      feedPostId: ref.feedPostId ?? null,
      updatedAt: now,
    })
    .where(eq(socialPublishJobs.id, id));
}

/** Back to `scheduled`, to run again no earlier than `runAt`. */
export async function markRetry(id: string, error: string, runAt: Date, now: Date, db: Db = getDb()): Promise<void> {
  await db
    .update(socialPublishJobs)
    .set({ status: "scheduled", runAt, lockedAt: null, lastError: error, updatedAt: now })
    .where(eq(socialPublishJobs.id, id));
}

export async function markFailed(id: string, error: string, now: Date, db: Db = getDb()): Promise<void> {
  await db
    .update(socialPublishJobs)
    .set({ status: "failed", lockedAt: null, lastError: error, completedAt: now, updatedAt: now })
    .where(eq(socialPublishJobs.id, id));
}

/** Cancel the creator's own job while it hasn't started. Null = no such
 *  scheduled job (not theirs, already running or finished). */
export async function cancelJob(id: string, userId: string, now: Date, db: Db = getDb()): Promise<PublishJob | null> {
  const [row] = await db
    .update(socialPublishJobs)
    .set({ status: "cancelled", lockedAt: null, completedAt: now, updatedAt: now })
    .where(and(eq(socialPublishJobs.id, id), eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.status, "scheduled")))
    .returning();
  return row ?? null;
}

/** Put the creator's failed / cancelled job back in the queue: it runs at
 *  its original time when that is still ahead, else on the next run.
 *  Throws the unique violation when the same post is already queued. */
export async function requeueJob(id: string, userId: string, now: Date, db: Db = getDb()): Promise<PublishJob | null> {
  const [row] = await db
    .update(socialPublishJobs)
    .set({
      status: "scheduled",
      runAt: sql`greatest(${socialPublishJobs.scheduledAt}, ${now.toISOString()}::timestamptz)`,
      attempts: 0,
      lastError: null,
      lockedAt: null,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        inArray(socialPublishJobs.status, ["failed", "cancelled"]),
      ),
    )
    .returning();
  if (row) await signalWork("social-publish", new Date(row.runAt));
  return row ?? null;
}

/** One Hub list row: the job plus what it is about and what it produced. */
export interface JobListRow {
  id: string;
  projectId: string;
  projectTitle: string | null;
  destination: string;
  lane: string;
  caption: string;
  status: string;
  scheduledAt: Date;
  runAt: Date;
  attempts: number;
  lastError: string | null;
  completedAt: Date | null;
  externalUrl: string | null;
  promotionStatus: string | null;
  feedPostId: string | null;
}

/** The creator's jobs in `statuses`, newest send time first — ONE query
 *  with the project title (its video row), the publication link and the
 *  promotion status joined in (no per-row reads). */
export async function listForCreator(
  userId: string,
  statuses: readonly PublishJobStatus[],
  db: Db = getDb(),
): Promise<JobListRow[]> {
  const j = socialPublishJobs;
  return db
    .select({
      id: j.id,
      projectId: j.projectId,
      projectTitle: videos.title,
      destination: j.destination,
      lane: j.lane,
      caption: j.caption,
      status: j.status,
      scheduledAt: j.scheduledAt,
      runAt: j.runAt,
      attempts: j.attempts,
      lastError: j.lastError,
      completedAt: j.completedAt,
      externalUrl: sql<string | null>`coalesce(${studioProjectPublications.externalUrl}, ${promotionSubmissions.externalUrl})`,
      promotionStatus: promotionSubmissions.status,
      feedPostId: j.feedPostId,
    })
    .from(j)
    .innerJoin(studioProjects, eq(studioProjects.id, j.projectId))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .leftJoin(studioProjectPublications, eq(studioProjectPublications.id, j.publicationId))
    .leftJoin(promotionSubmissions, eq(promotionSubmissions.id, j.promotionSubmissionId))
    .where(and(eq(j.createdBy, userId), inArray(j.status, [...statuses])))
    .orderBy(desc(j.scheduledAt))
    .limit(JOB_LIST_LIMIT);
}

// ─── Idempotency: did an earlier attempt already post? ───────────────────────

/** A publication of this project to this destination made since `since`. */
export async function findPublicationSince(
  args: { projectId: string; destination: string; since: Date },
  db: Db = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ id: studioProjectPublications.id })
    .from(studioProjectPublications)
    .where(
      and(
        eq(studioProjectPublications.projectId, args.projectId),
        eq(studioProjectPublications.destination, args.destination),
        eq(studioProjectPublications.status, "published"),
        gte(studioProjectPublications.publishedAt, args.since),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** A promotion submission of this project to this platform made since `since`. */
export async function findPromotionSince(
  args: { projectId: string; platform: string; since: Date },
  db: Db = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ id: promotionSubmissions.id })
    .from(promotionSubmissions)
    .where(
      and(
        eq(promotionSubmissions.projectId, args.projectId),
        eq(promotionSubmissions.platform, args.platform),
        gte(promotionSubmissions.createdAt, args.since),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** The open (pending / failed) submission of this project to this platform. */
export async function findOpenPromotion(
  args: { projectId: string; platform: string },
  db: Db = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ id: promotionSubmissions.id })
    .from(promotionSubmissions)
    .where(
      and(
        eq(promotionSubmissions.projectId, args.projectId),
        eq(promotionSubmissions.platform, args.platform),
        inArray(promotionSubmissions.status, ["pending", "failed"]),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** A feed cross-post of this project by this user made since `since`. */
export async function findFeedPostSince(
  args: { userId: string; projectId: string; since: Date },
  db: Db = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(
      and(
        eq(feedPosts.subjectType, FEED_SUBJECT_STUDIO_PROJECT),
        eq(feedPosts.subjectId, args.projectId),
        eq(feedPosts.userId, args.userId),
        gte(feedPosts.createdAt, args.since),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// ─── AI Posting Agent functions (#2300) ────────────────────────────────────────

/** Agent draft job row for the Hub. */
export interface AgentDraftRow {
  id: string;
  projectId: string;
  projectTitle: string | null;
  destination: string;
  lane: string;
  caption: string;
  captionSource: string | null;
  status: string;
  scheduledAt: Date;
  runAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  canUndo: boolean;
  postYourself: boolean;
  renderVariantId: string | null;
  variantKey: string | null;
  needsClip: boolean;
}

function variantKeyOf(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const s = settings as { variantKey?: unknown };
  return typeof s.variantKey === "string" && s.variantKey.length > 0 ? s.variantKey : null;
}

/** List agent drafts and recently approved jobs still inside the undo window. */
export async function listAgentDrafts(userId: string, db: Db = getDb()): Promise<AgentDraftRow[]> {
  const j = socialPublishJobs;
  const now = new Date();
  const undoCutoff = new Date(now.getTime() - AGENT_UNDO_WINDOW_MIN * 60 * 1000);

  const rows = await db
    .select({
      id: j.id,
      projectId: j.projectId,
      projectTitle: videos.title,
      destination: j.destination,
      lane: j.lane,
      caption: j.caption,
      captionSource: j.captionSource,
      status: j.status,
      scheduledAt: j.scheduledAt,
      runAt: j.runAt,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      postSettings: j.postSettings,
      postYourself: j.postYourself,
      renderVariantId: j.renderVariantId,
    })
    .from(j)
    .innerJoin(studioProjects, eq(studioProjects.id, j.projectId))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(
      and(
        eq(j.createdBy, userId),
        eq(j.source, "agent"),
        or(
          eq(j.status, "draft"),
          and(eq(j.status, "scheduled"), gte(j.updatedAt, undoCutoff)),
          and(
            eq(j.status, "scheduled"),
            isNull(j.renderVariantId),
            ne(j.destination, "feed"),
            eq(j.postYourself, false),
          ),
        ),
      ),
    )
    .orderBy(desc(j.createdAt))
    .limit(50);

  return rows
    .map((row) => {
      const needsClip = agentJobNeedsPreparedClip({
        source: "agent",
        destination: row.destination,
        renderVariantId: row.renderVariantId,
        postYourself: row.postYourself,
      });
      return {
        id: row.id,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        destination: row.destination,
        lane: row.lane,
        caption: row.caption,
        captionSource: row.captionSource,
        status: row.status,
        scheduledAt: row.scheduledAt,
        runAt: row.runAt,
        expiresAt: row.runAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        canUndo: canUndoAgentApproval(row.status, row.updatedAt, now),
        postYourself: row.postYourself,
        renderVariantId: row.renderVariantId,
        variantKey: variantKeyOf(row.postSettings),
        needsClip,
      };
    })
    .filter((row) => row.status === "draft" || row.canUndo || row.needsClip);
}

/** Approve an agent draft: change status from 'draft' to 'scheduled'. */
export async function approveAgentDraft(id: string, userId: string, now: Date, db: Db = getDb()): Promise<boolean> {
  const undoUntil = new Date(now.getTime() + 10 * 60 * 1000);
  const result = await db
    .update(socialPublishJobs)
    .set({
      status: "scheduled",
      runAt: sql`greatest(${socialPublishJobs.scheduledAt}, ${undoUntil.toISOString()}::timestamptz)`,
      updatedAt: now,
    })
    .where(and(eq(socialPublishJobs.id, id), eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "draft")));
  const approved = (result.rowCount ?? 0) > 0;
  if (approved) await signalWork("social-publish");
  return approved;
}

/** Attach a fitted cut to an agent job so the drainer can post it (R16). */
export async function attachAgentJobVariant(
  id: string,
  userId: string,
  renderVariantId: string,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<boolean> {
  const result = await db
    .update(socialPublishJobs)
    .set({ renderVariantId, updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        inArray(socialPublishJobs.status, ["draft", "scheduled"]),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Skip an agent draft: change status from 'draft' to 'cancelled'. */
export async function skipAgentDraft(id: string, userId: string, now: Date, db: Db = getDb()): Promise<boolean> {
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(socialPublishJobs.id, id), eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "draft")));
  return (result.rowCount ?? 0) > 0;
}

/** Update caption for an agent draft. */
export async function updateAgentDraftCaption(id: string, userId: string, caption: string, now: Date, db: Db = getDb()): Promise<boolean> {
  const result = await db
    .update(socialPublishJobs)
    .set({ caption, captionSource: "template", updatedAt: now })
    .where(and(eq(socialPublishJobs.id, id), eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "draft")));
  return (result.rowCount ?? 0) > 0;
}

/** Approve all agent drafts for a user (status = 'draft'). */
export async function approveAllAgentDrafts(userId: string, now: Date, db: Db = getDb()): Promise<number> {
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "scheduled", updatedAt: now })
    .where(and(eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "draft")));
  const approved = result.rowCount ?? 0;
  if (approved > 0) await signalWork("social-publish");
  return approved;
}

/** Expire old agent drafts (runAt <= now). */
export async function expireAgentDrafts(db: Db = getDb()): Promise<number> {
  const now = new Date();
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "draft"), lte(socialPublishJobs.runAt, now)));
  return result.rowCount ?? 0;
}

/** Count expired agent drafts for a user (for digest notification). */
export async function countExpiredAgentDrafts(userId: string, since: Date, db: Db = getDb()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialPublishJobs)
    .where(and(eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent"), eq(socialPublishJobs.status, "expired"), gte(socialPublishJobs.updatedAt, since)));
  return row?.count ?? 0;
}

/** One agent job owned by this user, any status (approve undo, rewrite). */
export async function getAgentDraft(id: string, userId: string, db: Db = getDb()): Promise<PublishJob | null> {
  const [row] = await db
    .select()
    .from(socialPublishJobs)
    .where(and(eq(socialPublishJobs.id, id), eq(socialPublishJobs.createdBy, userId), eq(socialPublishJobs.source, "agent")))
    .limit(1);
  return row ?? null;
}

/** Revert a just-approved agent job to draft within the 10-minute undo window. */
export async function undoAgentDraft(id: string, userId: string, now: Date, db: Db = getDb()): Promise<boolean> {
  const undoCutoff = new Date(now.getTime() - 10 * 60 * 1000);
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "draft", updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        eq(socialPublishJobs.status, "scheduled"),
        gte(socialPublishJobs.updatedAt, undoCutoff),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Agent jobs (draft/scheduled/running/done) for a destination since `since`. Omit userId for app-wide (YouTube cap). */
export async function countAgentJobs(
  args: { destination: string; since: Date; userId?: string },
  db: Db = getDb(),
): Promise<number> {
  const filters = [
    eq(socialPublishJobs.source, "agent"),
    eq(socialPublishJobs.destination, args.destination),
    inArray(socialPublishJobs.status, ["draft", "scheduled", "running", "done"]),
    gte(socialPublishJobs.scheduledAt, args.since),
  ];
  if (args.userId) filters.push(eq(socialPublishJobs.createdBy, args.userId));
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(socialPublishJobs).where(and(...filters));
  return Number(row?.count ?? 0);
}

/** All of a user's agent jobs this week — cadence slot budget. */
export async function countUserAgentJobsSince(userId: string, since: Date, db: Db = getDb()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialPublishJobs)
    .where(
      and(
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        inArray(socialPublishJobs.status, ["draft", "scheduled", "running", "done"]),
        gte(socialPublishJobs.scheduledAt, since),
      ),
    );
  return Number(row?.count ?? 0);
}

/** Flip a draft to "post it yourself" when the YouTube daily cap is hit. */
export async function markAgentDraftPostYourself(
  id: string,
  userId: string,
  runAt: Date,
  now: Date,
  db: Db = getDb(),
): Promise<boolean> {
  const job = await getAgentDraft(id, userId, db);
  if (!job || job.status !== "draft") return false;
  const result = await db
    .update(socialPublishJobs)
    .set({ postYourself: true, runAt, updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        eq(socialPublishJobs.status, "draft"),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Move a still-draft agent job to a later slot (R18 daily-cap reschedule). */
export async function updateAgentDraftSlot(
  id: string,
  userId: string,
  scheduledAt: Date,
  runAt: Date,
  now: Date,
  db: Db = getDb(),
): Promise<boolean> {
  const result = await db
    .update(socialPublishJobs)
    .set({ scheduledAt, runAt, updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        eq(socialPublishJobs.status, "draft"),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Expire one agent draft and record why (R18: no remaining cadence slot). */
export async function expireOneAgentDraft(
  id: string,
  userId: string,
  now: Date,
  reason: string,
  db: Db = getDb(),
): Promise<boolean> {
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "expired", lastError: reason, updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.id, id),
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        eq(socialPublishJobs.status, "draft"),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** One prior agent post of a project — used for cooldown, rotation, and clip overlap. */
export type AgentClipHistory = {
  projectId: string;
  destination: string;
  createdAt: Date;
  startSecond: number | null;
  endSecond: number | null;
  score: number | null;
};

function clipFromPostSettings(settings: Record<string, unknown> | null): {
  startSecond: number | null;
  endSecond: number | null;
  score: number | null;
} {
  const clip = settings && typeof settings.clip === "object" && settings.clip
    ? (settings.clip as { startSecond?: unknown; endSecond?: unknown; score?: unknown })
    : null;
  return {
    startSecond: typeof clip?.startSecond === "number" ? clip.startSecond : null,
    endSecond: typeof clip?.endSecond === "number" ? clip.endSecond : null,
    score: typeof clip?.score === "number" ? clip.score : null,
  };
}

/** Agent jobs (draft/scheduled/running/done) for these projects — clip history. */
export async function listAgentClipHistory(
  userId: string,
  projectIds: string[],
  db: Db = getDb(),
): Promise<AgentClipHistory[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: socialPublishJobs.projectId,
      destination: socialPublishJobs.destination,
      createdAt: socialPublishJobs.createdAt,
      postSettings: socialPublishJobs.postSettings,
    })
    .from(socialPublishJobs)
    .where(
      and(
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        inArray(socialPublishJobs.projectId, projectIds),
        inArray(socialPublishJobs.status, ["draft", "scheduled", "running", "done"]),
      ),
    );
  return rows.map((row) => {
    const clip = clipFromPostSettings(row.postSettings);
    return {
      projectId: row.projectId,
      destination: row.destination,
      createdAt: row.createdAt,
      startSecond: clip.startSecond,
      endSecond: clip.endSecond,
      score: clip.score,
    };
  });
}

/** Cancel open agent jobs (draft + scheduled) — pause, Pro lapse, kill switch. */
export async function cancelOpenAgentJobs(userId: string, now: Date, db: Db = getDb()): Promise<number> {
  const result = await db
    .update(socialPublishJobs)
    .set({ status: "cancelled", lockedAt: null, completedAt: now, updatedAt: now })
    .where(
      and(
        eq(socialPublishJobs.createdBy, userId),
        eq(socialPublishJobs.source, "agent"),
        inArray(socialPublishJobs.status, ["draft", "scheduled"]),
      ),
    );
  return result.rowCount ?? 0;
}
