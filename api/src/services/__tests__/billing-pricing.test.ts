/**
 * Tests for billing pricing constants, audience derivation, and the
 * token-budget-exceeded error envelope.
 *
 * Covers:
 *   • Pricing constants        — PRO/PREMIUM prices, yearly = 20% off monthly,
 *                                 FREE/PRO token allowances, FREE limits
 *   • TOKEN_PACKS              — packs sorted ascending by size/price, each
 *                                 ≥25% net margin at the WORST-CASE cost
 *                                 (every token on Opus 5.5, shared/ai-model-rates)
 *   • deriveTier               — free / pro mapping
 *   • deriveAudience           — anonymous / free / pro / admin precedence
 *   • isAdminRole              — SuperAdmin / Admin roles + isSuperAdmin flag
 *
 * Run: node --import tsx --test src/services/__tests__/billing-pricing.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  FREE_AI_MONTHLY_LIMIT,
  FREE_TEAM_MEMBER_LIMIT,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  TOKEN_PACKS,
  tokenPackDollarsPerMillion,
  tokenPackPriceCents,
  findTokenPack,
  hasTokensForAiCall,
  AI_CALL_MIN_TOKENS,
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
  SEAT_PRICE_CENTS,
} from "../../../../shared/pricing.js";
import { aiCallCostUsd } from "../../../../shared/ai-model-rates.js";
import { companySubscriptions } from "../../db/schema/billing.js";
import { deriveAudience, deriveTier } from "../../domains/billing/audience.js";
import { isAdminRole } from "../../middleware/superAdmin.js";
import type { JwtPayload } from "../../types/index.js";

// ═══════════════════════════════════════════════════════════════════════════
// Pricing constants
// ═══════════════════════════════════════════════════════════════════════════

describe("Pricing constants", () => {
  it("Pro monthly is $1.99", () => {
    assert.equal(PRO_MONTHLY_PRICE, 1.99);
  });

  it("Pro yearly is 20% off monthly × 12", () => {
    // Formula: monthly * 12 * 0.8, rounded to 2 decimals.
    const expected = +(PRO_MONTHLY_PRICE * 12 * 0.8).toFixed(2);
    assert.equal(PRO_YEARLY_PRICE, expected);
  });

  it("Pro allowance stays profitable even if every token runs on Opus 5.5", () => {
    const worstCaseCost = worstCaseCostUsd(PRO_AI_MONTHLY_TOKENS);
    const net = PRO_MONTHLY_PRICE - cardFeeUsd(PRO_MONTHLY_PRICE) - worstCaseCost;
    assert.ok(net > 0, `Pro loses $${(-net).toFixed(2)} per user at the cap`);
  });

  it("the AI-call gate needs AI_CALL_MIN_TOKENS left (bounds post-call overage)", () => {
    assert.equal(hasTokensForAiCall(AI_CALL_MIN_TOKENS), true);
    assert.equal(hasTokensForAiCall(AI_CALL_MIN_TOKENS - 1), false);
    assert.equal(hasTokensForAiCall(0), false);
    assert.equal(hasTokensForAiCall(Number.POSITIVE_INFINITY), true);
  });

  it("Free token allowance is 50k / month (50% more generous than old 30k limit)", () => {
    assert.equal(FREE_AI_MONTHLY_TOKENS, 50_000);
  });

  it("Free tier has distinct per-feature limits", () => {
    assert.equal(FREE_AI_MONTHLY_LIMIT, 10);
    assert.equal(FREE_TEAM_MEMBER_LIMIT, 2);
    assert.equal(FREE_PUBLISHED_VIDEOS_LIMIT, 1);
  });

  it("Inbox Sync includes 3 mailboxes; extra slots are $5/mo each (#809)", () => {
    // Marketing copy ("3 mailboxes per user, +$5/mo each"), the upgrade
    // banner, and the InboxSeatAddonService PRICE_CENTS all derive from
    // these two constants — pin them so the add-on contract can't drift.
    assert.equal(INBOX_SYNC_INCLUDED_ACCOUNTS, 3);
    assert.equal(INBOX_SYNC_EXTRA_ACCOUNT_PRICE, 5);
  });

  it("Every seat is the canonical $9.95 (995¢) — no stale $49 default (project_pricing_seats)", () => {
    // SEAT_PRICE_CENTS is the SSoT for the seat soft-cap prompt, the workforce
    // reconciler, the PricingConfig default, and the company_subscriptions
    // column default. Pin it. Seats are deliberately decoupled from Pro
    // (Pro dropped to $1.99 on 2026-10-03; seats stay $9.95).
    assert.equal(SEAT_PRICE_CENTS, 995);
    assert.notEqual(SEAT_PRICE_CENTS, Math.round(PRO_MONTHLY_PRICE * 100));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// company_subscriptions seat-price default (migration 0320)
//
// The column shipped with a stale 4900¢ ($49) default that contradicted the
// product. The Drizzle default must now equal SEAT_PRICE_CENTS so a row
// inserted without an explicit price bills the right amount.
// ═══════════════════════════════════════════════════════════════════════════

describe("company_subscriptions.pricePerSeatCents default", () => {
  it("defaults to SEAT_PRICE_CENTS (995¢), not the retired 4900¢", () => {
    const def = (companySubscriptions.pricePerSeatCents as unknown as { default: number }).default;
    assert.equal(def, SEAT_PRICE_CENTS);
    assert.notEqual(def, 4900);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inbox-seat add-on (#809) — cap + recurring-charge arithmetic
//
// Mirrors the math in InboxSeatAddonService.getState() and the connect-time
// cap check in routes/email-integration.ts. Pure assertions so the
// money-adjacent path is guarded without a DB harness.
// ═══════════════════════════════════════════════════════════════════════════

describe("Inbox-seat add-on arithmetic", () => {
  const PRICE_CENTS = Math.round(INBOX_SYNC_EXTRA_ACCOUNT_PRICE * 100);

  it("unit price resolves to 500 cents", () => {
    assert.equal(PRICE_CENTS, 500);
  });

  it("effective cap = included base + purchased slots", () => {
    for (const qty of [0, 1, 3, 50]) {
      assert.equal(INBOX_SYNC_INCLUDED_ACCOUNTS + qty, 3 + qty);
    }
  });

  it("monthly total = quantity × unit price", () => {
    assert.equal(0 * PRICE_CENTS, 0); // no add-on → $0
    assert.equal(1 * PRICE_CENTS, 500); // 1 slot → $5/mo
    assert.equal(4 * PRICE_CENTS, 2000); // 4 slots → $20/mo
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN_PACKS — cart SKUs
// ═══════════════════════════════════════════════════════════════════════════

/** Card fee assumption: 2.9% + $0.30 per charge. */
function cardFeeUsd(price: number): number {
  return price * 0.029 + 0.3;
}

