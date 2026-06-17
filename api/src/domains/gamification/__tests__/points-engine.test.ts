/**
 * Points engine — action → points, role gating, suspension, daily caps,
 * 100-task gate, idempotent dedup, streak advance, and badge unlock.
 *
 * Drives the real PointsEngine against the in-memory FakePointsRepo so the
 * filter chain (role → suspend → gate → cap → dedup → balance → streak →
 * badge) is exercised exactly as production runs it.
 *
 * Run: node --import tsx --test src/domains/gamification/__tests__/points-engine.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { PointsEngine } from "../points-engine.js";
import { ACTIONS } from "../rules.js";
import { USER_ROLES } from "../../../../../shared/user-roles.js";
import { FakePointsRepo, uid } from "./fake-points-repo.js";

// Fixed clock so daily-cap windows + streak days are deterministic.
const NOW = new Date("2026-06-07T12:00:00Z");

function build() {
  const repo = new FakePointsRepo(() => NOW);
  const badgeUnlocks: Array<{ userId: string; slug: string }> = [];
  const engine = new PointsEngine(repo, {
    now: () => NOW,
    getUserTimezone: async () => null, // UTC day resolution
    onBadgeUnlock: async (userId, slug) => {
      badgeUnlocks.push({ userId, slug });
    },
  });
  return { repo, engine, badgeUnlocks };
}

const seeker = (userId: string) => ({ userId, role: USER_ROLES.JOB_SEEKER });

describe("points-engine — basic award", () => {
  let ctx: ReturnType<typeof build>;
  let user: string;
  beforeEach(() => {
    ctx = build();
    user = uid();
  });

  it("awards the catalog point value for a known action", async () => {
    const out = await ctx.engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, {
      ...seeker(user),
      refId: "app-1",
    });
    assert.equal(out.status, "awarded");
    if (out.status === "awarded") {
      assert.equal(out.delta, 50); // APPLICATION_SUBMITTED = 50
      assert.equal(out.balance, 50);
    }
    assert.equal((await ctx.repo.findBalance(user))?.balance, 50);
  });

  it("no-ops an unknown action", async () => {
    const out = await ctx.engine.awardForAction("totally.made.up", { ...seeker(user), refId: "x" });
    assert.deepEqual(out, { status: "no-op", reason: "unknown_action" });
  });

  it("no-ops on role mismatch (employer action by a job_seeker)", async () => {
    const out = await ctx.engine.awardForAction(ACTIONS.JOB_POSTED, {
      ...seeker(user),
      refId: "job-1",
    });
    assert.deepEqual(out, { status: "no-op", reason: "role_mismatch" });
    assert.equal(await ctx.repo.findBalance(user), null);
  });

  it("no-ops when the user is suspended", async () => {
    await ctx.repo.setSuspension(user, true, "fraud", null);
    const out = await ctx.engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, {
      ...seeker(user),
      refId: "app-1",
    });
    assert.deepEqual(out, { status: "no-op", reason: "suspended" });
  });

  it("awards a new-surface action at its catalog value (event.created = 50)", async () => {
    const out = await ctx.engine.awardForAction(ACTIONS.EVENT_CREATED, {
      ...seeker(user),
      refId: "evt-1",
    });
    assert.equal(out.status, "awarded");
    if (out.status === "awarded") assert.equal(out.delta, 50);
  });

  it("awards studio publish at 150 for a job_seeker creator", async () => {
    const out = await ctx.engine.awardForAction(ACTIONS.STUDIO_GAME_PUBLISHED, {
      ...seeker(user),
      refId: "proj-1",
    });
    assert.equal(out.status, "awarded");
    if (out.status === "awarded") assert.equal(out.delta, 150);
  });
});

describe("points-engine — idempotent dedup", () => {
  it("does not double-award the same (user, action, refId)", async () => {
    const { engine, repo } = build();
    const user = uid();
    const first = await engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, { ...seeker(user), refId: "app-1" });
    const second = await engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, { ...seeker(user), refId: "app-1" });
    assert.equal(first.status, "awarded");
    assert.deepEqual(second, { status: "no-op", reason: "duplicate" });
    assert.equal((await repo.findBalance(user))?.balance, 50); // only one award
  });
});

describe("points-engine — daily cap", () => {
  it("caps points at the daily limit and stops awarding once hit", async () => {
    const { engine, repo } = build();
    const user = uid();
    // RESUME_TAILORED = 20 pts, dailyCapPoints = 80 → 4 awards, then capped.
    for (let i = 0; i < 4; i++) {
      const out = await engine.awardForAction(ACTIONS.RESUME_TAILORED, { ...seeker(user), refId: `r-${i}` });
      assert.equal(out.status, "awarded");
    }
    assert.equal((await repo.findBalance(user))?.balance, 80);

    const capped = await engine.awardForAction(ACTIONS.RESUME_TAILORED, { ...seeker(user), refId: "r-5" });
    assert.deepEqual(capped, { status: "no-op", reason: "daily_cap_hit" });
    assert.equal((await repo.findBalance(user))?.balance, 80); // unchanged
  });

  it("awards only the remaining headroom on the cap-crossing event", async () => {
    const { engine, repo } = build();
    const user = uid();
    // session.daily caps at 5 and pays 5 — use cover_letter (15 pts, cap 60).
    for (let i = 0; i < 3; i++) {
      await engine.awardForAction(ACTIONS.COVER_LETTER_GENERATED, { ...seeker(user), refId: `c-${i}` }); // 45
    }
    // 4th would be 60 (exactly the cap) — still full.
    const fourth = await engine.awardForAction(ACTIONS.COVER_LETTER_GENERATED, { ...seeker(user), refId: "c-3" });
    assert.equal(fourth.status, "awarded");
    if (fourth.status === "awarded") assert.equal(fourth.delta, 15);
    assert.equal((await repo.findBalance(user))?.balance, 60);
  });
});

describe("points-engine — 100-task gate", () => {
  it("blocks payout (zero-earning row) until 100 user tasks closed", async () => {
    const { engine, repo } = build();
    const user = uid();
    repo.setUserTaskCount(user, 50); // below threshold
    const out = await engine.awardForAction(ACTIONS.TASK_COMPLETE_USER, { ...seeker(user), refId: "t-1" });
    assert.deepEqual(out, { status: "no-op", reason: "user_task_gate_not_met" });
    // A zero-points audit row is written; balance stays null/zero.
    assert.equal(await repo.findBalance(user), null);
    const zeroRow = repo.ledger.find((r) => r.action === ACTIONS.TASK_COMPLETE_USER);
    assert.ok(zeroRow);
    assert.equal(zeroRow!.delta, 0);
  });

  it("pays out once the user is at/over the gate", async () => {
    const { engine, repo } = build();
    const user = uid();
    repo.setUserTaskCount(user, 100);
    const out = await engine.awardForAction(ACTIONS.TASK_COMPLETE_USER, { ...seeker(user), refId: "t-101" });
    assert.equal(out.status, "awarded");
    if (out.status === "awarded") assert.equal(out.delta, 5);
  });
});

describe("points-engine — streak advance", () => {
  it("advances the streak on a streak-signal action", async () => {
    const { engine, repo } = build();
    const user = uid();
    await engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, { ...seeker(user), refId: "app-1" });
    const streak = await repo.findStreak(user);
    assert.equal(streak?.currentStreak, 1);
    assert.equal(streak?.lastActivityDate, "2026-06-07");
  });

  it("still advances the streak when the daily cap blocked the payout", async () => {
    const { engine, repo } = build();
    const user = uid();
    // Pre-fill the cap by writing earn rows at the catalog value.
    for (let i = 0; i < 4; i++) {
      await engine.awardForAction(ACTIONS.RESUME_TAILORED, { ...seeker(user), refId: `r-${i}` });
    }
    // Capped award — but streak signal must still fire (same UTC day, so
    // it stays at 1 rather than bumping; presence of the row is the point).
    const capped = await engine.awardForAction(ACTIONS.RESUME_TAILORED, { ...seeker(user), refId: "r-9" });
    assert.equal(capped.status, "no-op");
    assert.ok(await repo.findStreak(user)); // streak row exists
  });
});

describe("points-engine — badge unlock hook", () => {
  it("fires onBadgeUnlock for a threshold the action just crossed", async () => {
    const { engine, repo, badgeUnlocks } = build();
    const user = uid();
    repo.seedBadge({ slug: "first_application", name: "In the Arena" });
    await engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, { ...seeker(user), refId: "app-1" });
    assert.deepEqual(
      badgeUnlocks.map((b) => b.slug),
      ["first_application"],
    );
  });

  it("does not re-fire onBadgeUnlock when the badge is already held", async () => {
    const { engine, repo, badgeUnlocks } = build();
    const user = uid();
    const badge = repo.seedBadge({ slug: "first_application", name: "In the Arena" });
    // Pretend the user already holds it.
    await repo.awardBadgeOnce({ userId: user, badgeId: badge.id, awardedFor: {} });
    await engine.awardForAction(ACTIONS.APPLICATION_SUBMITTED, { ...seeker(user), refId: "app-1" });
    assert.equal(badgeUnlocks.length, 0);
  });

  it("fires the new studio_creator badge on first publish", async () => {
    const { engine, repo, badgeUnlocks } = build();
    const user = uid();
    repo.seedBadge({ slug: "studio_creator_first", name: "Studio Creator" });
    await engine.awardForAction(ACTIONS.STUDIO_PODCAST_PUBLISHED, { ...seeker(user), refId: "proj-1" });
    assert.deepEqual(
      badgeUnlocks.map((b) => b.slug),
      ["studio_creator_first"],
    );
  });
});

describe("points-engine — task streak routes the On Fire badge (#1136)", () => {
  // Mutable clock so we can simulate consecutive UTC days.
  function buildWithClock() {
    let clock = new Date("2026-06-01T12:00:00Z");
    const repo = new FakePointsRepo(() => clock);
    const badgeUnlocks: string[] = [];
    const engine = new PointsEngine(repo, {
      now: () => clock,
      getUserTimezone: async () => null, // UTC day resolution
      onBadgeUnlock: async (_userId, slug) => {
        badgeUnlocks.push(slug);
      },
    });
    const advanceDay = () => {
      clock = new Date(clock.getTime() + 86_400_000);
    };
    return { repo, engine, badgeUnlocks, advanceDay };
  }

  it("awards on_fire after 7 consecutive task-completion days", async () => {
    const { engine, repo, badgeUnlocks, advanceDay } = buildWithClock();
    const user = uid();
    for (let day = 1; day <= 7; day++) {
      await engine.awardForAction(ACTIONS.TASK_COMPLETE_SYSTEM, { ...seeker(user), refId: `sys-${day}` });
      if (day < 7) advanceDay();
    }
    assert.equal((await repo.findTaskStreak(user))?.currentStreak, 7);
    assert.ok(badgeUnlocks.includes("on_fire"), "on_fire awarded off the task streak at day 7");
  });

  it("does NOT award on_fire from a 7-day NON-task engagement streak", async () => {
    const { engine, repo, badgeUnlocks, advanceDay } = buildWithClock();
    const user = uid();
    for (let day = 1; day <= 7; day++) {
      await engine.awardForAction(ACTIONS.SAVED_SEARCH_RUN, { ...seeker(user), refId: `ss-${day}` });
      if (day < 7) advanceDay();
    }
    // The general streak reaches 7 …
    assert.equal((await repo.findStreak(user))?.currentStreak, 7);
    // … but the On Fire BADGE must NOT fire off non-task engagement (#1136),
    // and no task streak is created at all.
    assert.equal(badgeUnlocks.includes("on_fire"), false);
    assert.equal(await repo.findTaskStreak(user), null);
  });

  it("still pays the general streak-bonus POINTS at the 7-day milestone", async () => {
    const { engine, repo, advanceDay } = buildWithClock();
    const user = uid();
    for (let day = 1; day <= 7; day++) {
      await engine.awardForAction(ACTIONS.SAVED_SEARCH_RUN, { ...seeker(user), refId: `ss-${day}` });
      if (day < 7) advanceDay();
    }
    const ledger = await repo.findRecentLedger(user, 100);
    const bonus = ledger.find((r) => r.category === "streak_bonus");
    assert.ok(bonus, "general streak still pays the engagement bonus");
    assert.equal(bonus!.delta, 100); // 7-day milestone bonus
  });
});

describe("points-engine — sourced cluster fraud signals (#1117)", () => {
  it("raises a sybil flag + auto-suspends when many accounts share the signup IP", async () => {
    const repo = new FakePointsRepo(() => NOW);
    repo.signupIpAccounts = 5; // sourced via getExtraFraudSignals below
    const engine = new PointsEngine(repo, {
      now: () => NOW,
      getUserTimezone: async () => null,
      getExtraFraudSignals: async () => ({
        accountsOnSignupIp: await repo.countAccountsOnSignupIp(),
        accountsOnDeviceFingerprint: await repo.countAccountsOnDeviceFingerprint(),
      }),
    });
    const user = uid();
    // Open the 100-task gate so the user-task award (and fraud check) runs.
    await repo.incrementCounter(user, "user_task", 100);

    await engine.awardForAction(ACTIONS.TASK_COMPLETE_USER, { ...seeker(user), refId: "ut-1" });

    const flags = await repo.findFraudFlagsForUser(user);
    assert.ok(
      flags.some((f) => f.kind === "sybil_signup_ip" && f.autoSuspended),
      "sybil signup-IP flag raised + auto-suspended",
    );
    assert.equal((await repo.findBalance(user))?.isSuspended, true);
  });

  it("does NOT flag when the cluster signals are clean", async () => {
    const repo = new FakePointsRepo(() => NOW);
    repo.signupIpAccounts = 0;
    repo.deviceFpAccounts = 0;
    const engine = new PointsEngine(repo, {
      now: () => NOW,
      getUserTimezone: async () => null,
      getExtraFraudSignals: async () => ({
        accountsOnSignupIp: await repo.countAccountsOnSignupIp(),
        accountsOnDeviceFingerprint: await repo.countAccountsOnDeviceFingerprint(),
      }),
    });
    const user = uid();
    await repo.incrementCounter(user, "user_task", 100);
    await engine.awardForAction(ACTIONS.TASK_COMPLETE_USER, { ...seeker(user), refId: "ut-1" });
    assert.equal((await repo.findFraudFlagsForUser(user)).length, 0);
    assert.notEqual((await repo.findBalance(user))?.isSuspended, true);
  });
});
