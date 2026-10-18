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
    auth_tokens: [],
    provider_connections: [
      { id: "sc-1", userId: "u-gone", companyId: null, purpose: "social_publish", provider: "tiktok" },
      { id: "sc-2", userId: "u-gone", companyId: "co-1", purpose: "social_publish", provider: "facebook" },
      { id: "sc-3", userId: "u-stays", companyId: null, purpose: "social_publish", provider: "x" },
      { id: "yt-1", userId: "u-gone", companyId: null, purpose: "youtube", provider: "google" },
      { id: "li-1", userId: "u-gone", companyId: null, purpose: "login", provider: "google" },
    ],
  });
}

/** The fake db has no `execute`; archive erasure is covered by its own tests. */
const noArchive = async () => {};

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
      eraseArchive: noArchive,
    });
    assert.deepEqual(usage.calls, ["u-gone"]);
  });

  it("purges the leaving user's archive-schema rows (registry-driven)", async () => {
    const { db } = makeDb();
    const archived: Array<{ userId: string; email?: string | null }> = [];
    await deleteAccount("u-gone", undefined, {
      db,
      repos: { usageTracking: spyRepo().repo } as any,
      eraseArchive: async (subject) => { archived.push(subject); },
    });
    // The ORIGINAL email (read before anonymization), not deleted-…@deleted.local.
    assert.deepEqual(archived, [{ userId: "u-gone", email: "gone@acme.com" }]);
  });

  it("anonymizes the users row in the same pass (sanity: erase is additive, not a replacement)", async () => {
    const { db, state } = makeDb();
    const usage = spyRepo();
    await deleteAccount("u-gone", undefined, {
      db,
      repos: { usageTracking: usage.repo } as any,
      eraseArchive: noArchive,
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
      eraseArchive: noArchive,
    });
    assert.deepEqual(state.provider_connections.map((r: any) => r.id).sort(), ["li-1", "sc-2", "sc-3"]);
  });
});
