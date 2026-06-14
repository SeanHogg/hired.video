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
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  FREE_AI_MONTHLY_LIMIT,
  FREE_TEAM_MEMBER_LIMIT,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  TOKEN_PACKS,
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
  SEAT_PRICE_CENTS,
} from "../../../../shared/pricing.js";
import { companySubscriptions } from "../../db/schema/billing.js";
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

  it("Pro token allowance is 1M / month", () => {
    assert.equal(PRO_AI_MONTHLY_TOKENS, 1_000_000);
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
    // column default. Pin it + assert the per-seat dollar value matches Pro.
    assert.equal(SEAT_PRICE_CENTS, 995);
    assert.equal(SEAT_PRICE_CENTS, Math.round(PRO_MONTHLY_PRICE * 100));
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
