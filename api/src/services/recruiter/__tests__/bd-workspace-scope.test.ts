/**
 * BD pipeline workspace-sharing visibility clause (#1766).
 *
 * `visibleTo` builds the row-visibility WHERE for clients/deals: owner-only
 * when the caller has no shared workspaces, OR-extended to
 * `workspace_id IN (scope)` when they do. The fake-db harness ignores WHERE
 * clauses and the service reads via the `getDb()` singleton (no DI seam), so a
 * true row-filter integration test isn't possible here — instead we pin the
 * STRUCTURAL invariant that the OR/inArray branch is present iff the caller has
 * shared workspaces, so a refactor can't silently widen (every recruiter sees
 * everyone) or narrow (sharing stops working) the clause.
 *
 * Run: node --import tsx --test src/services/recruiter/__tests__/bd-workspace-scope.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { visibleTo } from "../bd-pipeline.js";
import { schema } from "../../../db/index.js";

const { recruiterDeals } = schema;

describe("visibleTo (#1766)", () => {
  it("is owner-only (no OR branch) when the caller has no shared workspaces", () => {
    const clause = visibleTo(
      recruiterDeals.recruiterUserId,
      recruiterDeals.workspaceId,
      "user-1",
      [],
    );
    const baseline = eq(recruiterDeals.recruiterUserId, "user-1");
    // Same shape as a bare owner equality — no extra OR/inArray chunks.
    assert.equal(clause.queryChunks.length, baseline.queryChunks.length);
  });

  it("adds the shared-workspace OR branch when the caller has workspaces", () => {
    const owner = visibleTo(
      recruiterDeals.recruiterUserId,
      recruiterDeals.workspaceId,
      "user-1",
      [],
    );
    const shared = visibleTo(
      recruiterDeals.recruiterUserId,
      recruiterDeals.workspaceId,
      "user-1",
      ["ws-1", "ws-2"],
    );
    // The shared case is an OR(eq, inArray(...)) — a parenthesized wrapper with
    // a different chunk shape than the bare owner eq. The exact direction is a
    // drizzle internal; what matters is the clause CHANGES when workspaces are
    // present (so sharing actually widens the filter, not silently a no-op).
    assert.notEqual(shared.queryChunks.length, owner.queryChunks.length);
  });
});
