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
 *   • rowToConfig            — listing row → SourcingConfig projection
 *
 * Run: node --import tsx --test src/services/recruiter-marketplace/__tests__/sourcing-bidding.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateBidEligibility,
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
