/**
 * AI posting agent pure helpers (#2300).
 * Run: node --import tsx --test shared/__tests__/posting-agent.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUndoAgentApproval,
  clipSecondsForMaster,
  computeNextPlanTime,
  computeRetryAt,
  fitCaption,
  isInCooldown,
  isInQuietHours,
  isTikTokReady,
  isWithinDailyLimit,
  localDayStart,
  localWeekStart,
  nextPostSlot,
  pickFreshWindow,
  rotateProjects,
  selectAgentClip,
  shouldSendAgentPush,
  slotsForWeek,
  snapToScene,
  variantKeyForClip,
  windowOverlapRatio,
  windowsFromDuration,
  normalizeVideoDurationSec,
  agentJobNeedsPreparedClip,
  transcriptForClip,
  type HighlightWindow,
} from "../posting-agent.js";

const w = (start: number, end: number, score: number): HighlightWindow => ({
  startSecond: start,
  endSecond: end,
  score,
});

describe("pickFreshWindow", () => {
  it("picks the highest-scoring window that is long enough", () => {
    const picked = pickFreshWindow([w(0, 30, 0.6), w(40, 80, 0.9), w(90, 120, 0.7)], 30, []);
    assert.deepEqual(picked, w(40, 80, 0.9));
  });

  it("skips windows scoring below 0.4", () => {
    assert.equal(pickFreshWindow([w(0, 30, 0.39), w(40, 80, 0.2)], 30, []), null);
  });

  it("skips a window that overlaps a used one by more than 50%", () => {
    const used = [w(0, 30, 1)];
    // 0–30 used; 10–40 overlaps 20/30 ≈ 0.67 → skip; 40–70 is fresh.
    const picked = pickFreshWindow([w(10, 40, 0.95), w(40, 70, 0.5)], 30, used);
    assert.deepEqual(picked, w(40, 70, 0.5));
  });

  it("allows overlap at exactly 50%", () => {
    const used = [w(0, 30, 1)];
    const candidate = w(15, 45, 0.8); // overlap 15 / 30 = 0.5
    assert.equal(windowOverlapRatio(used[0], candidate), 0.5);
    assert.deepEqual(pickFreshWindow([candidate], 30, used), candidate);
  });
});

describe("windowOverlapRatio", () => {
  it("returns 0 for a zero-length window and 1 for identical windows", () => {
    assert.equal(windowOverlapRatio(w(10, 10, 1), w(0, 30, 0.9)), 0);
    assert.equal(windowOverlapRatio(w(0, 30, 0.8), w(0, 30, 0.9)), 1);
  });
});

describe("snapToScene", () => {
  it("snaps to a scene boundary within 2s", () => {
    assert.equal(snapToScene(10.5, [0, 12, 24]), 12);
    assert.equal(snapToScene(10.5, [0, 20, 40]), 10.5); // 20 is 9.5s away
  });
});

describe("clipSecondsForMaster", () => {
  it("uses the whole video when it is 45s or shorter", () => {
    assert.equal(clipSecondsForMaster(45), 45);
    assert.equal(clipSecondsForMaster(20), 20);
  });
  it("targets 30s when the master is longer", () => {
    assert.equal(clipSecondsForMaster(90), 30);
  });
});

describe("windowsFromDuration / selectAgentClip", () => {
  it("posts the whole video when it is 45s or shorter", () => {
    assert.deepEqual(windowsFromDuration(40), [w(0, 40, 1)]);
  });

  it("slides 30s windows across a longer master", () => {
    const windows = windowsFromDuration(90, 30);
    assert.ok(windows.length >= 3);
    assert.deepEqual(windows[0], w(0, 30, 0.5));
  });

  it("snaps the picked window to a nearby scene start", () => {
    const picked = selectAgentClip([w(10.5, 40.5, 0.9)], [], 30, [0, 12, 24]);
    assert.deepEqual(picked, w(12, 42, 0.9));
  });

  it("skips used windows and takes the next fresh slice", () => {
    const windows = windowsFromDuration(90, 30);
    const picked = selectAgentClip(windows, [w(0, 30, 1)], 30);
    assert.ok(picked);
    assert.ok(picked.startSecond >= 15);
  });

  it("builds a variant key with the clip start", () => {
    assert.equal(variantKeyForClip("9x16", 30, 45), "9x16-30s45");
    assert.equal(variantKeyForClip("9x16", 30), "9x16-30s");
  });

  it("treats millisecond durations as seconds", () => {
    assert.equal(normalizeVideoDurationSec(90), 90);
    assert.equal(normalizeVideoDurationSec(90_000), 90);
    assert.equal(normalizeVideoDurationSec(null), 0);
  });
});

describe("rotateProjects", () => {
  it("takes never-posted first, then the oldest agent post, ties by most recent publish", () => {
    const never = {
      projectId: "a",
      lastAgentPostedAt: null,
      lastPublishedAt: new Date("2026-01-01"),
    };
    const old = {
      projectId: "b",
      lastAgentPostedAt: new Date("2026-02-01"),
      lastPublishedAt: new Date("2026-03-01"),
    };
    const newer = {
      projectId: "c",
      lastAgentPostedAt: new Date("2026-03-01"),
      lastPublishedAt: new Date("2026-04-01"),
    };
    const tiedOlderPublish = {
      projectId: "d",
      lastAgentPostedAt: new Date("2026-02-01"),
      lastPublishedAt: new Date("2026-02-15"),
    };
    assert.deepEqual(
      rotateProjects([newer, tiedOlderPublish, never, old]).map((p) => p.projectId),
      ["a", "b", "d", "c"],
    );
  });
});

describe("isInCooldown", () => {
  it("is false when never posted, true inside 14 days", () => {
    const now = new Date("2026-04-20T00:00:00Z");
    assert.equal(isInCooldown(null, now), false);
    assert.equal(isInCooldown(new Date("2026-04-10T00:00:00Z"), now), true);
    assert.equal(isInCooldown(new Date("2026-04-01T00:00:00Z"), now), false);
  });
});

describe("isInQuietHours", () => {
  it("handles a wrapping window 21:00–08:00", () => {
    assert.equal(isInQuietHours(21 * 60, 21 * 60, 8 * 60), true);
    assert.equal(isInQuietHours(23 * 60, 21 * 60, 8 * 60), true);
    assert.equal(isInQuietHours(7 * 60, 21 * 60, 8 * 60), true);
    assert.equal(isInQuietHours(8 * 60, 21 * 60, 8 * 60), false);
    assert.equal(isInQuietHours(12 * 60, 21 * 60, 8 * 60), false);
  });
});

describe("computeNextPlanTime", () => {
  const from = new Date("2026-04-07T12:00:00Z");

  it("light waits 7 days and lands in the future", () => {
    const next = computeNextPlanTime(from, "light");
    assert.equal(next.toISOString(), "2026-04-14T12:00:00.000Z");
    assert.ok(next.getTime() > from.getTime());
  });

  it("steady waits 2 days and lands in the future", () => {
    const next = computeNextPlanTime(from, "steady");
    assert.equal(next.toISOString(), "2026-04-09T12:00:00.000Z");
    assert.ok(next.getTime() > from.getTime());
  });

  it("daily (max) waits 1 day and lands in the future", () => {
    const next = computeNextPlanTime(from, "daily");
    assert.equal(next.toISOString(), "2026-04-08T12:00:00.000Z");
    assert.ok(next.getTime() > from.getTime());
  });
});

describe("isWithinDailyLimit", () => {
  it("caps YouTube at 3 and every other destination at 1", () => {
    assert.equal(isWithinDailyLimit(2, "youtube"), true);
    assert.equal(isWithinDailyLimit(3, "youtube"), false);
    assert.equal(isWithinDailyLimit(0, "linkedin"), true);
    assert.equal(isWithinDailyLimit(1, "feed"), false);
  });
});

describe("isTikTokReady", () => {
  it("stays off until the audit flag is passed", () => {
    assert.equal(isTikTokReady(), false);
    assert.equal(isTikTokReady(false), false);
    assert.equal(isTikTokReady(true), true);
  });
});

describe("slotsForWeek", () => {
  it("Steady is Mon/Wed/Fri at the local post time, including across US DST", () => {
    // 2026-03-08 is the US spring-forward; the week still has three noon slots.
    const from = new Date("2026-03-08T00:00:00Z");
    const to = new Date("2026-03-15T00:00:00Z");
    const slots = slotsForWeek("steady", 12 * 60, "America/New_York", from, to);
    assert.equal(slots.length, 3);
    for (const s of slots) {
      const hour = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hourCycle: "h23",
      }).format(s);
      assert.equal(hour, "12", s.toISOString());
    }
  });

  it("Light is Tuesday only", () => {
    const from = new Date("2026-04-06T00:00:00Z"); // Monday
    const to = new Date("2026-04-13T00:00:00Z");
    const slots = slotsForWeek("light", 9 * 60, "UTC", from, to);
    assert.equal(slots.length, 1);
    assert.equal(slots[0].getUTCDay(), 2);
  });
});

describe("canUndoAgentApproval", () => {
  const t0 = new Date("2026-04-07T12:00:00Z");
  it("is true for scheduled jobs inside 10 minutes", () => {
    assert.equal(canUndoAgentApproval("scheduled", t0, new Date(t0.getTime() + 9 * 60 * 1000)), true);
  });
  it("is false after 10 minutes", () => {
    assert.equal(canUndoAgentApproval("scheduled", t0, new Date(t0.getTime() + 11 * 60 * 1000)), false);
  });
  it("is false at exactly 10 minutes", () => {
    assert.equal(canUndoAgentApproval("scheduled", t0, new Date(t0.getTime() + 10 * 60 * 1000)), false);
  });
  it("is false for drafts", () => {
    assert.equal(canUndoAgentApproval("draft", t0, new Date(t0.getTime() + 1000)), false);
  });
});

describe("nextPostSlot", () => {
  it("shifts a quiet-hours post time to the end of quiet hours", () => {
    const now = new Date("2026-04-07T12:00:00Z");
    const slot = nextPostSlot(now, 22 * 60, 21 * 60, 8 * 60, "UTC");
    assert.equal(slot.toISOString(), "2026-04-08T08:00:00.000Z");
  });

  it("keeps a noon slot that is outside quiet hours", () => {
    const now = new Date("2026-04-07T10:00:00Z");
    const slot = nextPostSlot(now, 12 * 60, 21 * 60, 8 * 60, "UTC");
    assert.equal(slot.toISOString(), "2026-04-07T12:00:00.000Z");
  });

  it("keeps a noon slot in America/New_York (EDT)", () => {
    // 2026-04-07T14:00:00Z = 10:00 EDT; noon Eastern is 16:00Z.
    const now = new Date("2026-04-07T14:00:00Z");
    const slot = nextPostSlot(now, 12 * 60, 21 * 60, 8 * 60, "America/New_York");
    assert.equal(slot.toISOString(), "2026-04-07T16:00:00.000Z");
  });
});

describe("computeRetryAt", () => {
  it("pushes a 2am retry to 08:00 UTC", () => {
    const night = new Date("2026-04-07T02:00:00Z");
    const retry = computeRetryAt(night, 5 * 60 * 1000);
    assert.equal(retry.toISOString(), "2026-04-07T08:00:00.000Z");
  });

  it("leaves a midday retry on the backoff", () => {
    const noon = new Date("2026-04-07T12:00:00Z");
    const retry = computeRetryAt(noon, 5 * 60 * 1000);
    assert.equal(retry.toISOString(), "2026-04-07T12:05:00.000Z");
  });
});

describe("localDayStart / localWeekStart", () => {
  it("starts the UTC day at midnight", () => {
    const at = new Date("2026-04-07T15:30:00Z");
    assert.equal(localDayStart(at, "UTC").toISOString(), "2026-04-07T00:00:00.000Z");
  });

  it("starts the ISO week on Monday 00:00", () => {
    // Tuesday 7 Apr 2026 → Monday 6 Apr
    const at = new Date("2026-04-07T15:30:00Z");
    assert.equal(localWeekStart(at, "UTC").toISOString(), "2026-04-06T00:00:00.000Z");
  });
});

describe("fitCaption", () => {
  it("truncates with an ellipsis at the cap", () => {
    assert.equal(fitCaption("hello world", 8), "hello w…");
    assert.equal(fitCaption("short", 20), "short");
  });
});

describe("shouldSendAgentPush", () => {
  it("is silent during quiet hours", () => {
    assert.equal(shouldSendAgentPush(22 * 60), false);
    assert.equal(shouldSendAgentPush(12 * 60), true);
  });
});

describe("agentJobNeedsPreparedClip", () => {
  it("requires a variant on agent network jobs", () => {
    assert.equal(
      agentJobNeedsPreparedClip({ source: "agent", destination: "instagram", renderVariantId: null }),
      true,
    );
    assert.equal(
      agentJobNeedsPreparedClip({ source: "agent", destination: "instagram", renderVariantId: "cut-1" }),
      false,
    );
  });

  it("does not require a variant for feed, postYourself, or user jobs", () => {
    assert.equal(agentJobNeedsPreparedClip({ source: "agent", destination: "feed" }), false);
    assert.equal(
      agentJobNeedsPreparedClip({ source: "agent", destination: "tiktok", postYourself: true }),
      false,
    );
    assert.equal(agentJobNeedsPreparedClip({ source: "user", destination: "instagram" }), false);
  });
});

describe("transcriptForClip", () => {
  it("joins words overlapping the clip window", () => {
    const words = [
      { word: "Hello", start: 0, end: 1 },
      { word: "world", start: 1, end: 2 },
      { word: "from", start: 10, end: 11 },
      { word: "later", start: 40, end: 41 },
    ];
    assert.equal(transcriptForClip(words, 0, 30), "Hello world from");
    assert.equal(transcriptForClip(words, 9.5, 11.5), "from");
  });

  it("caps at 1500 characters on a word boundary", () => {
    const words = Array.from({ length: 400 }, (_, i) => ({
      word: "word",
      start: i,
      end: i + 1,
    }));
    const out = transcriptForClip(words, 0, 1000);
    assert.ok(out.length <= 1500);
    assert.equal(out.length, 1499); // 300 × "word" + 299 spaces
    assert.ok(out.endsWith("word"));
    assert.equal(out.startsWith("word "), true);
  });

  it('returns "" when the window is empty', () => {
    assert.equal(transcriptForClip([], 0, 30), "");
    assert.equal(transcriptForClip([{ word: "later", start: 40, end: 41 }], 0, 30), "");
    assert.equal(transcriptForClip([{ word: "hi", start: 0, end: 1 }], 10, 10), "");
  });
});
