import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateSplits,
  normalizeOwnerType,
  recruiterShareForPlacement,
  type SplitShareRow,
} from "../placement-splits.js";

describe("validateSplits (#228)", () => {
  it("accepts an empty set (clears splits → owner takes full fee)", () => {
    assert.deepEqual(validateSplits([]), { ok: true });
  });

  it("accepts a set summing to exactly 100% (10000 bps)", () => {
    const r = validateSplits([
      { ownerUserId: "a", ownerType: "recruiter", percentBps: 6000 },
      { ownerUserId: "b", ownerType: "sourcer", percentBps: 4000 },
    ]);
    assert.equal(r.ok, true);
  });

  it("rejects a set that doesn't total 100%", () => {
    const r = validateSplits([
      { ownerUserId: "a", ownerType: "recruiter", percentBps: 6000 },
      { ownerUserId: "b", ownerType: "sourcer", percentBps: 3000 },
    ]);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /100%/);
  });

  it("rejects duplicate owners", () => {
    const r = validateSplits([
      { ownerUserId: "a", ownerType: "recruiter", percentBps: 5000 },
      { ownerUserId: "a", ownerType: "manager", percentBps: 5000 },
    ]);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /once/);
  });

  it("rejects an out-of-range percent", () => {
    assert.equal(validateSplits([{ ownerUserId: "a", ownerType: "recruiter", percentBps: 0 }]).ok, false);
    assert.equal(validateSplits([{ ownerUserId: "a", ownerType: "recruiter", percentBps: 10001 }]).ok, false);
  });

  it("rejects a missing owner id", () => {
    assert.equal(validateSplits([{ ownerUserId: "", ownerType: "recruiter", percentBps: 10000 }]).ok, false);
  });
});

describe("normalizeOwnerType", () => {
  it("passes through known types and falls back to 'other'", () => {
    assert.equal(normalizeOwnerType("sourcer"), "sourcer");
    assert.equal(normalizeOwnerType("manager"), "manager");
    assert.equal(normalizeOwnerType("ceo"), "other");
    assert.equal(normalizeOwnerType(undefined), "other");
  });
});

describe("recruiterShareForPlacement (commission fan-out, #228)", () => {
  const splits = new Map<string, SplitShareRow[]>([
    ["p1", [
      { ownerUserId: "alice", percentBps: 7000 },
      { ownerUserId: "bob", percentBps: 3000 },
    ]],
  ]);

  it("gives a split owner their bps share of the fee", () => {
    assert.equal(
      recruiterShareForPlacement({ placementId: "p1", ownerRecruiterId: "alice", commissionAmount: 1000, viewerUserId: "alice", splitsByPlacement: splits }),
      700,
    );
    assert.equal(
      recruiterShareForPlacement({ placementId: "p1", ownerRecruiterId: "alice", commissionAmount: 1000, viewerUserId: "bob", splitsByPlacement: splits }),
      300,
    );
  });

  it("gives a non-participant zero even if they own the placement", () => {
    assert.equal(
      recruiterShareForPlacement({ placementId: "p1", ownerRecruiterId: "carol", commissionAmount: 1000, viewerUserId: "carol", splitsByPlacement: splits }),
      0,
    );
  });

  it("with no splits, the owning recruiter takes the full fee", () => {
    assert.equal(
      recruiterShareForPlacement({ placementId: "p2", ownerRecruiterId: "dave", commissionAmount: 1000, viewerUserId: "dave", splitsByPlacement: splits }),
      1000,
    );
    assert.equal(
      recruiterShareForPlacement({ placementId: "p2", ownerRecruiterId: "dave", commissionAmount: 1000, viewerUserId: "erin", splitsByPlacement: splits }),
      0,
    );
  });
});
