/**
 * "Mark as posted" (#2048 manual-upload fallback): a valid link is recorded
 * as a publication under the destination, with the network's post id (so
 * the metrics sync reads it) and the creator as the poster; a bad link,
 * an unknown destination and someone else's project are refused.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/manual-post.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../../../db/index.js";
import { WorkspaceForbiddenError } from "../../studio/workspace.js";
import { ManualPostError, markPostedManually, type ManualPostDeps } from "../manual-post.js";

const MAYA = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

function projectDb(row: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where"]) chain[m] = () => chain;
  chain.limit = async () => (row ? [row] : []);
  return chain as unknown as Db;
}

function deps(overrides: Partial<ManualPostDeps> = {}) {
  const recorded: unknown[] = [];
  const bumps: string[] = [];
  const d: ManualPostDeps = {
    db: projectDb({ userId: MAYA, companyId: null }),
    assertWrite: async () => {},
    record: (async (row: Record<string, unknown>) => {
      recorded.push(row);
      return { id: "7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b", destination: row.destination };
    }) as unknown as ManualPostDeps["record"],
    bumpVersion: (ns) => void bumps.push(ns),
    ...overrides,
  };
  return { d, recorded, bumps };
}

const kind = (k: string) => (e: unknown) => e instanceof ManualPostError && e.kind === k;

describe("markPostedManually", () => {
  it("records a TikTok post with its id, the creator as poster, and refreshes the reach panel", async () => {
    const { d, recorded, bumps } = deps();
    const result = await markPostedManually(
      { actorUserId: MAYA, projectId: PROJECT, destination: "tiktok", url: "https://www.tiktok.com/@mayachen/video/7429184417062718726" },
      d,
    );
    assert.deepEqual(recorded, [
      {
        projectId: PROJECT,
        destination: "tiktok",
        externalId: "7429184417062718726",
        externalUrl: "https://www.tiktok.com/@mayachen/video/7429184417062718726",
        status: "published",
        publishedBy: MAYA,
      },
    ]);
    assert.equal(result.tracksMetrics, true);
    assert.deepEqual(bumps, [`social-metrics:${PROJECT}`]);
  });

  it("records a Tapas episode without an id (no stats from a link)", async () => {
    const { d, recorded } = deps();
    const result = await markPostedManually(
      { actorUserId: MAYA, projectId: PROJECT, destination: "tapas-feed", url: "https://tapas.io/episode/3141592" },
      d,
    );
    assert.equal((recorded[0] as { externalId: unknown }).externalId, null);
    assert.equal(result.tracksMetrics, false);
  });

  it("refuses a link to another site, an unknown destination and a missing project", async () => {
    const { d, recorded } = deps();
    await assert.rejects(
      markPostedManually({ actorUserId: MAYA, projectId: PROJECT, destination: "tiktok", url: "https://example.com/video/1" }, d),
      kind("INVALID_URL"),
    );
    await assert.rejects(
      markPostedManually({ actorUserId: MAYA, projectId: PROJECT, destination: "profile", url: "https://hired.video/v/maya" }, d),
      kind("UNKNOWN_DESTINATION"),
    );
    await assert.rejects(
      markPostedManually(
        { actorUserId: MAYA, projectId: PROJECT, destination: "x", url: "https://x.com/mayachen/status/1844417062718726000" },
        { ...d, db: projectDb(null) },
      ),
      kind("PROJECT_NOT_FOUND"),
    );
    assert.equal(recorded.length, 0);
  });

  it("refuses a project the actor can't write", async () => {
    const { d } = deps({
      assertWrite: async () => {
        throw new WorkspaceForbiddenError();
      },
    });
    await assert.rejects(
      markPostedManually({ actorUserId: MAYA, projectId: PROJECT, destination: "x", url: "https://x.com/mayachen/status/1844417062718726000" }, d),
      kind("FORBIDDEN"),
    );
  });
});
