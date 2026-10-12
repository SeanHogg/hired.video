/**
 * Unit tests for the pure plan-override resolver.
 *
 * Run: node --import tsx --test src/services/__tests__/plan-override-resolver.test.ts
 *
 * Every case is pure: we pass in shaped inputs (no DB, no clock, no mocks),
 * call resolveEffectivePlan, and assert on the output. This is the kind of
 * test that should catch every plan-precedence regression before it ever
 * reaches a handler or route.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveEffectivePlan,
  isOverrideActive,
  defaultMonthlyLimitForPlan,
  UNLIMITED_TOKEN_LIMIT,
  type SubscriptionSnapshot,
  type PlanOverrideSnapshot,
} from "../../domains/planOverride/resolver.js";
import {
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
} from "../../../../shared/pricing.js";

const NOW = new Date("2026-04-19T12:00:00.000Z");

// ---------------------------------------------------------------------------
// defaultMonthlyLimitForPlan
// ---------------------------------------------------------------------------

describe("defaultMonthlyLimitForPlan", () => {
  it("returns the free-tier allowance for 'free'", () => {
    assert.equal(defaultMonthlyLimitForPlan("free"), FREE_AI_MONTHLY_TOKENS);
  });
  it("returns the pro-tier allowance for 'pro'", () => {
    assert.equal(defaultMonthlyLimitForPlan("pro"), PRO_AI_MONTHLY_TOKENS);
  });
  it("returns null (unlimited) for 'unlimited' and 'admin'", () => {
    assert.equal(defaultMonthlyLimitForPlan("unlimited"), null);
    assert.equal(defaultMonthlyLimitForPlan("admin"), null);
  });
  it("defaults to the free allowance for unknown slugs (conservative)", () => {
    assert.equal(defaultMonthlyLimitForPlan("whatever"), FREE_AI_MONTHLY_TOKENS);
  });
});

// ---------------------------------------------------------------------------
// isOverrideActive
// ---------------------------------------------------------------------------

describe("isOverrideActive", () => {
  const base: PlanOverrideSnapshot = {
    planSlug: "pro",
    monthlyTokenLimit: null,
    expiresAt: null,
    reason: "comp",
    grantedBy: "admin-1",
    grantedAt: NOW,
  };

  it("returns false when no override is present", () => {
    assert.equal(isOverrideActive(null, NOW), false);
  });
  it("returns true for a permanent override (expiresAt=null)", () => {
    assert.equal(isOverrideActive(base, NOW), true);
  });
  it("returns true when expiresAt is in the future", () => {
    const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    assert.equal(isOverrideActive({ ...base, expiresAt: future }, NOW), true);
  });
  it("returns false at the exact expiry instant (half-open interval)", () => {
    assert.equal(isOverrideActive({ ...base, expiresAt: NOW }, NOW), false);
  });
  it("returns false when expiresAt is in the past", () => {
    const past = new Date(NOW.getTime() - 1);
    assert.equal(isOverrideActive({ ...base, expiresAt: past }, NOW), false);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectivePlan — internal users short-circuit
// ---------------------------------------------------------------------------

describe("resolveEffectivePlan — internal users", () => {
  it("always resolves internal users to 'admin' with unlimited cap, ignoring overrides", () => {
    const sub: SubscriptionSnapshot = { planSlug: "free", planName: "Free", isInternal: true };
    // Even a restrictive override must not apply to staff.
    const override: PlanOverrideSnapshot = {
      planSlug: "free",
      monthlyTokenLimit: 1,
      expiresAt: null,
      reason: "should be ignored",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    assert.equal(r.planSlug, "admin");
    assert.equal(r.planName, "Admin");
    assert.equal(r.isUnlimited, true);
    assert.equal(r.monthlyLimit, null);
    assert.equal(r.source, "internal");
    // The flags still report the override row's existence for UI display.
    assert.equal(r.overridePresent, true);
    assert.equal(r.overrideActive, true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectivePlan — active override scenarios
// ---------------------------------------------------------------------------

describe("resolveEffectivePlan — active override", () => {
  const sub: SubscriptionSnapshot = {
    planSlug: "free",
    planName: "Free",
    isInternal: false,
  };

  it("promotes Free → Pro via override, with the Pro default cap", () => {
    const override: PlanOverrideSnapshot = {
      planSlug: "pro",
      monthlyTokenLimit: null,
      expiresAt: null,
      reason: "comp",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    assert.equal(r.planSlug, "pro");
    assert.equal(r.planName, "Pro");
    assert.equal(r.isPaid, true);
    assert.equal(r.isUnlimited, false);
    assert.equal(r.monthlyLimit, PRO_AI_MONTHLY_TOKENS);
    assert.equal(r.source, "override");
    assert.equal(r.overrideActive, true);
  });

  it("applies a custom token limit that overrides the plan default", () => {
    const override: PlanOverrideSnapshot = {
      planSlug: "pro",
      monthlyTokenLimit: 3_000_000,
      expiresAt: null,
      reason: "enterprise-style custom cap",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    assert.equal(r.monthlyLimit, 3_000_000);
    assert.equal(r.isUnlimited, false);
  });

  it("treats UNLIMITED_TOKEN_LIMIT sentinel as null monthlyLimit (isUnlimited=true)", () => {
    const override: PlanOverrideSnapshot = {
      planSlug: "pro",
      monthlyTokenLimit: UNLIMITED_TOKEN_LIMIT,
      expiresAt: null,
      reason: "vip",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    assert.equal(r.monthlyLimit, null);
    assert.equal(r.isUnlimited, true);
    // isPaid is true because "pro" or unlimited both qualify.
    assert.equal(r.isPaid, true);
  });

  it("honours an override with null planSlug — token-limit-only override", () => {
    const override: PlanOverrideSnapshot = {
      planSlug: null,
      monthlyTokenLimit: 200_000,
      expiresAt: null,
      reason: "temporary bump for Free user",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    // Plan stays Free (inherits from subscription), only the cap changes.
    assert.equal(r.planSlug, "free");
    assert.equal(r.monthlyLimit, 200_000);
    assert.equal(r.isPaid, false);
    assert.equal(r.isUnlimited, false);
  });

  it("reports overrideExpiresAt on the result so the UI can show it", () => {
    const expiry = new Date("2026-05-20T00:00:00.000Z");
    const override: PlanOverrideSnapshot = {
      planSlug: "pro",
      monthlyTokenLimit: null,
      expiresAt: expiry,
      reason: "30-day trial",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    assert.equal(r.overrideExpiresAt?.toISOString(), expiry.toISOString());
    assert.equal(r.overrideActive, true);
  });

  it("falls back to subscription plan when an override row is expired", () => {
    const override: PlanOverrideSnapshot = {
      planSlug: "pro",
      monthlyTokenLimit: null,
      expiresAt: new Date(NOW.getTime() - 1),
      reason: "trial ended yesterday",
      grantedBy: "admin-1",
      grantedAt: NOW,
    };
    const r = resolveEffectivePlan(sub, override, NOW);
    // User is back on Free.
    assert.equal(r.planSlug, "free");
    assert.equal(r.monthlyLimit, FREE_AI_MONTHLY_TOKENS);
    assert.equal(r.source, "subscription");
    assert.equal(r.overrideActive, false);
    // But overridePresent is still true so the UI can still show a history/reset button.
    assert.equal(r.overridePresent, true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectivePlan — subscription-backed (no override)
// ---------------------------------------------------------------------------

describe("resolveEffectivePlan — no override", () => {
  it("returns the subscription plan at its default cap when no override exists", () => {
    const sub: SubscriptionSnapshot = { planSlug: "pro", planName: "Pro", isInternal: false };
    const r = resolveEffectivePlan(sub, null, NOW);
    assert.equal(r.planSlug, "pro");
    assert.equal(r.planName, "Pro");
    assert.equal(r.monthlyLimit, PRO_AI_MONTHLY_TOKENS);
    assert.equal(r.source, "subscription");
    assert.equal(r.overrideActive, false);
    assert.equal(r.overridePresent, false);
  });

  it("defaults to 'free' + free cap when the user has no subscription row", () => {
    const sub: SubscriptionSnapshot = { planSlug: null, planName: null, isInternal: false };
    const r = resolveEffectivePlan(sub, null, NOW);
    assert.equal(r.planSlug, "free");
    assert.equal(r.planName, "Free");
    assert.equal(r.isPaid, false);
    assert.equal(r.monthlyLimit, FREE_AI_MONTHLY_TOKENS);
    assert.equal(r.source, "default");
  });
});
