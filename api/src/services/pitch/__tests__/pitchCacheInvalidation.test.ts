/**
 * Pitch cache invalidation (#2133 / #2391): every pitch write path busts the
 * caches that embed the pitch (the partner job-seeker payload).
 *
 *   • set / clear current pitch → `invalidatePitchCaches(userId)`
 *     (PUT /api/video-pitch/current)
 *   • a take added to / removed from a project → `onPitchTakeChanged`
 *     (POST /api/studio/recording/upload, DELETE /api/studio/recording/:id):
 *     busts the project OWNER's caches only when the project is a current
 *     pitch.
 *
 * The invalidator is injected, so no KV / DB is touched. Fixtures mirror real
 * rows (uuid ids; the recording upload's free-form `projectId` form field).
 *
 * Run: node --import tsx --test src/services/pitch/__tests__/pitchCacheInvalidation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invalidatePitchCaches, onPitchTakeChanged } from "../pitchService.js";
import type {
  CurrentPitchRow,
  IPitchRepository,
  PitchProjectRow,
  ProfilePitchRow,
} from "../../../repositories/pitchRepository.js";

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const BOB = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const P_CURRENT = "11111111-1111-4111-8111-111111111111";
const P_OLD_PITCH = "22222222-2222-4222-8222-222222222222";
const P_BOB_CURRENT = "33333333-3333-4333-8333-333333333333";
const P_UNKNOWN = "77777777-7777-4777-8777-777777777777";

/** Only `findProject` matters here; the rest are inert. */
class ProjectOnlyRepo implements IPitchRepository {
  findProjectCalls = 0;
  constructor(private readonly projects: PitchProjectRow[]) {}
  async findCurrentForUsers(): Promise<CurrentPitchRow[]> { return []; }
  async findCurrentForProfiles(): Promise<ProfilePitchRow[]> { return []; }
  async findProject(projectId: string): Promise<PitchProjectRow | null> {
    this.findProjectCalls += 1;
    return this.projects.find((p) => p.id === projectId) ?? null;
  }
  async hasRecording(): Promise<boolean> { return false; }
  async setCurrent(): Promise<void> {}
  async clearCurrent(): Promise<void> {}
}

function repo(): ProjectOnlyRepo {
  return new ProjectOnlyRepo([
    { id: P_CURRENT, userId: ALICE, companyId: null, purpose: "pitch", isCurrentPitch: true },
    { id: P_OLD_PITCH, userId: ALICE, companyId: null, purpose: "pitch", isCurrentPitch: false },
    { id: P_BOB_CURRENT, userId: BOB, companyId: null, purpose: "pitch", isCurrentPitch: true },
  ]);
}

function recorder() {
  const calls: string[] = [];
  return { calls, invalidate: async (userId: string) => { calls.push(userId); } };
}

describe("invalidatePitchCaches — set / clear current pitch", () => {
  it("busts the user's pitch caches exactly once", async () => {
    const { calls, invalidate } = recorder();
    await invalidatePitchCaches(ALICE, invalidate);
    assert.deepEqual(calls, [ALICE]);
  });

  it("propagates an invalidation failure to the caller", async () => {
    await assert.rejects(
      invalidatePitchCaches(ALICE, async () => { throw new Error("KV down"); }),
      /KV down/,
    );
  });
});

describe("onPitchTakeChanged — a retake on the current pitch", () => {
  it("a new take on the CURRENT pitch project busts the owner's caches", async () => {
    const { calls, invalidate } = recorder();
    assert.equal(await onPitchTakeChanged(P_CURRENT, repo(), invalidate), true);
    assert.deepEqual(calls, [ALICE]);
  });

  it("busts the project OWNER's caches, not the uploader's", async () => {
    // The upload route takes `projectId` from the form; whoever records into
    // Bob's current pitch, it is Bob's payload that changed.
    const { calls, invalidate } = recorder();
    await onPitchTakeChanged(P_BOB_CURRENT, repo(), invalidate);
    assert.deepEqual(calls, [BOB]);
  });

  it("a take on a pitch project that is NOT current changes nothing", async () => {
    const { calls, invalidate } = recorder();
    assert.equal(await onPitchTakeChanged(P_OLD_PITCH, repo(), invalidate), false);
    assert.deepEqual(calls, []);
  });

  it("an unknown project changes nothing", async () => {
    const { calls, invalidate } = recorder();
    assert.equal(await onPitchTakeChanged(P_UNKNOWN, repo(), invalidate), false);
    assert.deepEqual(calls, []);
  });

  it("no project id (a loose recording) skips the lookup", async () => {
    const r = repo();
    const { calls, invalidate } = recorder();
    assert.equal(await onPitchTakeChanged(null, r, invalidate), false);
    assert.equal(await onPitchTakeChanged("", r, invalidate), false);
    assert.equal(await onPitchTakeChanged(undefined, r, invalidate), false);
    assert.equal(r.findProjectCalls, 0);
    assert.deepEqual(calls, []);
  });

  it("a non-uuid project id is ignored without querying the uuid column", async () => {
    const r = repo();
    const { calls, invalidate } = recorder();
    assert.equal(await onPitchTakeChanged("draft-local-123", r, invalidate), false);
    assert.equal(r.findProjectCalls, 0);
    assert.deepEqual(calls, []);
  });
});
