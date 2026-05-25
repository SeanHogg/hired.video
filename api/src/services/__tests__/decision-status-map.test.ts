/**
 * Tests for the pure interview-decision → application-status mapping
 * behind #1234.
 *
 * Run: node --import tsx --test src/services/__tests__/decision-status-map.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapDecisionToApplicationStatus } from "../interview/decision-status-map.js";

describe("mapDecisionToApplicationStatus", () => {
  it("shortlist → 'interviewing' (advance the candidate)", () => {
    assert.equal(mapDecisionToApplicationStatus("shortlist"), "interviewing");
  });

  it("reject → 'rejected' (out of pipeline)", () => {
    assert.equal(mapDecisionToApplicationStatus("reject"), "rejected");
  });

  it("maybe → 'applied' (no pipeline change yet)", () => {
    // The recruiter is undecided — we don't want to falsely move the
    // candidate into 'interviewing' until they're shortlisted.
    assert.equal(mapDecisionToApplicationStatus("maybe"), "applied");
  });

  it("null (decision cleared) → 'applied' (reset)", () => {
    // Recruiter clicked "Clear" — we revert to the default so a future
    // shortlist/reject can transition cleanly.
    assert.equal(mapDecisionToApplicationStatus(null), "applied");
  });
});
