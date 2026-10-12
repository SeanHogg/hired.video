/**
 * deleteProjectWithMedia — deleting a project also drops its master render's
 * and fitted cuts' `videos` rows and reclaims their R2 objects (#2045):
 * collected BEFORE the cascade, rows deleted in bounded batches, a master
 * shared with another project kept, and an R2 failure never failing the delete.
 *
 * The db stub answers each awaited statement from a queue in statement
 * order and logs the statements (select / delete) and the delete batch sizes.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/delete-project-media.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deleteProjectWithMedia,
  VIDEO_DELETE_BATCH,
  type DeleteProjectMediaDeps,
} from "../delete-project-media.js";

const OWNER = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const MASTER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const CUT_A = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const CUT_B = "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c";
const key = (name: string) => `studio/${OWNER}/${PROJECT}/${name}`;

function dbReturning(...rowSets: unknown[][]) {
  const queue = [...rowSets];
  const log: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "limit"]) chain[m] = () => chain;
  chain.select = () => (log.push("select"), chain);
  chain.delete = () => (log.push("delete"), chain);
  chain.then = (resolve: (v: unknown) => void) => resolve(queue.shift() ?? []);
  return { db: chain as unknown as NonNullable<DeleteProjectMediaDeps["db"]>, log, remaining: () => queue.length };
}

function recorder() {
  const reclaimed: Array<{ r2Key?: string | null }> = [];
  return {
    reclaimed,
    deps: {
      reclaim: (async (rows: ReadonlyArray<{ r2Key?: string | null }>) => (reclaimed.push(...rows), rows.length)) as DeleteProjectMediaDeps["reclaim"],
      onVideosDeleted: () => {},
    },
  };
}

describe("deleteProjectWithMedia", () => {
  it("drops the project, its master and its cuts, and reclaims every R2 object", async () => {
    const { db, log, remaining } = dbReturning(
      [{ id: PROJECT, videoId: MASTER }], // project
      [
        { id: CUT_A, r2Key: key("variants/9x16-full-1760000000000.mp4") },
        { id: CUT_B, r2Key: key("variants/16x9-140-1760000000001.mp4") },
      ], // cuts
      [], // no other project shares the master
      [{ id: MASTER, r2Key: key("1759990000000-studio-video.webm") }], // master
      [], // delete project
      [], // delete videos (one batch)
    );
    const rec = recorder();
    assert.equal(await deleteProjectWithMedia(PROJECT, { db, ...rec.deps }), true);
    assert.deepEqual(log, ["select", "select", "select", "select", "delete", "delete"]);
    assert.equal(remaining(), 0);
    assert.deepEqual(
      rec.reclaimed.map((r) => r.r2Key),
      [key("variants/9x16-full-1760000000000.mp4"), key("variants/16x9-140-1760000000001.mp4"), key("1759990000000-studio-video.webm")],
    );
  });

  it("keeps a master another project still points at, but still drops the cuts (boundary)", async () => {
    const { db, log } = dbReturning(
      [{ id: PROJECT, videoId: MASTER }],
      [{ id: CUT_A, r2Key: key("variants/9x16-full-1760000000000.mp4") }],
      [{ id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }], // shared
      [], // delete project
      [], // delete the cut row
    );
    const rec = recorder();
    await deleteProjectWithMedia(PROJECT, { db, ...rec.deps });
    assert.deepEqual(log, ["select", "select", "select", "delete", "delete"]);
    assert.deepEqual(rec.reclaimed.map((r) => r.r2Key), [key("variants/9x16-full-1760000000000.mp4")]);
  });

  it("deletes video rows in bounded batches", async () => {
    const cuts = Array.from({ length: VIDEO_DELETE_BATCH + 1 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      r2Key: key(`variants/9x16-${i + 1}-1760000000000.mp4`),
    }));
    const { db, log } = dbReturning([{ id: PROJECT, videoId: null }], cuts, [], [], []);
    const rec = recorder();
    await deleteProjectWithMedia(PROJECT, { db, ...rec.deps });
    // project delete + two video batches (100 + 1)
    assert.deepEqual(log, ["select", "select", "delete", "delete", "delete"]);
    assert.equal(rec.reclaimed.length, VIDEO_DELETE_BATCH + 1);
  });

  it("a project with no render deletes cleanly and reclaims nothing", async () => {
    const { db, log } = dbReturning([{ id: PROJECT, videoId: null }], [], []);
    const rec = recorder();
    assert.equal(await deleteProjectWithMedia(PROJECT, { db, ...rec.deps }), true);
    assert.deepEqual(log, ["select", "select", "delete"]);
    assert.deepEqual(rec.reclaimed, []);
  });

  it("returns false for a missing project and deletes nothing (error case)", async () => {
    const { db, log } = dbReturning([]);
    const rec = recorder();
    assert.equal(await deleteProjectWithMedia(PROJECT, { db, ...rec.deps }), false);
    assert.deepEqual(log, ["select"]);
    assert.deepEqual(rec.reclaimed, []);
  });

  it("never fails the delete when R2 reclaim throws (error case)", async () => {
    const { db } = dbReturning(
      [{ id: PROJECT, videoId: MASTER }],
      [],
      [],
      [{ id: MASTER, r2Key: key("1759990000000-studio-video.webm") }],
      [],
      [],
    );
    const ok = await deleteProjectWithMedia(PROJECT, {
      db,
      onVideosDeleted: () => {},
      reclaim: async () => {
        throw new Error("R2 unavailable");
      },
    });
    assert.equal(ok, true);
  });
});
