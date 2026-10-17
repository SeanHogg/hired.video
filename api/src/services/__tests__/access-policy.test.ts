/**
 * Unit tests for the billing domain abstraction (roadmap #150).
 *
 * Covers:
 *   • `deriveAudience()` — JWT + subscription DTO → `Audience`
 *   • `deriveTier()`     — subscription DTO → billing `Tier` (free|pro)
 *   • `isAdminRole()`    — admin / superadmin detection across shapes
 *   • `standardAccessPolicy` — (audience × feature) → payload shape
 *   • `makeBillingFacadeForTests()` — test-double behavior
 *   • `shapeScorerPayload()` — pure payload shaping for the resume-scorer
 *
 * Naming: `Tier` is the billing concept (Free | Pro). `Audience` is
 * what the access policy dispatches on (Anonymous | Free | Pro | Admin).
 * The two concepts are deliberately separate so "there are four tiers"
 * confusion doesn't creep back.
 *
 * Run: node --import tsx --test src/services/__tests__/access-policy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveAudience,
  deriveTier,
  type Audience,
} from "../../domains/billing/audience.js";
import { isAdminRole } from "../../middleware/superAdmin.js";
import {
  standardAccessPolicy,
  _internal,
  type ToolFeature,
} from "../../domains/billing/access-policy.js";
import { makeBillingFacadeForTests } from "../../domains/billing/facade.js";
import { buildScoreResult, shapeScorerPayload } from "../../routes/resume-scorer.js";

// ═══════════════════════════════════════════════════════════════════════════
// isAdminRole
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/audience: isAdminRole", () => {
  it("returns false for null/undefined", () => {
    assert.equal(isAdminRole(null), false);
    assert.equal(isAdminRole(undefined), false);
  });

  it("detects super_admin in the roles[] array", () => {
    assert.equal(isAdminRole({ sub: "u1", roles: ["super_admin"] } as any), true);
  });

  it("detects admin in the roles[] array", () => {
    assert.equal(isAdminRole({ sub: "u1", roles: ["admin"] } as any), true);
  });

  it("detects a legacy scalar `role` field", () => {
    assert.equal(isAdminRole({ sub: "u1", role: "super_admin" } as any), true);
    assert.equal(isAdminRole({ sub: "u1", role: "admin" } as any), true);
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
// deriveAudience — JWT + sub → policy audience
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/audience: deriveAudience", () => {
  const proSub = { isPro: true } as any;
  const freeSub = { isPro: false } as any;

  it("returns 'anonymous' when no user is present", () => {
    assert.equal(deriveAudience(null, proSub), "anonymous");
    assert.equal(deriveAudience(undefined, freeSub), "anonymous");
  });

  it("returns 'admin' for super_admin regardless of subscription", () => {
    const admin = { sub: "u1", roles: ["super_admin"] } as any;
    assert.equal(deriveAudience(admin, proSub), "admin");
    assert.equal(deriveAudience(admin, freeSub), "admin");
    assert.equal(deriveAudience(admin, null), "admin");
  });

  it("returns 'pro' when sub.isPro is true", () => {
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveAudience(user, proSub), "pro");
  });

  it("returns 'free' when sub.isPro is false", () => {
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveAudience(user, freeSub), "free");
  });

  it("returns 'free' when subscription lookup returned null", () => {
    const user = { sub: "u1", roles: ["User"] } as any;
    assert.equal(deriveAudience(user, null), "free");
    assert.equal(deriveAudience(user, undefined), "free");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveTier — sub → billing tier (free | pro)
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/audience: deriveTier (billing domain)", () => {
  it("returns 'pro' when the sub is premium", () => {
    assert.equal(deriveTier({ isPro: true } as any), "pro");
  });

  it("returns 'free' when the sub is not premium", () => {
    assert.equal(deriveTier({ isPro: false } as any), "free");
  });

  it("returns 'free' for anonymous callers (null/undefined sub)", () => {
    assert.equal(deriveTier(null), "free");
    assert.equal(deriveTier(undefined), "free");
  });

  it("billing tiers are exactly Free and Pro — nothing else", () => {
    // Guards against reintroducing a 4-state Tier by accident.
    const allTiers = [
      deriveTier({ isPro: true } as any),
      deriveTier({ isPro: false } as any),
      deriveTier(null),
    ];
    for (const t of allTiers) {
      assert.ok(t === "free" || t === "pro", `unexpected tier: ${t}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// standardAccessPolicy — (audience × feature) matrix
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/access-policy: getPayloadShape", () => {
  it("anonymous sees 'locked' for every tool feature", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardAccessPolicy.getPayloadShape("anonymous", f), "locked");
    }
  });

  it("free gets a 'teaser' for scorer and job-resume match", () => {
    assert.equal(standardAccessPolicy.getPayloadShape("free", "resume_scorer"), "teaser");
    assert.equal(standardAccessPolicy.getPayloadShape("free", "job_resume_match"), "teaser");
  });

  it("free sees 'locked' for pro-only tools", () => {
    assert.equal(standardAccessPolicy.getPayloadShape("free", "resume_optimizer"), "locked");
    assert.equal(standardAccessPolicy.getPayloadShape("free", "salary_calculator"), "locked");
    assert.equal(standardAccessPolicy.getPayloadShape("free", "value_proposition"), "locked");
  });

  it("pro sees 'full' for every tool feature", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardAccessPolicy.getPayloadShape("pro", f), "full");
    }
  });

  it("admin sees 'full' for every tool feature (bypasses gating)", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardAccessPolicy.getPayloadShape("admin", f), "full");
    }
  });

  it("defaults to 'full' for an unknown feature (fail-open on new tools)", () => {
    const shape = standardAccessPolicy.getPayloadShape("free", "unknown_tool" as any);
    assert.equal(shape, "full");
  });
});

describe("billing/access-policy: getUpsellPayload", () => {
  it("returns a scorer CTA with the right locked-fields list", () => {
    const cta = standardAccessPolicy.getUpsellPayload("resume_scorer");
    assert.equal(cta.isProPreview, true);
    assert.equal(cta.upgradeUrl, "/settings/billing");
    assert.deepEqual(
      cta.lockedDetails,
      ["atsCompatibility", "contentQuality", "keywordScore", "formatScore", "impactScore", "strengths", "weaknesses"],
    );
  });

  it("returns feature-specific locked-fields for the optimizer", () => {
    const cta = standardAccessPolicy.getUpsellPayload("resume_optimizer");
    assert.ok(cta.lockedDetails.includes("suggestions"));
    assert.ok(cta.lockedDetails.includes("optimizedContent"));
  });

  it("uses the same upgrade URL across every feature (shared constant)", () => {
    const features: ToolFeature[] = [
      "resume_scorer", "resume_optimizer", "salary_calculator",
      "value_proposition", "job_resume_match",
    ];
    for (const f of features) {
      assert.equal(standardAccessPolicy.getUpsellPayload(f).upgradeUrl, _internal.UPGRADE_URL);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// makeBillingFacadeForTests
// ═══════════════════════════════════════════════════════════════════════════

describe("billing/facade: makeBillingFacadeForTests", () => {
  it("resolves each mapped user to the expected audience", async () => {
    const fake = makeBillingFacadeForTests({
      "free-user": "free",
      "pro-user": "pro",
      "admin-user": "admin",
    });
    assert.equal(await fake.getAudience({ sub: "free-user" } as any), "free");
    assert.equal(await fake.getAudience({ sub: "pro-user" } as any), "pro");
    assert.equal(await fake.getAudience({ sub: "admin-user" } as any), "admin");
  });

  it("returns 'anonymous' audience when no user is passed", async () => {
    const fake = makeBillingFacadeForTests({});
    assert.equal(await fake.getAudience(null), "anonymous");
    assert.equal(await fake.getAudience(undefined), "anonymous");
  });

  it("falls back to 'free' for an unmapped user (principle of least privilege)", async () => {
    const fake = makeBillingFacadeForTests({ "pro-user": "pro" });
    assert.equal(await fake.getAudience({ sub: "unknown" } as any), "free");
  });

  it("getTier returns 'free' or 'pro' only — admin audience maps to the billing tier", async () => {
    const fake = makeBillingFacadeForTests({
      "free-user": "free",
      "pro-user": "pro",
      "admin-user": "admin",
    });
    assert.equal(await fake.getTier({ sub: "free-user" } as any), "free");
    assert.equal(await fake.getTier({ sub: "pro-user" } as any), "pro");
    // Admin is a policy concept; the billing tier for the test double
    // defaults to "free" since we don't track an underlying plan.
    assert.equal(await fake.getTier({ sub: "admin-user" } as any), "free");
    assert.equal(await fake.getTier(null), "free");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// shapeScorerPayload — the policy decision applied to a real score
// ═══════════════════════════════════════════════════════════════════════════

describe("resume-scorer: shapeScorerPayload", () => {
  const upsell = standardAccessPolicy.getUpsellPayload("resume_scorer");

  it("'full' returns the complete score object", () => {
    const full = buildScoreResult();
    const out = shapeScorerPayload(full, "full", upsell) as any;
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.atsScore, full.atsScore);
    assert.ok(Array.isArray(out.strengths));
    assert.ok(Array.isArray(out.recommendations));
    assert.equal(out.optimizedContent, undefined, "full Scorer payload must drop optimizedContent — that lives on the Optimizer surface");
    assert.equal(out.isProPreview, undefined, "full payload must not carry the preview flag");
  });

  it("'teaser' exposes score + grade + one teaserRecommendation; locks the rest", () => {
    const full = buildScoreResult();
    const out = shapeScorerPayload(full, "teaser", upsell) as any;
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.grade, full.grade);
    assert.equal(out.isProPreview, true);
    assert.equal(out.upgradeUrl, "/settings/billing");
    assert.ok(out.teaserRecommendation);
    assert.equal(out.teaserRecommendation.title, full.recommendations[0].title);
    for (const hidden of ["atsScore", "contentScore", "strengths", "weaknesses", "recommendations"]) {
      assert.equal(out[hidden], undefined, `${hidden} must be locked in teaser`);
    }
  });

  it("'teaser' returns null teaserRecommendation when there are no recommendations", () => {
    const full = { ...buildScoreResult(), recommendations: [] };
    const out = shapeScorerPayload(full, "teaser", upsell) as any;
    assert.equal(out.teaserRecommendation, null);
  });

  it("'locked' exposes score + grade + upsell only — no teaser hint", () => {
    const full = buildScoreResult();
    const out = shapeScorerPayload(full, "locked", upsell) as any;
    assert.equal(out.overallScore, full.overallScore);
    assert.equal(out.grade, full.grade);
    assert.equal(out.isProPreview, true);
    assert.equal(out.upgradeUrl, "/settings/billing");
    assert.equal(out.teaserRecommendation, undefined);
    assert.equal((out as any).lockedDetails, undefined);
    for (const hidden of ["atsScore", "contentScore", "strengths", "weaknesses", "recommendations"]) {
      assert.equal(out[hidden], undefined, `${hidden} must be locked`);
    }
  });

  it("policy + shaping compose end-to-end (audience → payload)", () => {
    const audiences: Audience[] = ["anonymous", "free", "pro", "admin"];
    const expected: Record<Audience, "full" | "teaser" | "locked"> = {
      anonymous: "locked",
      free: "teaser",
      pro: "full",
      admin: "full",
    };
    for (const audience of audiences) {
      const shape = standardAccessPolicy.getPayloadShape(audience, "resume_scorer");
      assert.equal(shape, expected[audience], `${audience} expected ${expected[audience]}, got ${shape}`);
      const out = shapeScorerPayload(buildScoreResult(), shape, upsell) as any;
      if (shape === "full") {
        assert.equal(out.isProPreview, undefined);
      } else {
        assert.equal(out.isProPreview, true);
      }
    }
  });
});
