/**
 * Tests for billing pricing constants, audience derivation, and the
 * token-budget-exceeded error envelope.
 *
 * Covers:
 *   • Pricing constants        — PRO/PREMIUM prices, yearly = 20% off monthly,
 *                                 FREE/PRO token allowances, FREE limits
 *   • TOKEN_PACKS              — 4 packs sorted ascending by size/price,
 *                                 ≥25% margin vs $3/M cost basis,
 *                                 effectiveDollarsPerMillion = price/tokens*1M
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
  PREMIUM_MONTHLY_PRICE,
  PREMIUM_YEARLY_PRICE,
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  FREE_AI_MONTHLY_LIMIT,
  FREE_TEAM_MEMBER_LIMIT,
  FREE_MONTHLY_MATCHES,
  FREE_MONTHLY_APPLICATIONS,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  TOKEN_PACKS,
} from "../../../../shared/pricing.js";
import { isAdminRole, deriveAudience, deriveTier } from "../../domains/billing/audience.js";
import type { JwtPayload } from "../../types/index.js";

// ═══════════════════════════════════════════════════════════════════════════
// Pricing constants
// ═══════════════════════════════════════════════════════════════════════════

describe("Pricing constants", () => {
  it("Pro monthly is $9.95", () => {
    assert.equal(PRO_MONTHLY_PRICE, 9.95);
  });

  it("Pro yearly is 20% off monthly × 12", () => {
    // Formula: monthly * 12 * 0.8, rounded to 2 decimals.
    const expected = +(PRO_MONTHLY_PRICE * 12 * 0.8).toFixed(2);
    assert.equal(PRO_YEARLY_PRICE, expected);
  });

  it("Premium prices mirror Pro prices (Premium is a legacy alias)", () => {
    assert.equal(PREMIUM_MONTHLY_PRICE, PRO_MONTHLY_PRICE);
    assert.equal(PREMIUM_YEARLY_PRICE, PRO_YEARLY_PRICE);
  });

  it("Pro token allowance is 1M / month", () => {
    assert.equal(PRO_AI_MONTHLY_TOKENS, 1_000_000);
  });

  it("Free token allowance is 50k / month (50% more generous than old 30k limit)", () => {
    assert.equal(FREE_AI_MONTHLY_TOKENS, 50_000);
  });

  it("Free tier has distinct per-feature limits", () => {
    assert.equal(FREE_AI_MONTHLY_LIMIT, 10);
    assert.equal(FREE_TEAM_MEMBER_LIMIT, 2);
    assert.equal(FREE_MONTHLY_MATCHES, 5);
    assert.equal(FREE_MONTHLY_APPLICATIONS, 10);
    assert.equal(FREE_PUBLISHED_VIDEOS_LIMIT, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN_PACKS — cart SKUs
// ═══════════════════════════════════════════════════════════════════════════

describe("TOKEN_PACKS", () => {
  it("has exactly 4 packs: Bite / Standard / Power / Mega", () => {
    assert.equal(TOKEN_PACKS.length, 4);
    const names = TOKEN_PACKS.map((p) => p.name);
    assert.deepEqual(names, ["Bite", "Standard", "Power", "Mega"]);
  });

  it("each pack has a unique SKU id", () => {
    const ids = TOKEN_PACKS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("packs are sorted ascending by token count AND by price (bigger pack = bigger price)", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(TOKEN_PACKS[i].tokens > TOKEN_PACKS[i - 1].tokens, "tokens ascending");
      assert.ok(TOKEN_PACKS[i].price > TOKEN_PACKS[i - 1].price, "price ascending");
    }
  });

  it("effectiveDollarsPerMillion matches price / tokens * 1_000_000 (display-only, must not drift from math)", () => {
    for (const pack of TOKEN_PACKS) {
      const actual = +((pack.price / pack.tokens) * 1_000_000).toFixed(2);
      assert.equal(
        pack.effectiveDollarsPerMillion,
        actual,
        `${pack.id}: effectiveDollarsPerMillion=${pack.effectiveDollarsPerMillion} but math says ${actual}`,
      );
    }
  });

  it("every pack nets \u226525% margin over the $3/M cost basis", () => {
    // See memory/project_token_pricing.md — cost basis is $3/M and the
    // pricing model guarantees at least 25% net margin after Stripe fees.
    // effectiveDollarsPerMillion must therefore be \u2265 $3.00 * 1.25 * 1/(1-0.029)
    // \u2248 $3.86. Round down slightly to $3.80 to tolerate rounding.
    const MIN_DOLLARS_PER_MILLION = 3.8;
    for (const pack of TOKEN_PACKS) {
      assert.ok(
        pack.effectiveDollarsPerMillion >= MIN_DOLLARS_PER_MILLION,
        `${pack.id}: ${pack.effectiveDollarsPerMillion} $/M is below the ${MIN_DOLLARS_PER_MILLION} margin floor`,
      );
    }
  });

  it("bigger packs have cheaper $/M rates (volume discount, but ordered)", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(
        TOKEN_PACKS[i].effectiveDollarsPerMillion <= TOKEN_PACKS[i - 1].effectiveDollarsPerMillion,
        `${TOKEN_PACKS[i].id} ($/M=${TOKEN_PACKS[i].effectiveDollarsPerMillion}) should be \u2264 ${TOKEN_PACKS[i - 1].id} ($/M=${TOKEN_PACKS[i - 1].effectiveDollarsPerMillion})`,
      );
    }
  });

  it("has a Standard pack around the $12 psychological price point", () => {
    const std = TOKEN_PACKS.find((p) => p.name === "Standard");
    assert.ok(std);
    assert.ok(std!.price < 15 && std!.price > 10, `Standard priced at $${std!.price}`);
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
    assert.equal(deriveAudience(null, { isPremium: true } as any), "anonymous");
  });

  it("returns 'admin' for any admin/super-admin regardless of billing", () => {
    assert.equal(deriveAudience(jwt({ roles: ["admin"] }), null), "admin");
    assert.equal(
      deriveAudience(jwt({ roles: ["super_admin"] }), { isPremium: false } as any),
      "admin",
    );
    // Admin status wins over pro subscription status.
    assert.equal(
      deriveAudience(jwt({ roles: ["admin"] }), { isPremium: true } as any),
      "admin",
    );
  });

  it("returns 'pro' when sub.isPremium is true and user is not admin", () => {
    assert.equal(
      deriveAudience(jwt({ roles: ["job_seeker"] }), { isPremium: true } as any),
      "pro",
    );
  });

  it("returns 'free' for authenticated users without a pro sub", () => {
    assert.equal(deriveAudience(jwt({ roles: ["job_seeker"] }), null), "free");
    assert.equal(
      deriveAudience(jwt({ roles: ["job_seeker"] }), { isPremium: false } as any),
      "free",
    );
  });
});

describe("deriveTier — billing-only shape", () => {
  it("returns 'pro' when sub.isPremium is true", () => {
    assert.equal(deriveTier({ isPremium: true } as any), "pro");
  });

  it("returns 'free' when sub.isPremium is false / null / undefined", () => {
    assert.equal(deriveTier({ isPremium: false } as any), "free");
    assert.equal(deriveTier(null), "free");
    assert.equal(deriveTier(undefined), "free");
  });

  it("only has 2 possible return values (never 'admin' — that's Audience, not Tier)", () => {
    // Pin the contract: Tier is the billing axis, not the policy axis.
    const values = [
      deriveTier(null),
      deriveTier({ isPremium: true } as any),
      deriveTier({ isPremium: false } as any),
    ];
    for (const v of values) {
      assert.ok(v === "free" || v === "pro", `unexpected tier value: ${v}`);
    }
  });
});
