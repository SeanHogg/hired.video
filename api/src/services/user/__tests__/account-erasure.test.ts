/**
 * Account-deletion usage-erasure test (gap #2067).
 *
 * `deleteAccount` soft-deletes (anonymizes) the users row rather than
 * hard-deleting it, and `usage_sessions.user_id` is ON DELETE SET NULL — so the
 * FK cascade never fires and a leaving user's tracked sessions/events would
 * orphan forever unless we erase them explicitly. This proves the deletion path
 * drives `UsageService.eraseForUser(userId)` with the right id.
 *
 * The usage repo is injected as a spy via `deps.repos.usageTracking`, so the
 * assertion proves the wire end-to-end without needing the fake-db to model the
 * `delete().returning()` chain `eraseByUser` uses.
 *
 * Run: node --import tsx --test src/services/user/__tests__/account-erasure.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { __setDefaultApiDepsForTests } from "../../apiDeps.js";
import { deleteAccount } from "../account.js";

// resolveDeps() always calls defaultApiDeps(); stub it so it never constructs
// real repos / opens a DB connection. We inject everything the path reads.
__setDefaultApiDepsForTests({ repos: {} } as any);

function makeDb() {
  return buildFakeDb({
    users: [{ id: "u-gone", name: "Gone", email: "gone@acme.com", role: "job_seeker", isActive: true }],
    user_profiles: [{ id: "p-1", userId: "u-gone" }],
    videos: [],
    studio_projects: [],
    refresh_tokens: [],
    password_reset_tokens: [],
    email_verification_tokens: [],
    two_factor_codes: [],
    social_connections: [
      { id: "sc-1", userId: "u-gone", companyId: null, platform: "tiktok" },
      { id: "sc-2", userId: "u-gone", companyId: "co-1", platform: "facebook" },
      { id: "sc-3", userId: "u-stays", companyId: null, platform: "x" },
    ],
    youtube_accounts: [{ id: "yt-1", userId: "u-gone" }],
  });
}

/** Minimal IUsageTrackingRepository spy — only `eraseByUser` is exercised by
 *  `UsageService.eraseForUser`. */
function spyRepo() {
  const calls: string[] = [];
  return {
    calls,
    repo: {
      async eraseByUser(userId: string) {
        calls.push(userId);
        return 3;
      },
    },
  };
}

describe("deleteAccount — usage erasure (#2067)", () => {
  it("erases the leaving user's usage rows via UsageService.eraseForUser", async () => {
    const { db } = makeDb();
    const usage = spyRepo();
    await deleteAccount("u-gone", undefined, {
      db,
      repos: { usageTracking: usage.repo } as any,
    });
    assert.deepEqual(usage.calls, ["u-gone"]);
  });

  it("anonymizes the users row in the same pass (sanity: erase is additive, not a replacement)", async () => {
    const { db, state } = makeDb();
    const usage = spyRepo();
    await deleteAccount("u-gone", undefined, {
      db,
      repos: { usageTracking: usage.repo } as any,
    });
    const row = state.users.find((u: any) => u.id === "u-gone");
    assert.equal(row.isActive, false);
    assert.equal(row.email, "deleted-u-gone@deleted.local");
    assert.equal(usage.calls.length, 1);
  });
});

describe("deleteAccount — connected publishing accounts", () => {
  it("deletes the leaving user's personal social, LinkedIn and YouTube tokens only", async () => {
    const { db, state } = makeDb();
    await deleteAccount("u-gone", undefined, {
      db,
      repos: { usageTracking: spyRepo().repo } as any,
    });
    assert.deepEqual(state.social_connections.map((r: any) => r.id).sort(), ["sc-2", "sc-3"]);
    assert.deepEqual(state.youtube_accounts, []);
  });
});
