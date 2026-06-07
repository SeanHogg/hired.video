/**
 * Streak engine — pure state-machine tests.
 *
 * Run: node --import tsx --test src/domains/gamification/__tests__/streak-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { rollStreak, utcDay, localDay } from "../streak-engine.js";

const base = (over: Partial<{
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  lastBonusMilestone: number;
}> = {}) => ({
  currentStreak: 1,
  longestStreak: 1,
  lastActivityDate: "2026-06-01",
  lastBonusMilestone: 0,
  ...over,
});

describe("streak-engine — rollStreak", () => {
  it("starts a fresh streak at 1 when there is no prior row", () => {
    const out = rollStreak({ current: null, activityDate: "2026-06-07" });
    assert.equal(out.next.currentStreak, 1);
    assert.equal(out.next.longestStreak, 1);
    assert.equal(out.next.lastActivityDate, "2026-06-07");
    assert.equal(out.milestoneAwarded, null);
  });

  it("starts at 1 when the row exists but lastActivityDate is null", () => {
    const out = rollStreak({
      current: base({ lastActivityDate: null }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 1);
    assert.equal(out.milestoneAwarded, null);
  });

  it("is a no-op on a second activity the same day", () => {
    const out = rollStreak({
      current: base({ currentStreak: 5, longestStreak: 9, lastActivityDate: "2026-06-07" }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 5);
    assert.equal(out.next.longestStreak, 9);
    assert.equal(out.milestoneAwarded, null);
  });

  it("increments by 1 on a consecutive next day", () => {
    const out = rollStreak({
      current: base({ currentStreak: 3, longestStreak: 3, lastActivityDate: "2026-06-06" }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 4);
    assert.equal(out.next.longestStreak, 4);
    assert.equal(out.next.lastActivityDate, "2026-06-07");
    assert.equal(out.milestoneAwarded, null);
  });

  it("keeps the longest streak when the current one is shorter", () => {
    const out = rollStreak({
      current: base({ currentStreak: 2, longestStreak: 30, lastActivityDate: "2026-06-06" }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 3);
    assert.equal(out.next.longestStreak, 30); // unchanged
  });

  it("resets to 1 on a 2-day gap and clears the milestone counter", () => {
    const out = rollStreak({
      current: base({ currentStreak: 12, longestStreak: 12, lastActivityDate: "2026-06-04", lastBonusMilestone: 7 }),
      activityDate: "2026-06-07", // 3-day gap
    });
    assert.equal(out.next.currentStreak, 1);
    assert.equal(out.next.longestStreak, 12); // longest preserved across reset
    assert.equal(out.next.lastBonusMilestone, 0);
    assert.equal(out.milestoneAwarded, null);
  });

  it("awards the 7-day milestone when crossing into day 7", () => {
    const out = rollStreak({
      current: base({ currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-06-06", lastBonusMilestone: 0 }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 7);
    assert.ok(out.milestoneAwarded);
    assert.equal(out.milestoneAwarded!.day, 7);
    assert.equal(out.milestoneAwarded!.bonus, 100);
    assert.equal(out.milestoneAwarded!.badgeSlug, "on_fire");
    assert.equal(out.next.lastBonusMilestone, 7);
  });

  it("does not re-award a milestone already paid in this streak", () => {
    const out = rollStreak({
      current: base({ currentStreak: 7, longestStreak: 7, lastActivityDate: "2026-06-07", lastBonusMilestone: 7 }),
      activityDate: "2026-06-08",
    });
    assert.equal(out.next.currentStreak, 8);
    assert.equal(out.milestoneAwarded, null);
    assert.equal(out.next.lastBonusMilestone, 7);
  });

  it("re-earns the 7-day milestone after a reset rebuilds the streak", () => {
    // Reset wiped lastBonusMilestone to 0; climbing back to 7 re-awards.
    const out = rollStreak({
      current: base({ currentStreak: 6, longestStreak: 30, lastActivityDate: "2026-06-06", lastBonusMilestone: 0 }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.milestoneAwarded!.day, 7);
    assert.equal(out.milestoneAwarded!.badgeSlug, "on_fire");
  });

  it("awards only the highest crossed milestone on a multi-rung jump (defensive)", () => {
    // Not reachable via +1/day in practice, but the helper must pick the
    // highest crossed rung rather than the lowest.
    const out = rollStreak({
      current: base({ currentStreak: 13, longestStreak: 13, lastActivityDate: "2026-06-06", lastBonusMilestone: 7 }),
      activityDate: "2026-06-07",
    });
    assert.equal(out.next.currentStreak, 14);
    assert.equal(out.milestoneAwarded!.day, 14);
    assert.equal(out.milestoneAwarded!.bonus, 250);
  });
});

describe("streak-engine — day resolution", () => {
  it("utcDay formats YYYY-MM-DD in UTC", () => {
    assert.equal(utcDay(new Date("2026-06-07T23:30:00Z")), "2026-06-07");
  });

  it("localDay falls back to UTC for a null timezone", () => {
    assert.equal(localDay(null, new Date("2026-06-07T23:30:00Z")), "2026-06-07");
  });

  it("localDay falls back to UTC for an invalid timezone", () => {
    assert.equal(localDay("Not/AZone", new Date("2026-06-07T12:00:00Z")), "2026-06-07");
  });

  it("localDay rolls the date back for a behind-UTC timezone late in the UTC day", () => {
    // 2026-06-08 01:30 UTC is still 2026-06-07 in America/Los_Angeles.
    assert.equal(localDay("America/Los_Angeles", new Date("2026-06-08T01:30:00Z")), "2026-06-07");
  });
});
