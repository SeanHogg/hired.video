/**
 * Recording → project link gate (#2391 hardening): a take may only be linked
 * to a studio project the uploader can write to (owner / company member /
 * delegate — `canActFor`, behind the `StudioProjectWriteAccess` port). A
 * refused link runs NO write: no blob stored, no `studio_recordings` row.
 *
 * Fixtures mirror the real upload: `projectId` arrives as a raw multipart
 * form value (string, possibly blank or a non-uuid like the editor's "new").
 *
 * Run: node --import tsx --test src/services/studio/__tests__/recordingProjectAccess.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveUploadSourceProjectId,
  withRecordingProjectAccess,
  type StudioProjectWriteAccess,
} from "../recordingProjectAccess.js";

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const MALLORY = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const COACH = "0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const ALICE_PITCH = "11111111-1111-4111-8111-111111111111";

/** Port fake: Alice owns her pitch; Coach holds a studio grant from Alice. */
function access(): StudioProjectWriteAccess & { calls: number } {
  const writers = new Map<string, Set<string>>([[ALICE_PITCH, new Set([ALICE, COACH])]]);
  return {
    calls: 0,
    async canWrite(actor, projectId) {
      this.calls += 1;
      return writers.get(projectId)?.has(actor) ?? false;
    },
  };
}

/** Stand-in for the route's "store blob + insert row" write. */
function insertSpy() {
  const inserted: Array<{ userId: string; projectId: string | null }> = [];
  return {
    inserted,
    writeAs: (userId: string) => async (projectId: string | null) => {
      inserted.push({ userId, projectId });
      return { id: `rec-${inserted.length}` };
    },
  };
}

describe("withRecordingProjectAccess — linking a take to a project", () => {
  it("rejects a take on someone else's project and inserts nothing", async () => {
    const spy = insertSpy();
    const result = await withRecordingProjectAccess(MALLORY, ALICE_PITCH, spy.writeAs(MALLORY), access());
    assert.deepEqual(result, { ok: false });
    assert.deepEqual(spy.inserted, []);
  });

  it("rejects an unknown project id the same way (no existence leak)", async () => {
    const spy = insertSpy();
    const result = await withRecordingProjectAccess(ALICE, "77777777-7777-4777-8777-777777777777", spy.writeAs(ALICE), access());
    assert.deepEqual(result, { ok: false });
    assert.deepEqual(spy.inserted, []);
  });

  it("links the owner's own take", async () => {
    const spy = insertSpy();
    const result = await withRecordingProjectAccess(ALICE, ALICE_PITCH, spy.writeAs(ALICE), access());
    assert.deepEqual(result, { ok: true, value: { id: "rec-1" } });
    assert.deepEqual(spy.inserted, [{ userId: ALICE, projectId: ALICE_PITCH }]);
  });

  it("links a delegate's take when the port allows it (active studio grant)", async () => {
    const spy = insertSpy();
    const result = await withRecordingProjectAccess(COACH, ALICE_PITCH, spy.writeAs(COACH), access());
    assert.equal(result.ok, true);
    assert.deepEqual(spy.inserted, [{ userId: COACH, projectId: ALICE_PITCH }]);
  });

  it("trims the raw form value before checking", async () => {
    const spy = insertSpy();
    await withRecordingProjectAccess(ALICE, `  ${ALICE_PITCH}\n`, spy.writeAs(ALICE), access());
    assert.deepEqual(spy.inserted, [{ userId: ALICE, projectId: ALICE_PITCH }]);
  });

  it("a blank / absent project id stores a loose recording without an access check", async () => {
    const port = access();
    const spy = insertSpy();
    for (const raw of [null, "", "   ", undefined]) {
      const result = await withRecordingProjectAccess(MALLORY, raw, spy.writeAs(MALLORY), port);
      assert.equal(result.ok, true);
    }
    assert.equal(port.calls, 0);
    assert.deepEqual(spy.inserted.map((r) => r.projectId), [null, null, null, null]);
  });

  it("a non-uuid project id (e.g. the unsaved editor's \"new\") is stored unlinked", async () => {
    const port = access();
    const spy = insertSpy();
    const result = await withRecordingProjectAccess(MALLORY, "new", spy.writeAs(MALLORY), port);
    assert.equal(result.ok, true);
    assert.equal(port.calls, 0);
    assert.deepEqual(spy.inserted, [{ userId: MALLORY, projectId: null }]);
  });

  it("a File / non-string form value is treated as absent", async () => {
    const spy = insertSpy();
    await withRecordingProjectAccess(ALICE, new Blob(["x"]), spy.writeAs(ALICE), access());
    assert.deepEqual(spy.inserted, [{ userId: ALICE, projectId: null }]);
  });
});

describe("resolveUploadSourceProjectId — /api/upload/* source-project hint (#2377)", () => {
  it("drops a hint naming someone else's project (upload still proceeds)", async () => {
    assert.equal(await resolveUploadSourceProjectId(MALLORY, ALICE_PITCH, access()), null);
  });

  it("drops an unknown project id", async () => {
    assert.equal(await resolveUploadSourceProjectId(ALICE, "77777777-7777-4777-8777-777777777777", access()), null);
  });

  it("keeps the owner's own project (trimmed)", async () => {
    assert.equal(await resolveUploadSourceProjectId(ALICE, ` ${ALICE_PITCH}
`, access()), ALICE_PITCH);
  });

  it("keeps a delegate's hint when the port allows it", async () => {
    assert.equal(await resolveUploadSourceProjectId(COACH, ALICE_PITCH, access()), ALICE_PITCH);
  });

  it("a non-uuid hint is null without an access check", async () => {
    const port = access();
    assert.equal(await resolveUploadSourceProjectId(ALICE, "new", port), null);
    assert.equal(port.calls, 0);
  });

  it("a missing / blank / non-string hint is null without an access check", async () => {
    const port = access();
    for (const raw of [null, undefined, "", "   ", new Blob(["x"])]) {
      assert.equal(await resolveUploadSourceProjectId(ALICE, raw, port), null);
    }
    assert.equal(port.calls, 0);
  });
});
