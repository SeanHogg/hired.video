/**
 * W3-B wallet merge guards (migrations 0590 / 0591 / 0595, schema wallets.ts).
 *
 *   • the CHECK lists in the migration and the Drizzle schema are exactly the
 *     shared/wallets.ts + shared/auth-tokens.ts registries;
 *   • every backfill / catch-up insert is idempotent (ON CONFLICT);
 *   • the archive migration is owner-gated, catches up BEFORE it archives, and
 *     never DROPs a table;
 *   • the legacy-shape views map each wallet column back to the field the
 *     old API responses carried.
 *
 * Run: node --import tsx --test src/repositories/__tests__/wallet-migration.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WALLET_CURRENCY_KINDS, WALLET_LEDGER_TYPES, WALLET_OWNER_KINDS } from "../../../../shared/wallets.js";
import { AUTH_TOKEN_PURPOSES } from "../../../../shared/auth-tokens.js";
import {
  campaignDollarsBalanceView,
  partnerProgramBalanceView,
  pointsBalanceView,
  pointsLedgerView,
} from "../walletViews.js";
import type { WalletLedgerRow, WalletRow } from "../walletRepository.js";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(API_ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");

const m0590 = stripComments(read("drizzle", "0590_wallets.sql"));
const m0591 = stripComments(read("drizzle", "0591_auth_tokens.sql"));
const m0595raw = read("drizzle", "0595_archive_wallet_auth_settings_tables.sql");
const m0595 = stripComments(m0595raw);
const walletsSchema = read("src", "db", "schema", "wallets.ts");
const usersSchema = read("src", "db", "schema", "users.ts");

function inListAfter(text: string, anchor: string): string[] {
  const at = text.indexOf(anchor);
  assert.ok(at >= 0, `anchor ${anchor} not found`);
  const m = text.slice(at).match(/IN \(([^)]*)\)/);
  assert.ok(m, `no IN list after ${anchor}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe("CHECK lists = shared registries", () => {
  const cases: Array<[string, readonly string[]]> = [
    ["wallet_balances_owner_kind_check", WALLET_OWNER_KINDS],
    ["wallet_balances_currency_kind_check", WALLET_CURRENCY_KINDS],
    ["wallet_ledger_owner_kind_check", WALLET_OWNER_KINDS],
    ["wallet_ledger_currency_kind_check", WALLET_CURRENCY_KINDS],
    ["wallet_ledger_type_check", WALLET_LEDGER_TYPES],
  ];
  for (const [name, list] of cases) {
    it(`${name} — migration and schema`, () => {
      assert.deepEqual(inListAfter(m0590, `ADD CONSTRAINT ${name}`), [...list]);
      assert.deepEqual(inListAfter(walletsSchema, `"${name}"`), [...list]);
    });
  }
  it("auth_tokens_purpose_check — migration and schema", () => {
    assert.deepEqual(inListAfter(m0591, "ADD CONSTRAINT auth_tokens_purpose_check"), [...AUTH_TOKEN_PURPOSES]);
    assert.deepEqual(inListAfter(usersSchema, `"auth_tokens_purpose_check"`), [...AUTH_TOKEN_PURPOSES]);
  });
});

describe("migrations are idempotent and archive-first", () => {
  it("every INSERT in the backfills resolves conflicts", () => {
    for (const [name, sql] of [["0590", m0590], ["0591", m0591], ["0595", m0595]] as const) {
      const inserts = sql.match(/INSERT INTO[\s\S]*?(?=;\s*$|\$q\$)/gm) ?? [];
      assert.ok(inserts.length > 0, `${name} has inserts`);
      for (const ins of inserts) assert.match(ins, /ON CONFLICT/, `${name}: ${ins.slice(0, 80)}`);
    }
  });

  it("0595 is owner-gated, catches up before archiving, and never drops a table", () => {
    assert.match(m0595raw, /^-- @owner-gated$/m);
    assert.doesNotMatch(m0595, /DROP TABLE/i);
    const firstArchive = m0595.indexOf("SET SCHEMA archive");
    for (const step of ["__mig_0595_catch_up_wallet(", "__mig_0595_catch_up_ledger(", "__mig_0595_catch_up_tokens(", "INSERT INTO user_settings"]) {
      const at = m0595.lastIndexOf(step);
      assert.ok(at > 0 && at < firstArchive, `${step} runs before the first archive`);
    }
  });

  it("0590 snapshots every balance source it copies, in the same statement", () => {
    for (const t of [
      "user_token_balance", "company_token_balance", "enrichment_credits", "campaign_dollars_balance",
      "partner_program_balances", "user_points_balance", "phone_balances",
    ]) {
      assert.match(m0590, new RegExp(`__mig_0590_backfill_wallet\\('${t}'`), t);
      assert.match(m0595, new RegExp(`__mig_0595_catch_up_wallet\\('${t}'`), t);
      assert.match(m0595, new RegExp(`ALTER TABLE IF EXISTS public\\.${t} SET SCHEMA archive`), t);
    }
  });
});

const wallet = (over: Partial<WalletRow> = {}): WalletRow => ({
  id: "w1",
  ownerKind: "user",
  ownerId: "u1",
  currencyKind: "points",
  balance: 70,
  lifetimeGranted: 120,
  lifetimeConsumed: 40,
  lifetimeReversed: 10,
  isSuspended: false,
  suspendedAt: null,
  suspendedReason: null,
  suspendedBy: null,
  rateCentsPer1kPoints: null,
  lastPeriodId: null,
  autoTopUpEnabled: null,
  autoTopUpThreshold: null,
  autoTopUpAmount: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-02-01"),
  ...over,
});

describe("legacy views", () => {
  it("points balance: earned = granted, redeemed = consumed", () => {
    const v = pointsBalanceView(wallet());
    assert.deepEqual(
      { userId: v.userId, balance: v.balance, lifetimeEarned: v.lifetimeEarned, lifetimeRedeemed: v.lifetimeRedeemed, lifetimeReversed: v.lifetimeReversed },
      { userId: "u1", balance: 70, lifetimeEarned: 120, lifetimeRedeemed: 40, lifetimeReversed: 10 },
    );
  });

  it("partner pool: pending = balance, paid = consumed", () => {
    const v = partnerProgramBalanceView(wallet({ currencyKind: "partner_pool", balance: 3000, lifetimeGranted: 8000, lifetimeConsumed: 5000 }));
    assert.equal(v.pendingCents, 3000);
    assert.equal(v.paidCents, 5000);
    assert.equal(v.pendingCents + v.paidCents, 8000);
  });

  it("campaign dollars keep the *_cents field names", () => {
    const v = campaignDollarsBalanceView(wallet({ currencyKind: "campaign_dollars", balance: 500, lifetimeGranted: 900, lifetimeConsumed: 400, rateCentsPer1kPoints: 100 }));
    assert.deepEqual(
      { b: v.balanceCents, g: v.lifetimeGrantedCents, s: v.lifetimeSpentCents, r: v.rateCentsPer1kPoints },
      { b: 500, g: 900, s: 400, r: 100 },
    );
  });

  it("points ledger: delta = amount, category = type, ref = reference", () => {
    const e = {
      id: "l1", ownerKind: "user", ownerId: "u1", currencyKind: "points", type: "earn", amount: 25,
      balanceAfter: null, referenceType: "task", referenceId: "t1", description: null,
      action: "task.complete.system", source: "tasks", reversesId: null, metadata: { a: 1 },
      createdAt: new Date("2026-03-01"),
    } as WalletLedgerRow;
    const v = pointsLedgerView(e);
    assert.deepEqual(
      { delta: v.delta, category: v.category, refId: v.refId, refType: v.refType, action: v.action, source: v.source },
      { delta: 25, category: "earn", refId: "t1", refType: "task", action: "task.complete.system", source: "tasks" },
    );
  });
});
