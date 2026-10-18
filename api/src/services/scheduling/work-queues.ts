/**
 * The KV-gated background queues the 5-minute cron tick drains.
 *
 * Each queue is a processor + the KV marker its writers set
 * (work-signals.ts). `runWorkQueueTick` reads the markers only; when none is
 * due it returns WITHOUT a single Postgres query, so Neon can suspend while
 * the platform is idle. When some are due it runs just those, then
 * re-derives every queue's next-due time in ONE query
 * (WorkQueueRepository.nextDueTimes) and rewrites only the markers that
 * moved. `reconcileWorkMarkers` (hourly cron) does the re-derive alone, so a
 * writer that forgot to signal costs ≤ 1h of latency, never lost work.
 *
 * `recruiter-agent-followups` is drained by the registered-workers
 * dispatcher (interval-jobs.ts), not here; it shares the marker mechanism.
 */
import { and, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { REMINDER_OFFSETS_MIN } from "../../../../shared/events.js";
import { WorkQueueRepository, type NextDueTimes } from "../../repositories/workQueueRepository.js";
import { processFollowUps } from "../outreach/drip-processors.js";
import { processJobQueue } from "../queue/job-queue-processor.js";
import { CampaignService } from "../campaigns/CampaignService.js";
import { EventReminderService, EVENT_REMINDER_WINDOW_MIN } from "../event/EventReminderService.js";
import { EventBlastService } from "../event/EventBlastService.js";
import { buildApiDeps } from "../apiDeps.js";
import { dispatchDuePartnerPayouts } from "../articles/partner-pool.js";
import { TremendousClient } from "../tremendous/client.js";
import {
  WORK_QUEUES,
  dueQueues,
  readWorkMarkers,
  settleWorkMarker,
  type WorkMarkers,
  type WorkQueue,
} from "./work-signals.js";

type Env = Record<string, string | undefined>;
const workerEnv = (): Env => (globalThis as { __ENV?: Env }).__ENV ?? {};

/** A queue still due after a run that handled nothing is stuck (a row the
 *  processor can't progress, or a disabled integration) — retry it hourly
 *  instead of every tick, so one stuck row can't keep Neon awake. */
export const STUCK_QUEUE_BACKOFF_MS = 60 * 60 * 1000;

interface TickQueue {
  name: WorkQueue;
  /** Items handled this run (0 = nothing done). */
  run: () => Promise<number>;
  /** Due windows that end by themselves (event reminder windows) — never
   *  treated as stuck. */
  selfBounded?: boolean;
  /** False → the queue can't run in this deployment; its marker is cleared. */
  enabled?: () => boolean;
}

// ---------------------------------------------------------------------------
// Processors not owned by a service module
// ---------------------------------------------------------------------------

async function processCampaigns(): Promise<number> {
  const result = await CampaignService.live().processDue(new Date());
  if (result.promoted > 0 || result.processed > 0) {
    logger.info("[scheduled] campaigns", result);
  }
  return result.promoted + result.processed;
}

/** Event reminder cadence (1w / 24h / 1h / start) + the post-event
 *  "connect with people you met" prompt for events that just ended. Both
 *  idempotent (event_reminders_sent unique key / per-prompt guard). */
async function processEventReminders(): Promise<number> {
  const deps = buildApiDeps(workerEnv());
  const result = await new EventReminderService(deps).runCadence(getDb());
  if (result.scanned > 0) logger.info("[scheduled] event reminders", { ...result });

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const ev = schema.scheduledEvents;
  const justEnded = await getDb()
    .select({ id: ev.id })
    .from(ev)
    .where(
      and(
        sql`${ev.type} IN ('event', 'coffee')`,
        isNotNull(ev.endAt),
        lte(ev.endAt, now),
        sql`${ev.endAt} >= ${twoHoursAgo.toISOString()}`,
        sql`${ev.cancelledAt} IS NULL`,
      ),
    )
    .limit(50);
  const blast = new EventBlastService(deps);
  for (const { id } of justEnded) {
    try {
      await blast.sendPostEventConnectPrompt(id);
    } catch (err) {
      logger.error("[scheduled] post-event prompt failed", { eventId: id, error: err });
    }
  }
  return result.sent + justEnded.length;
}

/** Token-pack reconcile (gap #2352): re-check a bounded batch of purchases
 *  still `pending` and credit the approved ones (idempotent). */
async function processTokenPackReconcile(): Promise<number> {
  const { buildTokenPackReconcileDeps } = await import("../billing/token-packs/tokenPackDeps.js");
  const { reconcilePendingTokenPacks } = await import("../billing/token-packs/tokenPackReconcile.js");
  const summary = await reconcilePendingTokenPacks(buildTokenPackReconcileDeps(workerEnv()));
  if (summary.scanned > 0) logger.info("[scheduled] token-pack reconcile", summary);
  return summary.scanned;
}

/** Scheduled social posts (#2047). */
async function processSocialPublish(): Promise<number> {
  const { processSocialPublishJobs } = await import("../distribution/process-publish-jobs.js");
  return processSocialPublishJobs(workerEnv() as never);
}

function tremendousConfigured(): boolean {
  const env = workerEnv();
  return Boolean(env.TREMENDOUS_API_KEY && env.TREMENDOUS_FUNDING_SOURCE_ID && env.TREMENDOUS_CAMPAIGN_ID);
}

/** Partner Program payouts (gap #172/#174): Tremendous gift cards for rows
 *  whose 60-day hold expired. */
async function processPartnerPayouts(): Promise<number> {
  const env = workerEnv();
  const tremendous = new TremendousClient({
    apiKey: env.TREMENDOUS_API_KEY!,
    baseUrl: env.TREMENDOUS_BASE_URL,
    fundingSourceId: env.TREMENDOUS_FUNDING_SOURCE_ID!,
    campaignId: env.TREMENDOUS_CAMPAIGN_ID!,
  });
  const result = await dispatchDuePartnerPayouts({ db: getDb(), tremendous, now: new Date() });
  if (result.dispatched > 0 || result.failed > 0) logger.info("[scheduled] partner payouts dispatched", result);
  return result.dispatched + result.failed;
}

export const TICK_QUEUES: readonly TickQueue[] = [
  { name: "followups", run: processFollowUps },
  { name: "campaigns", run: processCampaigns },
  { name: "job-queue", run: processJobQueue },
  { name: "event-reminders", run: processEventReminders, selfBounded: true },
  { name: "token-packs", run: processTokenPackReconcile },
  { name: "social-publish", run: processSocialPublish },
  { name: "partner-payouts", run: processPartnerPayouts, enabled: tremendousConfigured },
];

// ---------------------------------------------------------------------------
// Tick + reconcile
// ---------------------------------------------------------------------------

export async function loadNextDueTimes(): Promise<NextDueTimes> {
  const { TOKEN_PACK_RECONCILE_MIN_AGE_MS, TOKEN_PACK_RECHECK_GAP_MS } = await import(
    "../billing/token-packs/tokenPackReconcile.js"
  );
  const { STALE_RUNNING_MS } = await import("../distribution/drain-publish-jobs.js");
  const { METRICS_SYNC_WINDOW_DAYS } = await import("../../repositories/externalPostMetricsRepository.js");
  const { VIDEO_PUBLISH_PLATFORMS } = await import("../../../../shared/social-platforms.js");
  return new WorkQueueRepository(getDb()).nextDueTimes({
    reminderOffsetsMin: Object.values(REMINDER_OFFSETS_MIN),
    reminderWindowMin: EVENT_REMINDER_WINDOW_MIN,
    tokenPackMinAgeMs: TOKEN_PACK_RECONCILE_MIN_AGE_MS,
    tokenPackRecheckGapMs: TOKEN_PACK_RECHECK_GAP_MS,
    socialStaleRunningMs: STALE_RUNNING_MS,
    metricsDestinations: VIDEO_PUBLISH_PLATFORMS,
    metricsWindowDays: METRICS_SYNC_WINDOW_DAYS,
  });
}

/** Rewrite every marker from the derived next-due times. `stuck` queues
 *  that are still due back off by STUCK_QUEUE_BACKOFF_MS. */
export async function settleAllMarkers(
  markers: WorkMarkers | null,
  nextDue: NextDueTimes,
  nowMs: number,
  stuck: ReadonlySet<WorkQueue> = new Set(),
): Promise<void> {
  const disabled = new Set<WorkQueue>(TICK_QUEUES.filter((q) => q.enabled && !q.enabled()).map((q) => q.name));
  // Hourly queue switched off by env: clear its marker so it never wakes Neon.
  if (workerEnv().POSTING_AGENT_ENABLED === "false") disabled.add("posting-agent");
  await Promise.all(
    WORK_QUEUES.map((queue) => {
      let due = disabled.has(queue) ? null : nextDue[queue];
      if (due && stuck.has(queue) && due.getTime() <= nowMs) due = new Date(nowMs + STUCK_QUEUE_BACKOFF_MS);
      return settleWorkMarker(queue, markers?.get(queue) ?? null, due, nowMs);
    }),
  );
}

export interface TickSummary {
  ran: WorkQueue[];
  handled: Partial<Record<WorkQueue, number>>;
}

/**
 * The 5-minute tick. Idle path = KV reads only (one `get` per queue).
 * `markers === null` (no KV binding / KV down) runs every queue — the
 * pre-marker behaviour — and skips the marker rewrite.
 */
export async function runWorkQueueTick(now: Date = new Date()): Promise<TickSummary> {
  const nowMs = now.getTime();
  const markers = await readWorkMarkers();
  const runnable = TICK_QUEUES.filter((q) => !q.enabled || q.enabled());
  const due = new Set(dueQueues(markers, nowMs));
  const toRun = runnable.filter((q) => due.has(q.name));
  if (toRun.length === 0) return { ran: [], handled: {} };

  const handled: Partial<Record<WorkQueue, number>> = {};
  await Promise.all(
    toRun.map(async (q) => {
      try {
        handled[q.name] = await q.run();
      } catch (err) {
        handled[q.name] = 0;
        logger.error(`[scheduled] queue ${q.name} failed`, err);
      }
    }),
  );

  if (markers) {
    const stuck = new Set(toRun.filter((q) => !q.selfBounded && (handled[q.name] ?? 0) === 0).map((q) => q.name));
    try {
      await settleAllMarkers(markers, await loadNextDueTimes(), Date.now(), stuck);
    } catch (err) {
      logger.error("[scheduled] work marker settle failed", err);
    }
  }
  return { ran: toRun.map((q) => q.name), handled };
}

/** Reconcile hours (cron-plan.ts RECONCILE_HOURS): re-derive every marker
 *  from Postgres (one query). Repairs markers a writer forgot to set or a
 *  failed KV write lost. */
export async function reconcileWorkMarkers(now: Date = new Date()): Promise<void> {
  const markers = await readWorkMarkers();
  if (!markers) return;
  await settleAllMarkers(markers, await loadNextDueTimes(), now.getTime());
}
