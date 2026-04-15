/**
 * Unit tests for the billing domain abstraction (roadmap #150).
 *
 * Covers:
 *   • `deriveTier()` — JWT + subscription DTO → coarse `Tier`
 *   • `isAdminRole()` — admin / superadmin detection across role shapes
 *   • `standardTierPolicy` — (tier × feature) → payload shape matrix
 *   • `makeBillingFacadeForTests()` — test-double behavior
 *   • `shapeScorePayload()` — pure score-shaping for the resume-scorer
 *
 * These tests let us evolve the tier table (add Team, Trial, etc.)
 * without touching Hono or the DB. The contract is:
 *   - Route handlers depend on `billingFacade.getTier` + `policy.getPayloadShape`
 *   - Tests lock those two inputs and assert the output payload shape
 *
 * Run: node --import tsx --test src/services/__tests__/tier-policy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveTier, isAdminRole, type Tier } from "../../domains/billing/tier.js";
import {
  standardTierPolicy,
  _internal,
  type ToolFeature,
} from "../../domains/billing/tier-policy.js";
import { makeBillingFacadeForTests } from "../../domains/billing/facade.js";
import { buildScoreResult, shapeScorePayload } from "../../routes/resume-scorer.js";

// ═══════════════════════════════════════════════════════════════════════════
// isAdminRole
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/tier: isAdminRole", () => {
  it("returns false for null/undefined", () => {
    assert.equal(isAdminRole(null), false);
    assert.equal(isAdminRole(undefined), false);
  });

  it("detects SuperAdmin in the roles[] array", () => {
    assert.equal(isAdminRole({ sub: "u1", roles: ["SuperAdmin"] } as any), true);
  });

  it("detects Admin in the roles[] array", () => {
    assert.equal(isAdminRole({ sub: "u1", roles: ["Admin"] } as any), true);
  });

  it("detects a legacy scalar `role` field", () => {
    // Some older tokens carry `role: "SuperAdmin"` instead of roles[].
    assert.equal(isAdminRole({ sub: "u1", role: "SuperAdmin" } as any), true);
    assert.equal(isAdminRole({ sub: "u1", role: "Admin" } as any), true);
  });

  it("detects the isSuperAdmin flag (impersonation path)", () => {
    assert.equal(isAdminRole({ sub: "u1", isSuperAdmin: true } as any), true);
  });

  it("returns false for regular users", () => {
    assert.equal(isAdminRole({ sub: "u1", roles: ["User"] } as any), false);
    assert.equal(isAdminRole({ sub: "u1", roles: [] } as any), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveTier
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/tier: deriveTier", () => {
  const proSub = { isPremium: true } as any;
  const freeSub = { isPremium: false } as any;

  it("returns 'anonymous' when no user is present", () => {
    assert.equal(deriveTier(null, proSub), "anonymous");
    assert.equal(deriveTier(undefined, freeSub), "anonymous");
  });

  it("returns 'admin' for SuperAdmin regardless of subscription", () => {
    const admin = { sub: "u1", roles: ["SuperAdmin"] } as any;
    assert.equal(deriveTier(admin, proSub), "admin");
    assert.equal(deriveTier(admin, freeSub), "admin");
    // Even with no subscription at all, admin wins:
    assert.equal(deriveTier(admin, null), "admin");
  });

  it("returns 'pro' when sub.isPremium is true", () => {
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveTier(user, proSub), "pro");
  });

  it("returns 'free' when sub.isPremium is false", () => {
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveTier(user, freeSub), "free");
  });

  it("returns 'free' when subscription lookup returned null", () => {
    // Real-world: first-time caller with no subscription row yet.
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveTier(user, null), "free");
    assert.equal(deriveTier(user, undefined), "free");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// standardTierPolicy — matrix coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/tier-policy: getPayloadShape", () => {
  it("anonymous sees 'locked' for every tool feature", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardTierPolicy.getPayloadShape("anonymous", f), "locked");
    }
  });

  it("free gets a 'teaser' for scorer and job-resume match", () => {
    assert.equal(standardTierPolicy.getPayloadShape("free", "resume_scorer"), "teaser");
    assert.equal(standardTierPolicy.getPayloadShape("free", "job_resume_match"), "teaser");
  });

  it("free sees 'locked' for pro-gated tools", () => {
    assert.equal(standardTierPolicy.getPayloadShape("free", "resume_optimizer"), "locked");
    assert.equal(standardTierPolicy.getPayloadShape("free", "salary_calculator"), "locked");
    assert.equal(standardTierPolicy.getPayloadShape("free", "value_proposition"), "locked");
  });

  it("pro sees 'full' for every tool feature", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardTierPolicy.getPayloadShape("pro", f), "full");
    }
  });

  it("admin sees 'full' for every tool feature (bypasses gating)", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardTierPolicy.getPayloadShape("admin", f), "full");
    }
  });

  it("defaults to 'full' for an unknown feature (fail-open on new tools)", () => {
    // Guards against accidentally locking a brand-new tool on day 1.
    const shape = standardTierPolicy.getPayloadShape("free", "unknown_tool" as any);
    assert.equal(shape, "full");
  });
});

describe("billing/tier-policy: getUpsellPayload", () => {
  it("returns a scorer CTA with the right locked-fields list", () => {
    const cta = standardTierPolicy.getUpsellPayload("resume_scorer");
    assert.equal(cta.isPremiumPreview, true);
    assert.equal(cta.upgradeUrl, "/settings/billing");
    assert.deepEqual(
      cta.lockedDetails,
      ["atsCompatibility", "contentQuality", "keywordScore", "formatScore", "impactScore", "strengths", "weaknesses"],
    );
  });

  it("returns feature-specific locked-fields for the optimizer", () => {
    const cta = standardTierPolicy.getUpsellPayload("resume_optimizer");
    assert.ok(cta.lockedDetails.includes("suggestions"));
    assert.ok(cta.lockedDetails.includes("optimizedContent"));
  });

  it("uses the same upgrade URL across every feature (shared constant)", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardTierPolicy.getUpsellPayload(f).upgradeUrl, _internal.UPGRADE_URL);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// makeBillingFacadeForTests
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/facade: makeBillingFacadeForTests", () => {
  it("resolves each mapped user to the expected tier", async () => {
    const fake = makeBillingFacadeForTests({
      "free-user": "free",
      "pro-user": "pro",
      "admin-user": "admin",
    });
    assert.equal(await fake.getTier({ sub: "free-user" } as any), "free");
    assert.equal(await fake.getTier({ sub: "pro-user" } as any), "pro");
    assert.equal(await fake.getTier({ sub: "admin-user" } as any), "admin");
  });

  it("returns 'anonymous' when no user is passed", async () => {
    const fake = makeBillingFacadeForTests({});
    assert.equal(await fake.getTier(null), "anonymous");
    assert.equal(await fake.getTier(undefined), "anonymous");
  });

  it("falls back to 'free' for an unmapped user (principle of least privilege)", async () => {
    const fake = makeBillingFacadeForTests({ "pro-user": "pro" });
    assert.equal(await fake.getTier({ sub: "unknown" } as any), "free");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// shapeScorePayload — the policy decision applied to a real score
// ═══════════════════════════════════════════════════════════════════════════

describe("resume-scorer: shapeScorePayload", () => {
  const upsell = standardTierPolicy.getUpsellPayload("resume_scorer");

  it("'full' returns the complete score object", () => {
    const full = buildScoreResult();
    const out = shapeScorePayload(full, "full", upsell) as any;
    // All six subscores + strengths/weaknesses/recommendations survive.
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.atsCompatibility, full.atsCompatibility);
    assert.ok(Array.isArray(out.strengths));
    assert.ok(Array.isArray(out.recommendations));
    assert.equal(out.isPremiumPreview, undefined, "full payload must not carry the preview flag");
  });

  it("'teaser' exposes score + grade + one teaserRecommendation; locks the rest", () => {
    const full = buildScoreResult();
    const out = shapeScorePayload(full, "teaser", upsell) as any;
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.grade, full.grade);
    assert.equal(out.isPremiumPreview, true);
    assert.equal(out.upgradeUrl, "/settings/billing");
    assert.ok(out.teaserRecommendation);
    assert.equal(out.teaserRecommendation.title, full.recommendations[0].title);
    // Must NOT leak the hidden fields:
    for (const hidden of ["atsCompatibility", "contentQuality", "strengths", "weaknesses", "recommendations"]) {
      assert.equal(out[hidden], undefined, `${hidden} must be locked in teaser`);
    }
  });

  it("'teaser' returns null teaserRecommendation when there are no recommendations", () => {
    const full = { ...buildScoreResult(), recommendations: [] };
    const out = shapeScorePayload(full, "teaser", upsell) as any;
    assert.equal(out.teaserRecommendation, null);
  });

  it("'locked' exposes score + grade + upsell only — no teaser hint", () => {
    const full = buildScoreResult();
    const out = shapeScorePayload(full, "locked", upsell) as any;
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.grade, full.grade);
    assert.equal(out.isPremiumPreview, true);
    assert.equal(out.upgradeUrl, "/settings/billing");
    // No teaser recommendation for anonymous callers — they haven't
    // proven intent yet (didn't even sign up). Matches the pre-refactor
    // `if (!userId)` branch.
    assert.equal(out.teaserRecommendation, undefined);
    assert.equal((out as any).lockedDetails, undefined);
    for (const hidden of ["atsCompatibility", "contentQuality", "strengths", "weaknesses", "recommendations"]) {
      assert.equal(out[hidden], undefined, `${hidden} must be locked`);
    }
  });

  it("policy + shaping compose end-to-end (tier → payload)", () => {
    // Exercise the real path a route handler takes: getPayloadShape + getUpsellPayload + shape.
    const tiers: Tier[] = ["anonymous", "free", "pro", "admin"];
    const expected: Record<Tier, "full" | "teaser" | "locked"> = {
      anonymous: "locked",
      free: "teaser",
      pro: "full",
      admin: "full",
    };
    for (const tier of tiers) {
      const shape = standardTierPolicy.getPayloadShape(tier, "resume_scorer");
      assert.equal(shape, expected[tier], `${tier} expected ${expected[tier]}, got ${shape}`);
      const out = shapeScorePayload(buildScoreResult(), shape, upsell) as any;
      if (shape === "full") {
        assert.equal(out.isPremiumPreview, undefined);
      } else {
        assert.equal(out.isPremiumPreview, true);
      }
    }
  });
});
