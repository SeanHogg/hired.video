/**
 * Tests for `shared/tier-copy.ts` — the single source of truth for
 * user-visible Pro/Free tier names and message templates.
 *
 * Every template is pinned to its expected output. If you change a
 * template's wording (or rename the tier), the failing test names tell
 * the reviewer which call sites the rename will affect — there is no
 * silent drift between API messages and frontend marketing copy.
 *
 * Run: node --import tsx --test src/services/__tests__/tier-copy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TIER_NAME,
  TIER_COPY,
  UPGRADE_URL,
  TIER_ID,
  PERSONALIZE_TIER,
  AD_TEMPLATE_TIER,
  type PersonalizeResponse,
  type PersonalizeTier,
  type AdTemplateTier,
  type TierId,
} from "../../../../shared/tier-copy.js";

describe("TIER_NAME — canonical display names", () => {
  it("paid tier is 'Pro' (matches Pricing.tsx headline)", () => {
    assert.equal(TIER_NAME.pro, "Pro");
  });

  it("unpaid tier is 'Free'", () => {
    assert.equal(TIER_NAME.free, "Free");
  });

  it("UPGRADE_URL points at /settings/billing", () => {
    assert.equal(UPGRADE_URL, "/settings/billing");
  });
});

describe("TIER_ID — wire-format / analytics IDs", () => {
  it("paid tier ID is lowercase 'pro' (analytics + API responses)", () => {
    assert.equal(TIER_ID.pro, "pro");
  });

  it("unpaid tier ID is lowercase 'free'", () => {
    assert.equal(TIER_ID.free, "free");
  });

  it("TIER_ID values are distinct from TIER_NAME values (lowercase vs title-case)", () => {
    // Display strings and machine identifiers are deliberately separate so
    // a marketing copy change doesn't move historical analytics events.
    assert.notEqual(TIER_ID.pro, TIER_NAME.pro);
    assert.notEqual(TIER_ID.free, TIER_NAME.free);
  });

  it("TierId type accepts only the declared values (compile-time check)", () => {
    const ok: TierId = TIER_ID.pro;
    const ok2: TierId = TIER_ID.free;
    assert.equal(ok, "pro");
    assert.equal(ok2, "free");
  });
});

describe("PERSONALIZE_TIER — response discriminator for /api/messages/personalize", () => {
  it("'basic' is the fallback (Free / no API key / over-budget)", () => {
    assert.equal(PERSONALIZE_TIER.basic, "basic");
  });

  it("'pro' reuses TIER_ID.pro — the wire-format string never drifts", () => {
    assert.equal(PERSONALIZE_TIER.pro, TIER_ID.pro);
  });

  it("PersonalizeResponse compiles for both branches of the union", () => {
    const basic: PersonalizeResponse = {
      tier: PERSONALIZE_TIER.basic,
      subject: "Following up",
      body: "Hi…",
      note: "Upgrade to Pro for personalized messages.",
    };
    const pro: PersonalizeResponse = {
      tier: PERSONALIZE_TIER.pro,
      subject: "Quick chat?",
      body: "Hi…",
    };
    const tiers: PersonalizeTier[] = [basic.tier, pro.tier];
    assert.deepEqual(tiers, ["basic", "pro"]);
  });
});

describe("AD_TEMPLATE_TIER — studio ad-template gate", () => {
  it("aliases TIER_ID — one source of truth for tier identifiers", () => {
    assert.equal(AD_TEMPLATE_TIER.pro, TIER_ID.pro);
    assert.equal(AD_TEMPLATE_TIER.free, TIER_ID.free);
  });

  it("AdTemplateTier accepts only TIER_ID values (compile-time check)", () => {
    const free: AdTemplateTier = AD_TEMPLATE_TIER.free;
    const pro: AdTemplateTier = AD_TEMPLATE_TIER.pro;
    assert.deepEqual([free, pro], ["free", "pro"]);
  });
});

describe("TIER_COPY templates — Pro feature gates", () => {
  it("proFeatureRequired interpolates the feature name", () => {
    assert.equal(
      TIER_COPY.proFeatureRequired("Salary Calculator"),
      "Salary Calculator is a Pro feature. Upgrade to access it.",
    );
  });

  it("featureIsProOnly is the heading variant", () => {
    assert.equal(
      TIER_COPY.featureIsProOnly("Hiring & Onboarding"),
      "Hiring & Onboarding is a Pro feature",
    );
  });

  it("proFeatureLabel is the bare label", () => {
    assert.equal(TIER_COPY.proFeatureLabel(), "Pro feature");
  });
});

describe("TIER_COPY templates — Free tier limits", () => {
  it("freeLimitReached uses 'Upgrade to Pro to add more' phrasing", () => {
    assert.equal(
      TIER_COPY.freeLimitReached({ limit: 2, unit: "team members" }),
      "Free accounts are limited to 2 team members. Upgrade to Pro to add more.",
    );
  });

  it("freeMonthlyLimitReached promises 'unlimited' on upgrade", () => {
    assert.equal(
      TIER_COPY.freeMonthlyLimitReached({ limit: 3, unit: "interview practice sessions" }),
      "Free tier is limited to 3 interview practice sessions per month. Upgrade to Pro for unlimited interview practice sessions.",
    );
  });

  it("freeQuotaExceededForFeature combines allowance + benefit", () => {
    assert.equal(
      TIER_COPY.freeQuotaExceededForFeature({ freeAllowance: "publish 1 video", feature: "videos" }),
      "Free accounts can publish 1 video. Upgrade to Pro for unlimited videos.",
    );
  });
});

describe("TIER_COPY templates — Trial flow", () => {
  it("trialStarted welcomes the user with the trial-end date", () => {
    assert.equal(
      TIER_COPY.trialStarted("5/10/2026"),
      "Enjoy full Pro access until 5/10/2026. Add a payment method before it ends to keep access.",
    );
  });

  it("trialEndingSoon pluralizes 'day' / 'days' correctly", () => {
    assert.equal(
      TIER_COPY.trialEndingSoon({ daysLeft: 1 }),
      "Your trial ends in 1 day. Add a payment method to keep Pro access.",
    );
    assert.equal(
      TIER_COPY.trialEndingSoon({ daysLeft: 3 }),
      "Your trial ends in 3 days. Add a payment method to keep Pro access.",
    );
  });
});

describe("TIER_COPY templates — Post-checkout", () => {
  it("welcomeAfterCheckout is the short toast", () => {
    assert.equal(TIER_COPY.welcomeAfterCheckout(), "Welcome to Pro!");
  });

  it("paymentConfirmed is the long-form variant", () => {
    assert.equal(
      TIER_COPY.paymentConfirmed(),
      "Your payment method has been successfully configured. Welcome to Pro!",
    );
  });

  it("proAccessGranted + proExploreInvitation pair the success-page card", () => {
    assert.equal(TIER_COPY.proAccessGranted(), "You now have access to Pro features");
    assert.equal(
      TIER_COPY.proExploreInvitation(),
      "Start exploring all the powerful tools available to Pro members",
    );
  });
});

describe("TIER_COPY templates — Studio + extension upsells", () => {
  it("proRequiredToastTitle / Body — quality picker upsell", () => {
    assert.equal(TIER_COPY.proRequiredToastTitle(), "Pro required");
    assert.equal(
      TIER_COPY.proRequiredToastBody("4K export"),
      "4K export requires a Pro subscription.",
    );
  });

  it("qualityProSuffix is just the tier name (used as a dropdown suffix)", () => {
    assert.equal(TIER_COPY.qualityProSuffix(), "Pro");
  });

  it("proCollectionLabel — comparison-table 'Pro library (50+)' cell", () => {
    assert.equal(TIER_COPY.proCollectionLabel("50+"), "Pro library (50+)");
  });

  it("proFeaturesGatedNote — Chrome-extension FAQ answer", () => {
    assert.equal(
      TIER_COPY.proFeaturesGatedNote(),
      "Pro features are gated behind paid hired.video plans, but the core extension is free.",
    );
  });
});

describe("TIER_COPY templates — Misc upsells", () => {
  it("upgradeForFeature wraps any benefit phrase", () => {
    assert.equal(
      TIER_COPY.upgradeForFeature("priority job matching"),
      "Upgrade to Pro for priority job matching.",
    );
  });

  it("upgradeForPersonalizedMessages — AI message personalization note", () => {
    assert.equal(
      TIER_COPY.upgradeForPersonalizedMessages(),
      "Upgrade to Pro for AI-personalized messages tailored to each recipient.",
    );
  });

  it("upgradeForMoreAiTokens — AI chat panel error suffix", () => {
    assert.equal(TIER_COPY.upgradeForMoreAiTokens(), "Upgrade to Pro for more AI tokens.");
  });

  it("aiRequestsExhausted — combines consumed-count diagnostic + CTA", () => {
    assert.equal(
      TIER_COPY.aiRequestsExhausted({ limit: 10 }),
      "You've used all 10 free AI requests for this month. Upgrade to Pro for more AI tokens.",
    );
  });

  it("proUserDescription — feature-flag style description", () => {
    assert.equal(
      TIER_COPY.proUserDescription("AI-ranked notification feed"),
      "AI-ranked notification feed for Pro users",
    );
  });
});
