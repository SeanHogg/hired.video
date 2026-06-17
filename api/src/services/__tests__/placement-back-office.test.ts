/**
 * Unit tests for the #229 placement back-office field sanitizer.
 *
 * Run: node --import tsx --test src/services/__tests__/placement-back-office.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sanitizePlacementBackOffice } from "../recruiter/placement-fee.js";

describe("sanitizePlacementBackOffice", () => {
  it("whitelists known fields and coerces decimals/strings", () => {
    const out = sanitizePlacementBackOffice({
      placementKind: "contract",
      billRateHourly: "120.50",
      payRateHourly: 90,
      currency: "GBP",
      burdenPct: "18.5",
      poNumber: "PO-2026-0001",
      msaRef: "MSA-acme",
      parentPlacementId: "11111111-1111-1111-1111-111111111111",
      // unknown / injection attempt:
      recruiterId: "attacker",
      commissionAmount: "999999",
    });
    assert.equal(out.placementKind, "contract");
    assert.equal(out.billRateHourly, "120.5");
    assert.equal(out.payRateHourly, "90");
    assert.equal(out.currency, "GBP");
    assert.equal(out.burdenPct, "18.5");
    assert.equal(out.poNumber, "PO-2026-0001");
    assert.equal(out.msaRef, "MSA-acme");
    assert.equal((out as any).recruiterId, undefined, "must not pass through arbitrary columns");
    assert.equal((out as any).commissionAmount, undefined);
  });

  it("derives timesheetRequired from placementKind when not explicit", () => {
    assert.equal(sanitizePlacementBackOffice({ placementKind: "contract" }).timesheetRequired, true);
    assert.equal(sanitizePlacementBackOffice({ placementKind: "contract_to_hire" }).timesheetRequired, true);
    assert.equal(sanitizePlacementBackOffice({ placementKind: "direct_hire" }).timesheetRequired, false);
  });

  it("honours an explicit timesheetRequired over the kind default", () => {
    const out = sanitizePlacementBackOffice({ placementKind: "contract", timesheetRequired: false });
    assert.equal(out.timesheetRequired, false);
  });

  it("rejects an unknown placementKind (→ null, no timesheet derivation)", () => {
    const out = sanitizePlacementBackOffice({ placementKind: "freelance_ish" });
    assert.equal(out.placementKind, null);
    assert.equal(out.timesheetRequired, null);
  });

  it("returns an all-null shape for an empty/garbage body", () => {
    const out = sanitizePlacementBackOffice(null);
    assert.equal(out.placementKind, null);
    assert.equal(out.poNumber, null);
    assert.equal(out.billRateHourly, null);
    assert.equal(out.timesheetRequired, null);
  });

  it("drops empty strings and non-finite decimals", () => {
    const out = sanitizePlacementBackOffice({
      currency: "   ",
      billRateHourly: "not-a-number",
      poNumber: "",
    });
    assert.equal(out.currency, null);
    assert.equal(out.billRateHourly, null);
    assert.equal(out.poNumber, null);
  });
});
