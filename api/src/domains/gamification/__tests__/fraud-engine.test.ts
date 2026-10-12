/**
 * Fraud engine — pure heuristic tests (flag vs pass).
 *
 * Run: node --import tsx --test src/domains/gamification/__tests__/fraud-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluate, type FraudInput } from "../fraud-engine.js";

const baseInput = (over: Partial<FraudInput> = {}): FraudInput => ({
  userId: "u-1",
  recentUserTaskClosesPerMinute: [],
  recentUserTaskClosesLastHour: 0,
  earningDayBuckets24h: 1,
  recentLedgerSample: [],
  ...over,
});

const kinds = (flags: ReturnType<typeof evaluate>) => flags.map((f) => f.kind).sort();

describe("fraud-engine — clean input", () => {
  it("returns no flags for normal activity", () => {
    const flags = evaluate(baseInput({ recentUserTaskClosesPerMinute: [3, 5, 2], recentUserTaskClosesLastHour: 10 }));
    assert.equal(flags.length, 0);
  });
});

describe("fraud-engine — bulk-close burst", () => {
  it("flags high + auto-suspend at exactly 20 closes in one minute", () => {
    const flags = evaluate(baseInput({ recentUserTaskClosesPerMinute: [5, 20, 1] }));
    const burst = flags.find((f) => f.kind === "bulk_close_burst");
    assert.ok(burst);
    assert.equal(burst!.severity, "high");
    assert.equal(burst!.autoSuspend, true);
  });

  it("does not flag a burst at 19 (boundary below threshold)", () => {
    const flags = evaluate(baseInput({ recentUserTaskClosesPerMinute: [19, 19, 19] }));
    assert.equal(flags.find((f) => f.kind === "bulk_close_burst"), undefined);
  });
});

describe("fraud-engine — sustained closure spike", () => {
  it("flags medium (no auto-suspend) above 60 closes in an hour", () => {
    const flags = evaluate(baseInput({ recentUserTaskClosesLastHour: 61 }));
    const spike = flags.find((f) => f.kind === "sustained_closure_spike");
    assert.ok(spike);
    assert.equal(spike!.severity, "medium");
    assert.equal(spike!.autoSuspend, false);
  });

  it("does not flag at exactly 60 (strictly-greater threshold)", () => {
    const flags = evaluate(baseInput({ recentUserTaskClosesLastHour: 60 }));
    assert.equal(flags.find((f) => f.kind === "sustained_closure_spike"), undefined);
  });
});

describe("fraud-engine — phase-4 heuristics", () => {
  it("flags rapid_redemption above $200 in 24h, no auto-suspend", () => {
    const flags = evaluate(baseInput({ redemptionsLast24hValueCents: 20_001 }));
    const f = flags.find((x) => x.kind === "rapid_redemption");
    assert.ok(f);
    assert.equal(f!.autoSuspend, false);
  });

  it("does not flag rapid_redemption at exactly $200", () => {
    const flags = evaluate(baseInput({ redemptionsLast24hValueCents: 20_000 }));
    assert.equal(flags.find((x) => x.kind === "rapid_redemption"), undefined);
  });

  it("flags sybil_signup_ip high + auto-suspend at >= 5 shared accounts", () => {
    const flags = evaluate(baseInput({ accountsOnSignupIp: 5 }));
    const f = flags.find((x) => x.kind === "sybil_signup_ip");
    assert.ok(f);
    assert.equal(f!.severity, "high");
    assert.equal(f!.autoSuspend, true);
  });

  it("flags device_cluster medium at >= 3 accounts on a fingerprint", () => {
    const flags = evaluate(baseInput({ accountsOnDeviceFingerprint: 3 }));
    const f = flags.find((x) => x.kind === "device_cluster");
    assert.ok(f);
    assert.equal(f!.severity, "medium");
    assert.equal(f!.autoSuspend, false);
  });

  it("flags refund_then_redeem high + auto-suspend at >= 2 refunds", () => {
    const flags = evaluate(baseInput({ refundsSinceFirstEarn: 2 }));
    const f = flags.find((x) => x.kind === "refund_then_redeem");
    assert.ok(f);
    assert.equal(f!.autoSuspend, true);
  });

  it("raises multiple flags at once when several heuristics trip", () => {
    const flags = evaluate(
      baseInput({
        recentUserTaskClosesPerMinute: [25],
        recentUserTaskClosesLastHour: 70,
        accountsOnSignupIp: 6,
      }),
    );
    assert.deepEqual(kinds(flags), ["bulk_close_burst", "sustained_closure_spike", "sybil_signup_ip"]);
    // Two of the three should request auto-suspend.
    assert.equal(flags.filter((f) => f.autoSuspend).length, 2);
  });
});
