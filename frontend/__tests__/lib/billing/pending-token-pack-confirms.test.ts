/**
 * Paid-but-unconfirmed token packs remembered in the browser (#2352): the
 * transaction id is kept from the widget's charge until the server has it,
 * so a tab closed or a network drop between charge and confirm is re-sent on
 * the next visit (the server is idempotent per transaction id).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/token-pack-service", () => ({
  tokenPackService: { confirm: (packId: string, transactionId: string) => confirm(packId, transactionId) },
}));

import {
  confirmRememberedTokenPack,
  listUnconfirmedTokenPacks,
  rememberUnconfirmedTokenPack,
  resumePendingTokenPackConfirms,
} from "@/lib/billing/pending-token-pack-confirms";

const USER = "8d3e5a10-2b6f-4c9e-a7d1-3f0b9c2e4a55";
const BUDGET = {
  planId: "pro",
  isPro: true,
  isUnlimited: false,
  monthly: { used: 0, limit: 150_000, remaining: 150_000, resetAt: "2026-11-01T00:00:00.000Z" },
  pack: { balance: 1_000_000 },
  totalAvailable: 1_150_000,
};
const credited = { granted: true, pending: false, tokensGranted: 1_000_000, tokenBudget: BUDGET };

function serverError(code: string) {
  return Object.assign(new Error(code), { context: { serverCode: code } });
}

beforeEach(() => {
  window.localStorage.clear();
  confirm.mockReset();
});

describe("pending token-pack confirms", () => {
  it("forgets the charge once the server has credited it", async () => {
    confirm.mockResolvedValue(credited);
    const res = await confirmRememberedTokenPack({ packId: "tokens_plus_1m", transactionId: "28411907", userId: USER });
    expect(res.granted).toBe(true);
    expect(listUnconfirmedTokenPacks(USER)).toEqual([]);
  });

  it("keeps the charge when confirm never reached the server, and re-sends it next visit", async () => {
    confirm.mockRejectedValueOnce(Object.assign(new TypeError("Failed to fetch"), { code: "NETWORK_ERROR" }));
    await expect(
      confirmRememberedTokenPack({ packId: "tokens_plus_1m", transactionId: "28411907", userId: USER }),
    ).rejects.toThrow();
    expect(listUnconfirmedTokenPacks(USER).map((e) => e.transactionId)).toEqual(["28411907"]);

    confirm.mockResolvedValue({ ...credited, granted: false, pending: true, tokensGranted: 0 });
    const results = await resumePendingTokenPackConfirms(USER);
    expect(confirm).toHaveBeenLastCalledWith("tokens_plus_1m", "28411907");
    expect(results).toHaveLength(1);
    // The server now holds it as pending; its cron finishes the credit.
    expect(listUnconfirmedTokenPacks(USER)).toEqual([]);
  });

  it("drops a charge the server definitively refused", async () => {
    confirm.mockRejectedValue(serverError("PAYMENT_NOT_VERIFIED"));
    await expect(
      confirmRememberedTokenPack({ packId: "tokens_plus_1m", transactionId: "28411908", userId: USER }),
    ).rejects.toThrow();
    expect(listUnconfirmedTokenPacks(USER)).toEqual([]);
  });

  it("only re-sends this account's charges, and drops ones older than a week", async () => {
    rememberUnconfirmedTokenPack({ packId: "tokens_plus_1m", transactionId: "1", userId: "someone-else" });
    rememberUnconfirmedTokenPack({ packId: "tokens_plus_1m", transactionId: "2", userId: USER });
    expect(listUnconfirmedTokenPacks(USER).map((e) => e.transactionId)).toEqual(["2"]);
    const eightDaysLater = Date.now() + 8 * 24 * 60 * 60 * 1000;
    expect(listUnconfirmedTokenPacks(USER, eightDaysLater)).toEqual([]);
  });
});
