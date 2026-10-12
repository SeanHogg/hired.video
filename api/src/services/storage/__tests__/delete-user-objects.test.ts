import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deleteUserObjects, type DeleteUserObjectsDeps } from "../delete-user-objects.js";

const USER = "6f1c2a9e-3b4d-4e5f-8a7b-0c1d2e3f4a5b";
const OTHER = "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

function recorder() {
  const calls: { deleted: string[][]; forgotten: Array<[string, string[]]> } = { deleted: [], forgotten: [] };
  const deps: DeleteUserObjectsDeps = {
    deleteObjects: async (keys) => { calls.deleted.push([...keys]); },
    forgetRows: async (userId, keys) => { calls.forgotten.push([userId, [...keys]]); },
  };
  return { calls, deps };
}

describe("deleteUserObjects", () => {
  it("deletes the object and forgets its row (replaced avatar)", async () => {
    const { calls, deps } = recorder();
    const key = `uploads/${USER}/avatars/1b2c3d4e-5f60-4718-89ab-cdef01234567.jpg`;
    await deleteUserObjects(USER, [key], deps);
    assert.deepEqual(calls.deleted, [[key]]);
    assert.deepEqual(calls.forgotten, [[USER, [key]]]);
  });

  it("does nothing for an empty or all-null list", async () => {
    const { calls, deps } = recorder();
    await deleteUserObjects(USER, [null, undefined, ""], deps);
    assert.equal(calls.deleted.length, 0);
    assert.equal(calls.forgotten.length, 0);
  });

  it("never touches keys outside the user's own uploads prefix", async () => {
    const { calls, deps } = recorder();
    const mine = `uploads/${USER}/images/a.png`;
    await deleteUserObjects(
      USER,
      [mine, `uploads/${OTHER}/avatars/x.jpg`, `studio/recordings/${USER}/r.webm`, "https://lh3.googleusercontent.com/a/photo"],
      deps,
    );
    assert.deepEqual(calls.deleted, [[mine]]);
    assert.deepEqual(calls.forgotten, [[USER, [mine]]]);
  });

  it("propagates a storage failure without forgetting the row", async () => {
    const { calls, deps } = recorder();
    deps.deleteObjects = async () => { throw new Error("R2 unavailable"); };
    await assert.rejects(deleteUserObjects(USER, [`uploads/${USER}/files/doc.pdf`], deps), /R2 unavailable/);
    assert.equal(calls.forgotten.length, 0);
  });
});
