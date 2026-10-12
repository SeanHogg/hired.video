/**
 * The Distribution Hub's job list, as pure functions (#2047): what one job's
 * row says (status, time, which actions it offers) and how a list groups by
 * day. Kept free of React so every state is unit-tested.
 */
import type { PublishJob } from "@/lib/services/distribution-service";

export type JobTone = "waiting" | "sending" | "sent" | "review" | "failed" | "cancelled";

export interface JobRowState {
  tone: JobTone;
  /** i18n key of the status chip. */
  labelKey: string;
  /** The time the row shows: the send time, the next attempt, or when it finished. */
  time: string;
  /** i18n key of the time's prefix ("Sends", "Next try", "Sent", "Stopped"). */
  timeKey: string;
  canCancel: boolean;
  canRetry: boolean;
  /** Where the post lives, when it went out (network link or the feed post). */
  href: string | null;
}

const PROMOTION_LABEL: Record<string, { tone: JobTone; labelKey: string }> = {
  pending: { tone: "review", labelKey: "distribution.status.inReview" },
  failed: { tone: "review", labelKey: "distribution.status.inReview" },
  published: { tone: "sent", labelKey: "distribution.status.live" },
  rejected: { tone: "failed", labelKey: "distribution.status.rejected" },
};

export function jobHref(job: Pick<PublishJob, "externalUrl" | "feedPostId">): string | null {
  if (job.externalUrl) return job.externalUrl;
  return job.feedPostId ? `/feed/${job.feedPostId}` : null;
}

export function jobRowState(job: PublishJob): JobRowState {
  const href = jobHref(job);
  switch (job.status) {
    case "scheduled":
      return job.attempts > 0
        ? { tone: "waiting", labelKey: "distribution.status.retrying", time: job.nextAttemptAt, timeKey: "distribution.time.nextTry", canCancel: true, canRetry: false, href }
        : { tone: "waiting", labelKey: "distribution.status.scheduled", time: job.scheduledAt, timeKey: "distribution.time.sends", canCancel: true, canRetry: false, href };
    case "running":
      return { tone: "sending", labelKey: "distribution.status.sending", time: job.scheduledAt, timeKey: "distribution.time.sends", canCancel: false, canRetry: false, href };
    case "done": {
      const done = job.completedAt ?? job.scheduledAt;
      if (job.lane === "managed") {
        const p = PROMOTION_LABEL[job.promotionStatus ?? ""] ?? { tone: "review" as const, labelKey: "distribution.status.submitted" };
        return { ...p, time: done, timeKey: "distribution.time.submitted", canCancel: false, canRetry: false, href };
      }
      return { tone: "sent", labelKey: "distribution.status.sent", time: done, timeKey: "distribution.time.sent", canCancel: false, canRetry: false, href };
    }
    case "failed":
      return { tone: "failed", labelKey: "distribution.status.failed", time: job.completedAt ?? job.scheduledAt, timeKey: "distribution.time.stopped", canCancel: false, canRetry: true, href: null };
    default:
      // "cancelled"
      return { tone: "cancelled", labelKey: "distribution.status.cancelled", time: job.completedAt ?? job.scheduledAt, timeKey: "distribution.time.stopped", canCancel: false, canRetry: true, href: null };
  }
}

/** Local calendar day of an ISO time (YYYY-MM-DD) — the list's group key. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Jobs grouped by the local day of the time their row shows, in list order. */
export function groupJobsByDay(jobs: readonly PublishJob[]): Array<{ day: string; jobs: PublishJob[] }> {
  const groups: Array<{ day: string; jobs: PublishJob[] }> = [];
  for (const job of jobs) {
    const day = localDayKey(jobRowState(job).time);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.jobs.push(job);
    else groups.push({ day, jobs: [job] });
  }
  return groups;
}
