/**
 * Metering regression coverage (#429).
 *
 * `chargeLedger` is the single choke point every metered LLM call flows
 * through (the client calls it after a successful completion). The bug
 * class #428 fixed — an AI route that burns tokens but never debits the
 * user-side ledger — re-enters the moment this gate drifts. These tests
 * spy on `tokenLedger.charge` and pin the gate: charge IFF there's a
 * billed user AND positive usage, bill the right id, and never let a
 * billing failure escape (an LLM answer must not fail because metering
 * threw).
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { chargeLedger, type LLMUsage } from "../llm-client.js";
import { tokenLedger } from "../../../domains/billing/token-ledger.js";
import type { JwtPayload } from "../../../types/index.js";

function usage(totalTokens: number): LLMUsage {
  return {
    promptTokens: Math.floor(totalTokens / 2),
    completionTokens: totalTokens - Math.floor(totalTokens / 2),
    totalTokens,
    model: "test-model",
  };
}

function user(sub: string): JwtPayload {
  return {
    sub,
    email: `${sub}@example.com`,
    roles: ["job_seeker"],
    emailVerified: true,
    mustChangePassword: false,
  };
}

/** Replace tokenLedger.charge with a recording stub; returns the calls. */
function spyCharge(impl?: () => Promise<any>) {
  const calls: any[] = [];
  mock.method(tokenLedger, "charge", async (args: any) => {
    calls.push(args);
    return impl ? impl() : null;
  });
  return calls;
}

describe("chargeLedger — metering gate (#429)", () => {
  beforeEach(() => mock.restoreAll());

  it("charges once with the resolved user + featureKey + usage", async () => {
    const calls = spyCharge();
    await chargeLedger(user("u1"), "career_360_plan", usage(120), {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].userId, "u1");
    assert.equal(calls[0].featureKey, "career_360_plan");
    assert.equal(calls[0].usage.totalTokens, 120);
  });

  it("prefers opts.billedUserId over the client user's sub", async () => {
    const calls = spyCharge();
    await chargeLedger(user("client-user"), "match_insights", usage(50), {
      billedUserId: "billed-user",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].userId, "billed-user");
  });

  it("forwards toolRunId + sessionId attribution when present", async () => {
    const calls = spyCharge();
    await chargeLedger(user("u1"), "resume_roast", usage(30), {
      toolRunId: "tr-1",
      sessionId: "sess-1",
    });
    assert.equal(calls[0].toolRunId, "tr-1");
    assert.equal(calls[0].sessionId, "sess-1");
  });

  it("does NOT charge an anonymous call (no user, no billedUserId)", async () => {
    const calls = spyCharge();
    await chargeLedger(null, "visitor_chat", usage(200), {});
    assert.equal(calls.length, 0);
  });

  it("does NOT charge when usage is missing or zero/negative", async () => {
    const calls = spyCharge();
    await chargeLedger(user("u1"), "chat", undefined, {});
    await chargeLedger(user("u1"), "chat", usage(0), {});
    assert.equal(calls.length, 0);
  });

  it("swallows a billing failure — metering must never fail the AI answer", async () => {
    spyCharge(() => Promise.reject(new Error("ledger down")));
    await assert.doesNotReject(() =>
      chargeLedger(user("u1"), "career_360_suggest", usage(10), {}),
    );
  });
});
