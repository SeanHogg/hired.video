/**
 * Approve-gate for agent drafts: missing, caps, YouTube overflow, R18 reschedule/expire.
 * Run: node --import tsx --test src/services/distribution/__tests__/gate-agent-draft.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PublishJob } from "../../../repositories/socialPublishJobRepository.js";
import {
  AGENT_POST_IT_YOURSELF_EXPIRY_HOURS,
  AGENT_YOUTUBE_DAILY_MAX,
} from "../../../../../shared/social-publish-jobs.js";
import {
  AGENT_CAP_NO_SLOT_REASON,
  gateAgentDraftApprove,
  type GateAgentDraftDeps,
  type GateResult,
} from "../gate-agent-draft.js";

const now = new Date("2026-04-07T15:00:00Z"); // Tuesday
const userId = "user-1";
const draftId = "draft-1";
/** Steady noon UTC next slot after Tuesday 15:00 is Wednesday 12:00. */
const nextSteadySlotIso = "2026-04-08T12:00:00.000Z";

function job(over: Partial<PublishJob> = {}): PublishJob {
  return {
    id: draftId,
    createdBy: userId,
    destination: "linkedin",
    status: "draft",
    postSettings: {},
    postYourself: false,
    ...over,
  } as PublishJob;
}

function deps(over: Partial<GateAgentDraftDeps> = {}): GateAgentDraftDeps {
  return {
    getAgentDraft: async () => job(),
    countAgentJobs: async () => 0,
    markAgentDraftPostYourself: async () => true,
    loadTimezone: async () => "UTC",
    getSettings: async () => null,
    updateAgentDraftSlot: async () => true,
    expireOneAgentDraft: async () => true,
    ...over,
  };
}

function reasonOf(result: GateResult): string {
  if (result.ok === true) return "ok";
  return result.reason;
}

