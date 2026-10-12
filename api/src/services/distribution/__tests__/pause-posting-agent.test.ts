/**
 * pausePostingAgent: disable settings + cancel open jobs.
 * Run: node --import tsx --test src/services/distribution/__tests__/pause-posting-agent.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PostingAgentSettings } from "../../../repositories/postingAgentSettingsRepository.js";
import { pausePostingAgent, type PausePostingAgentDeps } from "../pause-posting-agent.js";

const userId = "user-1";

function settingsStub(reason: string): PostingAgentSettings {
  return { userId, enabled: false, pausedReason: reason } as PostingAgentSettings;
}

function deps(over: Partial<PausePostingAgentDeps> = {}): PausePostingAgentDeps {
  return {
    disableAgent: async (_id, reason) => settingsStub(reason),
    cancelOpenAgentJobs: async () => 0,
    ...over,
  };
}

describe("pausePostingAgent", () => {
  it("disables the agent with the given reason and cancels open jobs", async () => {
    const calls: string[] = [];
    const result = await pausePostingAgent(
      userId,
      "user",
      deps({
        disableAgent: async (id, reason) => {
          calls.push(`disable:${id}:${reason}`);
          return settingsStub(reason);
        },
        cancelOpenAgentJobs: async (id) => {
          calls.push(`cancel:${id}`);
          return 2;
        },
      }),
    );
    assert.deepEqual(calls, [`disable:${userId}:user`, `cancel:${userId}`]);
    assert.equal(result.enabled, false);
    assert.equal(result.pausedReason, "user");
  });

  it("does not cancel jobs when disable fails", async () => {
    let cancelled = false;
    await assert.rejects(
      () =>
        pausePostingAgent(
          userId,
          "admin",
          deps({
            disableAgent: async () => {
              throw new Error("db down");
            },
            cancelOpenAgentJobs: async () => {
              cancelled = true;
              return 0;
            },
          }),
        ),
      /db down/,
    );
    assert.equal(cancelled, false);
  });

  it("records plan and admin reasons the same way as user", async () => {
    for (const reason of ["plan", "admin"] as const) {
      const result = await pausePostingAgent(
        userId,
        reason,
        deps({
          disableAgent: async (_id, r) => settingsStub(r),
        }),
      );
      assert.equal(result.enabled, false);
      assert.equal(result.pausedReason, reason);
    }
  });

  it("passes a Date as `now` when cancelling open jobs", async () => {
    let seenNow: Date | undefined;
    await pausePostingAgent(
      userId,
      "plan",
      deps({
        cancelOpenAgentJobs: async (_id, now) => {
          seenNow = now;
          return 0;
        },
      }),
    );
    assert.ok(seenNow instanceof Date);
    assert.ok(Math.abs(Date.now() - seenNow.getTime()) < 5_000);
  });

  it("propagates a cancel error after disable has already run", async () => {
    let disabled = false;
    await assert.rejects(
      () =>
        pausePostingAgent(
          userId,
          "plan",
          deps({
            disableAgent: async (_id, reason) => {
              disabled = true;
              return settingsStub(reason);
            },
            cancelOpenAgentJobs: async () => {
              throw new Error("cancel failed");
            },
          }),
        ),
      /cancel failed/,
    );
    assert.equal(disabled, true);
  });
});
