/**
 * Pure-logic tests for the recruiter-marketplace sourcing/bidding rules
 * (SourcingListingService). Companies open a job to external recruiter
 * bids (`job_sourcing_listings`); recruiters bid; one wins.
 *
 * The DB round-trips (insert/onConflictDoUpdate/auto-reject losers) are
 * Drizzle's concern. The load-bearing DECISIONS are extracted into pure
 * helpers the service delegates to:
 *   • evaluateBidEligibility — the place-bid gate (own-job / not-open /
 *     deadline / duplicate), incl. reason precedence
 *   • selectWinningBid       — lowest-fee-wins auction selection + tiebreak
 *   • rowToConfig            — listing row → SourcingConfig projection
 *
 * Run: node --import tsx --test src/services/recruiter-marketplace/__tests__/sourcing-bidding.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateBidEligibility,
  selectWinningBid,
  rowToConfig,
} from "../SourcingListingService.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

// ───────────────────────────────────────────────────────────────────────────
// evaluateBidEligibility — the place-bid gate
// ───────────────────────────────────────────────────────────────────────────

describe("evaluateBidEligibility (happy path)", () => {
  it("allows a bid when open, before deadline, by a non-owner with no prior bid", () => {
    const r = evaluateBidEligibility({
      jobOwnerId: "owner-1",
      bidderId: "recruiter-2",
      acceptsBids: true,
      deadline: "2026-07-01T00:00:00.000Z",
      hasExistingPendingBid: false,
      now: NOW,
    });
    assert.equal(r, null);
  });

  it("allows when there is no deadline at all", () => {
    const r = evaluateBidEligibility({
      jobOwnerId: "owner-1",
      bidderId: "recruiter-2",
      acceptsBids: true,
      deadline: null,
      hasExistingPendingBid: false,
      now: NOW,
    });
    assert.equal(r, null);
  });
});

describe("evaluateBidEligibility (rejections)", () => {
  it("OWN_JOB when the bidder owns the requisition", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "u-1",
        bidderId: "u-1",
        acceptsBids: true,
        deadline: null,
        hasExistingPendingBid: false,
        now: NOW,
      }),
      "OWN_JOB",
    );
  });

  it("NOT_OPEN when the listing isn't accepting bids", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "owner-1",
        bidderId: "recruiter-2",
        acceptsBids: false,
        deadline: null,
        hasExistingPendingBid: false,
        now: NOW,
      }),
      "NOT_OPEN",
    );
  });

  it("DEADLINE_PASSED when the deadline is strictly before now", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "owner-1",
        bidderId: "recruiter-2",
        acceptsBids: true,
        deadline: new Date(NOW.getTime() - 1),
        hasExistingPendingBid: false,
        now: NOW,
      }),
      "DEADLINE_PASSED",
    );
  });

  it("BID_EXISTS when the bidder already has a live pending bid", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "owner-1",
        bidderId: "recruiter-2",
        acceptsBids: true,
        deadline: null,
        hasExistingPendingBid: true,
        now: NOW,
      }),
      "BID_EXISTS",
    );
  });
});

describe("evaluateBidEligibility (boundary + precedence)", () => {
  it("is allowed exactly AT the deadline instant (strict `<` rejects only past)", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "owner-1",
        bidderId: "recruiter-2",
        acceptsBids: true,
        deadline: NOW, // deadline === now
        hasExistingPendingBid: false,
        now: NOW,
      }),
      null,
    );
  });

  it("OWN_JOB outranks every other failing condition", () => {
    // Owner bidding a closed, past-deadline listing on which they already bid:
    // OWN_JOB wins the precedence.
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "u-1",
        bidderId: "u-1",
        acceptsBids: false,
        deadline: new Date(NOW.getTime() - 1),
        hasExistingPendingBid: true,
        now: NOW,
      }),
      "OWN_JOB",
    );
  });

  it("NOT_OPEN outranks DEADLINE_PASSED and BID_EXISTS", () => {
    assert.equal(
      evaluateBidEligibility({
        jobOwnerId: "owner-1",
        bidderId: "recruiter-2",
        acceptsBids: false,
        deadline: new Date(NOW.getTime() - 1),
        hasExistingPendingBid: true,
        now: NOW,
      }),
      "NOT_OPEN",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// selectWinningBid — lowest fee wins, earliest breaks ties
// ───────────────────────────────────────────────────────────────────────────

describe("selectWinningBid", () => {
  const t = (s: string) => new Date(s);

  it("returns null for an empty bid set", () => {
    assert.equal(selectWinningBid([]), null);
  });

  it("returns null when no bid is pending", () => {
    const bids = [
      { id: "a", status: "rejected", bidAmount: 1000, createdAt: t("2026-06-01") },
      { id: "b", status: "withdrawn", bidAmount: 500, createdAt: t("2026-06-02") },
    ];
    assert.equal(selectWinningBid(bids), null);
  });

  it("picks the lowest fee among pending bids", () => {
    const bids = [
      { id: "a", status: "pending", bidAmount: 3000, createdAt: t("2026-06-01") },
      { id: "b", status: "pending", bidAmount: 1500, createdAt: t("2026-06-02") },
      { id: "c", status: "pending", bidAmount: 2200, createdAt: t("2026-06-03") },
    ];
    assert.equal(selectWinningBid(bids)?.id, "b");
  });

  it("ignores non-pending bids even if they're cheaper", () => {
    const bids = [
      { id: "a", status: "rejected", bidAmount: 100, createdAt: t("2026-06-01") },
      { id: "b", status: "pending", bidAmount: 2000, createdAt: t("2026-06-02") },
    ];
    assert.equal(selectWinningBid(bids)?.id, "b");
  });

  it("breaks ties on equal fee by earliest createdAt (first-come)", () => {
    const bids = [
      { id: "late", status: "pending", bidAmount: 1000, createdAt: t("2026-06-05") },
      { id: "early", status: "pending", bidAmount: 1000, createdAt: t("2026-06-02") },
    ];
    assert.equal(selectWinningBid(bids)?.id, "early");
  });

  it("coerces string fee amounts (numeric columns serialize as strings)", () => {
    const bids = [
      { id: "a", status: "pending", bidAmount: "2500.00", createdAt: t("2026-06-01") },
      { id: "b", status: "pending", bidAmount: "999.50", createdAt: t("2026-06-02") },
    ];
    assert.equal(selectWinningBid(bids)?.id, "b");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// rowToConfig — listing row → SourcingConfig
// ───────────────────────────────────────────────────────────────────────────

describe("rowToConfig", () => {
  it("returns the closed EMPTY_CONFIG for an undefined row", () => {
    assert.deepEqual(rowToConfig(undefined), {
      acceptsBids: false,
      feeCents: null,
      deadline: null,
      terms: null,
    });
  });

  it("projects a populated listing row + ISO-stringifies the deadline", () => {
    const deadline = new Date("2026-07-01T00:00:00.000Z");
    const cfg = rowToConfig({
      acceptsBids: true,
      feeCents: 250_000,
      deadline,
      terms: "Net 30, 90-day guarantee",
    } as any);
    assert.equal(cfg.acceptsBids, true);
    assert.equal(cfg.feeCents, 250_000);
    assert.equal(cfg.deadline, "2026-07-01T00:00:00.000Z");
    assert.equal(cfg.terms, "Net 30, 90-day guarantee");
  });

  it("keeps a null deadline null (no spurious epoch date)", () => {
    const cfg = rowToConfig({
      acceptsBids: true,
      feeCents: null,
      deadline: null,
      terms: null,
    } as any);
    assert.equal(cfg.deadline, null);
    assert.equal(cfg.feeCents, null);
  });
});
