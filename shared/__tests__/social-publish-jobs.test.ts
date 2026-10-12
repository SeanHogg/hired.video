/**
 * Scheduled-post vocabulary (#2047): the send window (past refused, more
 * than 90 days ahead refused, "now" from a slow form accepted), lane rules
 * per destination, and which Hub list each status lands in.
 *
 * Run: node --import tsx --test shared/__tests__/social-publish-jobs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLaneValidFor,
  latestScheduleTime,
  publishJobView,
  PUBLISH_JOB_VIEW_STATUSES,
  PUBLISH_JOB_STATUSES,
  SCHEDULE_MAX_AHEAD_DAYS,
  SCHEDULE_PAST_GRACE_MS,
  scheduleProblem,
} from "../social-publish-jobs.js";

const NOW = new Date("2026-10-11T14:05:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("scheduleProblem — the send window", () => {
  it("accepts a time later today and one exactly 90 days out", () => {
    assert.equal(scheduleProblem(new Date("2026-10-11T18:30:00.000Z"), NOW), null);
    assert.equal(scheduleProblem(new Date(NOW.getTime() + SCHEDULE_MAX_AHEAD_DAYS * DAY), NOW), null);
    assert.equal(scheduleProblem(latestScheduleTime(NOW), NOW), null);
  });

  it("accepts 'now' sent from a slow form (within the grace)", () => {
    assert.equal(scheduleProblem(new Date(NOW.getTime() - SCHEDULE_PAST_GRACE_MS), NOW), null);
  });

  it("refuses a time in the past", () => {
    assert.equal(scheduleProblem(new Date("2026-10-10T09:00:00.000Z"), NOW), "IN_PAST");
    assert.equal(scheduleProblem(new Date(NOW.getTime() - SCHEDULE_PAST_GRACE_MS - 1), NOW), "IN_PAST");
  });

  it("refuses a time more than 90 days ahead", () => {
    assert.equal(scheduleProblem(new Date(NOW.getTime() + SCHEDULE_MAX_AHEAD_DAYS * DAY + 1), NOW), "TOO_FAR_AHEAD");
    assert.equal(scheduleProblem(new Date("2027-06-01T09:00:00.000Z"), NOW), "TOO_FAR_AHEAD");
  });

  it("refuses an unparseable time", () => {
    assert.equal(scheduleProblem(new Date("not a date"), NOW), "INVALID");
  });
});

describe("isLaneValidFor", () => {
  it("every network takes the user's own account", () => {
    for (const d of ["youtube", "tiktok", "instagram", "x", "facebook", "linkedin"] as const) {
      assert.equal(isLaneValidFor(d, "self"), true, d);
    }
  });

  it("the brand lane exists only where hired.video has a brand publisher (not LinkedIn)", () => {
    assert.equal(isLaneValidFor("tiktok", "managed"), true);
    assert.equal(isLaneValidFor("youtube", "managed"), true);
    assert.equal(isLaneValidFor("linkedin", "managed"), false);
  });

  it("the feed is always the creator's own post", () => {
    assert.equal(isLaneValidFor("feed", "self"), true);
    assert.equal(isLaneValidFor("feed", "managed"), false);
  });
});

describe("Hub lists", () => {
  it("scheduled/running/done/failed/cancelled land in exactly one list", () => {
    for (const status of ["scheduled", "running", "done", "failed", "cancelled"] as const) {
      const lists = Object.entries(PUBLISH_JOB_VIEW_STATUSES).filter(([, s]) => s.includes(status));
      assert.equal(lists.length, 1, status);
      assert.equal(lists[0][0], publishJobView(status));
    }
  });

  it("draft and expired belong on no Hub list", () => {
    assert.equal(publishJobView("draft"), null);
    assert.equal(publishJobView("expired"), null);
    for (const status of ["draft", "expired"] as const) {
      const lists = Object.entries(PUBLISH_JOB_VIEW_STATUSES).filter(([, s]) => s.includes(status));
      assert.equal(lists.length, 0, status);
    }
  });

  it("every status is either on one list or on none", () => {
    for (const status of PUBLISH_JOB_STATUSES) {
      const lists = Object.entries(PUBLISH_JOB_VIEW_STATUSES).filter(([, s]) => s.includes(status));
      assert.ok(lists.length <= 1, status);
      assert.equal(lists[0]?.[0] ?? null, publishJobView(status));
    }
  });
});
