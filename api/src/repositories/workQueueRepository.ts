/**
 * WorkQueueRepository — "when is each background queue next due?" in ONE
 * round-trip. Feeds the KV pending-work markers (services/scheduling/
 * work-signals.ts): the cron tick runs a queue only when its marker is due,
 * then calls this to re-derive every marker; the hourly reconcile calls it
 * to repair markers a writer forgot to set.
 *
 * Each column mirrors the WHERE clause of that queue's processor, so "due"
 * here means "the processor would pick something up at that time". Null =
 * nothing pending. Every predicate is served by the queue's existing due
 * index; each subquery is a MIN / EXISTS, never a row scan into the Worker.
 */
import { sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { WorkQueue } from "../services/scheduling/work-signals.js";

export type DbLike = any;

export interface NextDueParams {
  /** Minutes-before-start of each event reminder (shared/events.ts). */
  reminderOffsetsMin: readonly number[];
  /** Half-width of the reminder window the processor scans (minutes). */
  reminderWindowMin: number;
  /** Token-pack reconcile: min purchase age + re-check gap (ms). */
  tokenPackMinAgeMs: number;
  tokenPackRecheckGapMs: number;
  /** Social publish: a `running` job is re-claimable after this (ms). */
  socialStaleRunningMs: number;
}

export type NextDueTimes = Record<WorkQueue, Date | null>;

const {
  followUpEnrollments: fu,
  emailCampaigns: ec,
  queueJobToProcess: qj,
  scheduledEvents: se,
  tokenPackPurchases: tp,
  socialPublishJobs: sp,
  partnerPayouts: pp,
  recruiterAgentFollowups: raf,
  jobBoardSources: jbs,
} = schema;

const ms = (n: number) => sql.raw(`interval '${Math.max(0, Math.floor(n))} milliseconds'`);

export class WorkQueueRepository {
  constructor(private readonly db: DbLike) {}

  async nextDueTimes(p: NextDueParams): Promise<NextDueTimes> {
    const offsets = sql.raw(`ARRAY[${p.reminderOffsetsMin.map((n) => Math.floor(n)).join(",")}]::int[]`);
    const windowMin = Math.floor(p.reminderWindowMin);
    const result = await this.db.execute(sql`
      SELECT
        (SELECT min(${fu.nextSendAt}) FROM ${fu}
          WHERE ${fu.status} = 'active' AND ${fu.nextSendAt} IS NOT NULL) AS followups,
        CASE WHEN EXISTS (SELECT 1 FROM ${ec} WHERE ${ec.status} = 'sending') THEN now()
             ELSE (SELECT min(${ec.scheduledAt}) FROM ${ec} WHERE ${ec.status} = 'scheduled') END AS campaigns,
        CASE WHEN EXISTS (SELECT 1 FROM ${qj}
               WHERE ${qj.status} = 'pending' AND ${qj.attempts} <= ${qj.maxAttempts} - 1)
             THEN now() END AS job_queue,
        (SELECT min(t) FROM (
            SELECT ${se.startAt} - make_interval(mins => o + ${windowMin}) AS t,
                   ${se.startAt} - make_interval(mins => o - ${windowMin}) AS until
              FROM ${se} CROSS JOIN unnest(${offsets}) AS o
             WHERE ${se.type} IN ('event', 'coffee') AND ${se.cancelledAt} IS NULL
               AND ${se.startAt} > now() - make_interval(mins => ${windowMin})
            UNION ALL
            SELECT ${se.endAt} AS t, ${se.endAt} + make_interval(mins => ${windowMin}) AS until
              FROM ${se}
             WHERE ${se.type} IN ('event', 'coffee') AND ${se.cancelledAt} IS NULL
               AND ${se.endAt} > now() - make_interval(mins => ${windowMin})
          ) w WHERE w.until > now()) AS event_reminders,
        (SELECT min(greatest(${tp.createdAt} + ${ms(p.tokenPackMinAgeMs)},
                             coalesce(${tp.checkedAt} + ${ms(p.tokenPackRecheckGapMs)}, ${tp.createdAt})))
           FROM ${tp} WHERE ${tp.status} = 'pending') AS token_packs,
        (SELECT min(CASE WHEN ${sp.status} = 'scheduled' THEN ${sp.runAt}
                         ELSE ${sp.lockedAt} + ${ms(p.socialStaleRunningMs)} END)
           FROM ${sp} WHERE ${sp.status} IN ('scheduled', 'running')) AS social_publish,
        (SELECT min(${pp.holdUntil}) FROM ${pp} WHERE ${pp.status} = 'pending') AS partner_payouts,
        (SELECT min(${raf.scheduledFor}) FROM ${raf} WHERE ${raf.status} = 'pending') AS recruiter_agent_followups
    `);
    const rows: Array<Record<string, unknown>> = Array.isArray(result) ? result : (result?.rows ?? []);
    const row = rows[0] ?? {};
    const at = (v: unknown): Date | null => (v == null ? null : new Date(v as string));
    return {
      followups: at(row.followups),
      campaigns: at(row.campaigns),
      "job-queue": at(row.job_queue),
      "event-reminders": at(row.event_reminders),
      "token-packs": at(row.token_packs),
      "social-publish": at(row.social_publish),
      "partner-payouts": at(row.partner_payouts),
      "recruiter-agent-followups": at(row.recruiter_agent_followups),
    };
  }

  /** Active job-board sources — the hourly cron records whether the
   *  :00/:30 scrape has anything to do. */
  async countActiveJobBoardSources(): Promise<number> {
    const result = await this.db.execute(sql`SELECT count(*)::int AS n FROM ${jbs} WHERE ${jbs.isActive} = true`);
    const rows: Array<{ n?: unknown }> = Array.isArray(result) ? result : (result?.rows ?? []);
    return Number(rows[0]?.n ?? 0);
  }
}