describe("gateAgentDraftApprove", () => {
  it("returns missing when the draft is gone or not a draft", async () => {
    assert.equal(reasonOf(await gateAgentDraftApprove(draftId, userId, now, deps({ getAgentDraft: async () => null }))), "missing");
    assert.equal(
      reasonOf(
        await gateAgentDraftApprove(
          draftId,
          userId,
          now,
          deps({ getAgentDraft: async () => job({ status: "scheduled" }) }),
        ),
      ),
      "missing",
    );
  });

  it("lets a postYourself draft through without counting", async () => {
    let counted = 0;
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ postYourself: true }),
        countAgentJobs: async () => {
          counted += 1;
          return 99;
        },
      }),
    );
    assert.equal(reasonOf(result), "ok");
    assert.equal(counted, 0);
  });

  it("reschedules to the next cadence slot when the destination is at its daily limit", async () => {
    let moved: { scheduledAt: Date; runAt: Date; id: string; userId: string } | undefined;
    let expired = false;
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        countAgentJobs: async () => 1,
        updateAgentDraftSlot: async (id, uid, scheduledAt, runAt) => {
          moved = { id, userId: uid, scheduledAt, runAt };
          return true;
        },
        expireOneAgentDraft: async () => {
          expired = true;
          return true;
        },
      }),
    );
    assert.equal(reasonOf(result), "rescheduled");
    assert.equal(result.ok, false);
    if (!result.ok && result.reason === "rescheduled") {
      assert.equal(result.runAt.toISOString(), nextSteadySlotIso);
    }
    assert.equal(moved?.id, draftId);
    assert.equal(moved?.userId, userId);
    assert.equal(moved?.scheduledAt.toISOString(), nextSteadySlotIso);
    assert.equal(moved?.runAt.toISOString(), nextSteadySlotIso);
    assert.equal(expired, false);
  });

  it("expires when no remaining slot this cadence week", async () => {
    let expiredReason: string | undefined;
    let rescheduled = false;
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        countAgentJobs: async () => 1,
        getSettings: async () => ({
          cadence: "light",
          postMinute: 720,
          quietStartMinute: 21 * 60,
          quietEndMinute: 8 * 60,
        }),
        updateAgentDraftSlot: async () => {
          rescheduled = true;
          return true;
        },
        expireOneAgentDraft: async (_id, _uid, _now, reason) => {
          expiredReason = reason;
          return true;
        },
      }),
    );
    assert.equal(reasonOf(result), "expired");
    assert.equal(expiredReason, AGENT_CAP_NO_SLOT_REASON);
    assert.equal(rescheduled, false);
  });

  it("uses the user timezone for the per-destination day window", async () => {
    const seen: Date[] = [];
    await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        loadTimezone: async () => "America/New_York",
        countAgentJobs: async (args) => {
          if (args.since) seen.push(args.since);
          return 0;
        },
      }),
    );
    assert.equal(seen.length, 1);
    // 2026-04-07 15:00Z = 11:00 EDT → local day starts 04:00Z.
    assert.equal(seen[0].toISOString(), "2026-04-07T04:00:00.000Z");
  });

  it("marks YouTube overflow as postYourself at the app-wide UTC cap", async () => {
    let marked = false;
    let rescheduled = false;
    let expired = false;
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        countAgentJobs: async () => AGENT_YOUTUBE_DAILY_MAX,
        markAgentDraftPostYourself: async () => {
          marked = true;
          return true;
        },
        updateAgentDraftSlot: async () => {
          rescheduled = true;
          return true;
        },
        expireOneAgentDraft: async () => {
          expired = true;
          return true;
        },
      }),
    );
    assert.equal(reasonOf(result), "postYourself");
    assert.equal(marked, true);
    assert.equal(rescheduled, false);
    assert.equal(expired, false);
  });

  it("returns ok when under the daily limit", async () => {
    const result = await gateAgentDraftApprove(draftId, userId, now, deps());
    assert.equal(reasonOf(result), "ok");
  });

  it("caps feed / tiktok at 1 the same as linkedin", async () => {
    for (const destination of ["feed", "tiktok"] as const) {
      const result = await gateAgentDraftApprove(
        draftId,
        userId,
        now,
        deps({
          getAgentDraft: async () => job({ destination }),
          countAgentJobs: async () => 1,
        }),
      );
      assert.equal(reasonOf(result), "rescheduled", destination);
    }
  });

  it("counts YouTube overflow against the UTC day, not the user timezone", async () => {
    const seen: Array<{ destination?: string; since?: string }> = [];
    await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        loadTimezone: async () => "America/New_York",
        countAgentJobs: async (args) => {
          seen.push({ destination: args.destination, since: args.since?.toISOString() });
          return AGENT_YOUTUBE_DAILY_MAX;
        },
      }),
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].destination, "youtube");
    assert.equal(seen[0].since, "2026-04-07T00:00:00.000Z");
  });

  it("marks YouTube overflow with a 48h post-yourself expiry", async () => {
    let expiry: Date | undefined;
    let markedNow: Date | undefined;
    await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        countAgentJobs: async () => AGENT_YOUTUBE_DAILY_MAX,
        markAgentDraftPostYourself: async (_id, _uid, exp, at) => {
          expiry = exp;
          markedNow = at;
          return true;
        },
      }),
    );
    assert.equal(
      expiry?.toISOString(),
      new Date(now.getTime() + AGENT_POST_IT_YOURSELF_EXPIRY_HOURS * 60 * 60 * 1000).toISOString(),
    );
    assert.equal(markedNow?.toISOString(), now.toISOString());
  });

  it("still returns postYourself when the mark write fails", async () => {
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        countAgentJobs: async () => AGENT_YOUTUBE_DAILY_MAX,
        markAgentDraftPostYourself: async () => false,
      }),
    );
    assert.equal(reasonOf(result), "postYourself");
  });

  it("applies the user YouTube daily cap when the app-wide UTC cap is not hit", async () => {
    let n = 0;
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        // First call is the UTC app-wide YouTube count (under cap);
        // second is the user-day count (at cap). Both may share the
        // same `since` when the user timezone is UTC.
        countAgentJobs: async () => {
          n += 1;
          return n === 1 ? 2 : AGENT_YOUTUBE_DAILY_MAX;
        },
      }),
    );
    assert.equal(reasonOf(result), "rescheduled");
    assert.equal(n, 2);
  });

  it("returns ok for YouTube under both the UTC and user-day caps", async () => {
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        getAgentDraft: async () => job({ destination: "youtube" }),
        countAgentJobs: async () => 2,
      }),
    );
    assert.equal(reasonOf(result), "ok");
  });

  it("passes the userId to loadTimezone", async () => {
    const seen: string[] = [];
    await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        loadTimezone: async (id) => {
          seen.push(id);
          return "UTC";
        },
      }),
    );
    assert.deepEqual(seen, [userId]);
  });

  it("returns missing when the slot write does not land", async () => {
    const result = await gateAgentDraftApprove(
      draftId,
      userId,
      now,
      deps({
        countAgentJobs: async () => 1,
        updateAgentDraftSlot: async () => false,
      }),
    );
    assert.equal(reasonOf(result), "missing");
  });
});
