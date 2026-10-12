/**
 * Role-change cache effects: a user's role keys the effective plan, the
 * public references summary and — via the role-keyed "videoResume" section
 * default — whether the partner payload carries their pitch (#2391). Every
 * role write path calls `onUserRoleChanged`, which busts all three; the pitch
 * bust is best-effort and never fails the role change.
 *
 * Run: node --import tsx --test src/services/user/__tests__/roleChangeEffects.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onUserRoleChanged, type RoleChangeCacheBusters } from "../roleChangeEffects.js";
import { assignUserRole, type AdminUsersDeps } from "../../adminUsers.js";

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const ADMIN = "0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

function spyBusters(opts: { pitchFails?: boolean } = {}) {
  const calls: string[] = [];
  const busters: RoleChangeCacheBusters = {
    subscription: (id) => { calls.push(`plan:${id}`); },
    publicReferences: (id) => { calls.push(`refs:${id}`); },
    pitch: async (id) => {
      calls.push(`pitch:${id}`);
      if (opts.pitchFails) throw new Error("KV down");
    },
  };
  return { calls, busters };
}

describe("onUserRoleChanged", () => {
  it("busts plan, public references and pitch caches for the user", async () => {
    const { calls, busters } = spyBusters();
    await onUserRoleChanged(ALICE, busters);
    assert.deepEqual(calls, [`plan:${ALICE}`, `refs:${ALICE}`, `pitch:${ALICE}`]);
  });

  it("a failed pitch bust does not fail the role change", async () => {
    const { calls, busters } = spyBusters({ pitchFails: true });
    await assert.doesNotReject(onUserRoleChanged(ALICE, busters));
    assert.ok(calls.includes(`pitch:${ALICE}`));
  });
});

describe("assignUserRole (SuperAdmin) — role write busts role-keyed caches", () => {
  function deps(existing: { id: string; role: string } | null) {
    const updates: Array<{ id: string; patch: unknown }> = [];
    const audits: unknown[] = [];
    const fake = {
      repos: {
        users: {
          findById: async (id: string) => (existing && existing.id === id ? existing : null),
          updateById: async (id: string, patch: unknown) => { updates.push({ id, patch }); },
        },
      },
      audit: { log: async (entry: unknown) => { audits.push(entry); } },
    };
    return { updates, audits, deps: fake as unknown as AdminUsersDeps };
  }

  it("updates the role, then busts the user's role-keyed caches", async () => {
    const { updates, deps: d } = deps({ id: ALICE, role: "job_seeker" });
    const changed: string[] = [];
    const res = await assignUserRole(ADMIN, ALICE, "recruiter", d, async (id) => { changed.push(id); });
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(updates, [{ id: ALICE, patch: { role: "recruiter" } }]);
    assert.deepEqual(changed, [ALICE]);
  });

  it("an unknown user changes nothing and busts nothing", async () => {
    const { updates, deps: d } = deps(null);
    const changed: string[] = [];
    const res = await assignUserRole(ADMIN, ALICE, "recruiter", d, async (id) => { changed.push(id); });
    assert.deepEqual(res, { ok: false, code: "NOT_FOUND" });
    assert.deepEqual(updates, []);
    assert.deepEqual(changed, []);
  });
});
