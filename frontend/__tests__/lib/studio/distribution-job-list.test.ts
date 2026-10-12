/**
 * #2047 — the Distribution Hub's job list: what each job state says and
 * offers (scheduled / retrying / sending / sent / in review / live /
 * rejected / failed / cancelled), the link a sent post shows, day grouping,
 * and the "now or later" send-time checks the Hub and the Post dock share.
 */
import { describe, expect, it } from "vitest";
import type { PublishJob } from "@/lib/services/distribution-service";
import { groupJobsByDay, jobHref, jobRowState, localDayKey } from "@/lib/studio/distribution/job-list";
import { sendTimeOf, SEND_NOW, toLocalInput, whenProblem } from "@/lib/studio/distribution/schedule-when";

function job(overrides: Partial<PublishJob> = {}): PublishJob {
  return {
    id: "5d0c3a8e-2f41-4b6a-9e7d-1c2b3a4f5e60",
    projectId: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
    projectTitle: "Maya Chen — Product Designer",
    destination: "tiktok",
    lane: "self",
    caption: "Open to senior product design roles. #design",
    status: "scheduled",
    scheduledAt: "2026-10-12T16:00:00.000Z",
    nextAttemptAt: "2026-10-12T16:00:00.000Z",
    attempts: 0,
    lastError: null,
    completedAt: null,
    externalUrl: null,
    promotionStatus: null,
    feedPostId: null,
    ...overrides,
  };
}

describe("jobRowState", () => {
  it("scheduled: waits for its send time and can be cancelled", () => {
    const row = jobRowState(job());
    expect(row).toMatchObject({ tone: "waiting", labelKey: "distribution.status.scheduled", canCancel: true, canRetry: false });
    expect(row.time).toBe("2026-10-12T16:00:00.000Z");
    expect(row.timeKey).toBe("distribution.time.sends");
  });

  it("retrying: shows the next attempt, still cancellable", () => {
    const row = jobRowState(
      job({ attempts: 1, nextAttemptAt: "2026-10-12T16:10:00.000Z", lastError: "TikTok upload chunk 1/1 failed (503)" }),
    );
    expect(row).toMatchObject({ labelKey: "distribution.status.retrying", time: "2026-10-12T16:10:00.000Z", canCancel: true });
  });

  it("sending: no actions while the queue is posting it", () => {
    expect(jobRowState(job({ status: "running", attempts: 1 }))).toMatchObject({ tone: "sending", canCancel: false, canRetry: false });
  });

  it("sent (own account): links to the post", () => {
    const row = jobRowState(
      job({ status: "done", completedAt: "2026-10-12T16:03:12.000Z", externalUrl: "https://www.tiktok.com/@mayachen" }),
    );
    expect(row).toMatchObject({ tone: "sent", labelKey: "distribution.status.sent", href: "https://www.tiktok.com/@mayachen" });
    expect(row.time).toBe("2026-10-12T16:03:12.000Z");
  });

  it("sent to the feed: links to the feed post", () => {
    expect(jobRowState(job({ destination: "feed", status: "done", feedPostId: "f1e2d3c4-0000-4b5a-8c9d-0e1f2a3b4c5d" })).href).toBe(
      "/feed/f1e2d3c4-0000-4b5a-8c9d-0e1f2a3b4c5d",
    );
  });

  it("brand lane: follows the review (in review → live → not approved)", () => {
    const managed = (promotionStatus: string | null) =>
      jobRowState(job({ lane: "managed", destination: "youtube", status: "done", promotionStatus }));
    expect(managed("pending")).toMatchObject({ tone: "review", labelKey: "distribution.status.inReview" });
    expect(managed("published")).toMatchObject({ tone: "sent", labelKey: "distribution.status.live" });
    expect(managed("rejected")).toMatchObject({ tone: "failed", labelKey: "distribution.status.rejected" });
    expect(managed(null)).toMatchObject({ labelKey: "distribution.status.submitted" });
  });

  it("failed and cancelled: can be retried, never cancelled, no link", () => {
    for (const status of ["failed", "cancelled"] as const) {
      const row = jobRowState(job({ status, completedAt: "2026-10-12T16:20:00.000Z", externalUrl: "https://x.com/i/status/1" }));
      expect(row).toMatchObject({ canRetry: true, canCancel: false, href: null, timeKey: "distribution.time.stopped" });
    }
  });
});

describe("jobHref", () => {
  it("prefers the network link, then the feed post, else none", () => {
    expect(jobHref({ externalUrl: "https://youtu.be/Ks-_Mh1QhMc", feedPostId: "f" })).toBe("https://youtu.be/Ks-_Mh1QhMc");
    expect(jobHref({ externalUrl: null, feedPostId: null })).toBeNull();
  });
});

describe("groupJobsByDay", () => {
  it("groups consecutive jobs by the local day of their row time", () => {
    const a = job({ id: "a", scheduledAt: "2026-10-12T16:00:00.000Z" });
    const b = job({ id: "b", scheduledAt: "2026-10-12T17:30:00.000Z" });
    const c = job({ id: "c", scheduledAt: "2026-10-15T16:00:00.000Z" });
    const groups = groupJobsByDay([a, b, c]);
    expect(groups.map((g) => g.jobs.map((j) => j.id))).toEqual(
      localDayKey(a.scheduledAt) === localDayKey(b.scheduledAt) ? [["a", "b"], ["c"]] : [["a"], ["b"], ["c"]],
    );
    expect(groups.at(-1)?.day).toBe(localDayKey(c.scheduledAt));
  });

  it("an empty list has no groups", () => {
    expect(groupJobsByDay([])).toEqual([]);
  });
});

describe("schedule-when", () => {
  const now = new Date(2026, 9, 11, 14, 5);

  it("now is always valid and sends at now", () => {
    expect(whenProblem(SEND_NOW, now)).toBeNull();
    expect(sendTimeOf(SEND_NOW, now)).toBe(now);
  });

  it("later needs a time, not in the past, not past 90 days", () => {
    expect(whenProblem({ mode: "later", local: "" }, now)).toBe("INVALID");
    expect(whenProblem({ mode: "later", local: "2026-10-10T09:00" }, now)).toBe("IN_PAST");
    expect(whenProblem({ mode: "later", local: "2027-03-01T09:00" }, now)).toBe("TOO_FAR_AHEAD");
    expect(whenProblem({ mode: "later", local: "2026-10-12T09:00" }, now)).toBeNull();
  });

  it("round-trips a local time through the input format", () => {
    expect(toLocalInput(now)).toBe("2026-10-11T14:05");
    expect(sendTimeOf({ mode: "later", local: toLocalInput(now) }, now).getTime()).toBe(now.getTime());
  });
});