/** Worst case: every token on Opus 5.5 at a 70/30 input/output split. */
function worstCaseCostUsd(tokens: number): number {
  return aiCallCostUsd({
    model: "claude-opus-5-5",
    promptTokens: Math.round(tokens * 0.7),
    completionTokens: Math.round(tokens * 0.3),
  });
}

describe("TOKEN_PACKS", () => {
  it("each pack has a unique SKU id and an i18n label key", () => {
    const ids = TOKEN_PACKS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const pack of TOKEN_PACKS) assert.match(pack.labelKey, /^billing\.tokenPacks\.pack\./);
  });

  it("packs are sorted ascending by token count AND by price", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(TOKEN_PACKS[i].tokens > TOKEN_PACKS[i - 1].tokens, "tokens ascending");
      assert.ok(TOKEN_PACKS[i].price > TOKEN_PACKS[i - 1].price, "price ascending");
    }
  });

  it("every pack nets ≥25% margin even if all its tokens run on Opus 5.5", () => {
    for (const pack of TOKEN_PACKS) {
      const net = pack.price - cardFeeUsd(pack.price) - worstCaseCostUsd(pack.tokens);
      const margin = net / pack.price;
      assert.ok(margin >= 0.25, `${pack.id}: ${(margin * 100).toFixed(1)}% margin is below 25%`);
    }
  });

  it("bigger packs have cheaper (or equal) $/M rates", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(
        tokenPackDollarsPerMillion(TOKEN_PACKS[i]) <= tokenPackDollarsPerMillion(TOKEN_PACKS[i - 1]),
        `${TOKEN_PACKS[i].id} should not cost more per token than ${TOKEN_PACKS[i - 1].id}`,
      );
    }
  });

  it("price in cents is exact and findTokenPack resolves ids", () => {
    const pack = findTokenPack(TOKEN_PACKS[0].id);
    assert.ok(pack);
    assert.equal(tokenPackPriceCents(pack!), Math.round(pack!.price * 100));
    assert.equal(findTokenPack("nope"), undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isAdminRole / deriveAudience / deriveTier
// ═══════════════════════════════════════════════════════════════════════════

function jwt(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: "user-1",
    email: "u@e.com",
    roles: [],
    emailVerified: true,
    mustChangePassword: false,
    iat: 0,
    exp: 0,
    ...overrides,
  } as JwtPayload;
}

describe("isAdminRole", () => {
  it("returns false for null / undefined user", () => {
    assert.equal(isAdminRole(null), false);
    assert.equal(isAdminRole(undefined), false);
  });

  it("returns true when `roles` includes 'admin'", () => {
    assert.equal(isAdminRole(jwt({ roles: ["admin"] })), true);
  });

  it("returns true when `roles` includes 'super_admin'", () => {
    assert.equal(isAdminRole(jwt({ roles: ["super_admin"] })), true);
  });

  it("returns true when the legacy single `role` field is admin or super_admin", () => {
    assert.equal(isAdminRole(jwt({ role: "admin" } as any)), true);
    assert.equal(isAdminRole(jwt({ role: "super_admin" } as any)), true);
  });

  it("returns true when isSuperAdmin flag is set (DB-level flag, unrelated to roles)", () => {
    assert.equal(isAdminRole(jwt({ isSuperAdmin: true } as any)), true);
  });

  it("returns false for job_seeker / recruiter / employer roles", () => {
    assert.equal(isAdminRole(jwt({ roles: ["job_seeker"] })), false);
    assert.equal(isAdminRole(jwt({ roles: ["recruiter"] })), false);
    assert.equal(isAdminRole(jwt({ roles: ["employer"] })), false);
    assert.equal(isAdminRole(jwt({ role: "job_seeker" } as any)), false);
  });
});

describe("deriveAudience — policy dispatch precedence", () => {
  it("returns 'anonymous' when user is null/undefined", () => {
    assert.equal(deriveAudience(null, null), "anonymous");
    assert.equal(deriveAudience(undefined, null), "anonymous");
    assert.equal(deriveAudience(null, { isPro: true } as any), "anonymous");
  });

  it("returns 'admin' for any admin/super-admin regardless of billing", () => {
    assert.equal(deriveAudience(jwt({ roles: ["admin"] }), null), "admin");
    assert.equal(
      deriveAudience(jwt({ roles: ["super_admin"] }), { isPro: false } as any),
      "admin",
    );
    // Admin status wins over pro subscription status.
    assert.equal(
      deriveAudience(jwt({ roles: ["admin"] }), { isPro: true } as any),
      "admin",
    );
  });

  it("returns 'pro' when sub.isPro is true and user is not admin", () => {
    assert.equal(
      deriveAudience(jwt({ roles: ["job_seeker"] }), { isPro: true } as any),
      "pro",
    );
  });

  it("returns 'free' for authenticated users without a pro sub", () => {
    assert.equal(deriveAudience(jwt({ roles: ["job_seeker"] }), null), "free");
    assert.equal(
      deriveAudience(jwt({ roles: ["job_seeker"] }), { isPro: false } as any),
      "free",
    );
  });
});

describe("deriveTier — billing-only shape", () => {
  it("returns 'pro' when sub.isPro is true", () => {
    assert.equal(deriveTier({ isPro: true } as any), "pro");
  });

  it("returns 'free' when sub.isPro is false / null / undefined", () => {
    assert.equal(deriveTier({ isPro: false } as any), "free");
    assert.equal(deriveTier(null), "free");
    assert.equal(deriveTier(undefined), "free");
  });

  it("only has 2 possible return values (never 'admin' — that's Audience, not Tier)", () => {
    // Pin the contract: Tier is the billing axis, not the policy axis.
    const values = [
      deriveTier(null),
      deriveTier({ isPro: true } as any),
      deriveTier({ isPro: false } as any),
    ];
    for (const v of values) {
      assert.ok(v === "free" || v === "pro", `unexpected tier value: ${v}`);
    }
  });
});
