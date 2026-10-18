/**
 * Off-platform reach (#2048):
 *   - the sync groups posts by (owner, network): ONE token + ONE batched
 *     stats call per group, one upsert, and the project's metrics cache
 *     version bumped once;
 *   - the read is cached under social-metrics:{projectId}:{version} — a
 *     second view is served from cache, and a sync's version bump makes the
 *     next view read fresh counts (never a per-view KV write);
 *   - totals sum only the counts a network reported (null stays null).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/post-metrics.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../../../db/index.js";
import { __resetEdgeCacheForTests } from "../../../utils/edge-cache.js";
import { __resetIsolateCacheForTests } from "../../../utils/isolate-cache.js";
import type { PublicationMetricsRow, SyncablePublication } from "../../../repositories/externalPostMetricsRepository.js";
import type { PostMetrics, SocialMetricsReader } from "../../social/publishers/index.js";
import { metricsVersionNamespace, syncPublicationMetrics } from "../metrics/sync-post-metrics.js";
import { projectOffPlatformReach, toReach } from "../metrics/read-post-metrics.js";

const MAYA = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const OMAR = "2d3e4f50-6a7b-4c8d-9e0f-a1b2c3d4e5f6";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const OTHER_PROJECT = "4f50a6b7-c8d9-4e0f-8a1b-2c3d4e5f6a7b";
const NOW = new Date("2026-10-11T14:30:00.000Z");

const pubs: SyncablePublication[] = [
  { id: "p-yt-1", projectId: PROJECT, posterUserId: MAYA, destination: "youtube", externalId: "Ks-_Mh1QhMc" },
  { id: "p-yt-2", projectId: OTHER_PROJECT, posterUserId: MAYA, destination: "youtube", externalId: "a1b2c3d4e5F" },
  { id: "p-tt-1", projectId: PROJECT, posterUserId: MAYA, destination: "tiktok", externalId: "7429184417062718726" },
  { id: "p-x-1", projectId: PROJECT, posterUserId: OMAR, destination: "x", externalId: "1844417062718726000" },
];

/** A fake KV namespace (string values, like Workers KV). */
function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: async (key: string, type?: string) => {
        const v = store.get(key);
        if (v === undefined) return null;
        return type === "json" ? JSON.parse(v) : v;
      },
      // Writes land synchronously (the async body runs on call), so the
      // edge cache's fire-and-forget puts are visible without any flushing.
      put: async (key: string, value: string) => void store.set(key, value),
      delete: async (key: string) => void store.delete(key),
    },
  };
}

let kv: ReturnType<typeof fakeKv>;
beforeEach(() => {
  __resetEdgeCacheForTests();
  __resetIsolateCacheForTests();
  kv = fakeKv();
  (globalThis as { __ENV?: Record<string, unknown> }).__ENV = { KV_CACHE: kv.kv };
});
afterEach(() => {
  delete (globalThis as { __ENV?: unknown }).__ENV;
  __resetEdgeCacheForTests();
  __resetIsolateCacheForTests();
});

function readerReturning(counts: Record<string, PostMetrics>, calls: string[][]): SocialMetricsReader {
  return async (_token, ids) => {
    calls.push(ids);
    return new Map(ids.filter((id) => counts[id]).map((id) => [id, counts[id]]));
  };
}

describe("syncPublicationMetrics", () => {
  it("one token + one batched read per (owner, network), one upsert, one bump per project", async () => {
    const ytCalls: string[][] = [];
    const tokens: string[] = [];
    const upserts: Array<Array<{ publicationId: string }>> = [];
    const bumps: string[] = [];
    const counts = {
      "Ks-_Mh1QhMc": { views: 1234, likes: 56, comments: 7, shares: null },
      a1b2c3d4e5F: { views: 0, likes: null, comments: null, shares: null },
    };
    const summary = await syncPublicationMetrics(pubs, undefined, {
      budget: 50,
      now: () => NOW,
      selfAccessToken: async (user, platform) => {
        tokens.push(`${user}:${platform}`);
        return platform === "x" ? null : "tok";
      },
      readers: {
        youtube: readerReturning(counts, ytCalls),
        tiktok: readerReturning({ "7429184417062718726": { views: 980, likes: 41, comments: 3, shares: 2 } }, []),
        x: async () => {
          throw new Error("should not be read without a token");
        },
      } as never,
      upsert: async (rows) => void upserts.push(rows.map((r) => ({ publicationId: r.publicationId }))),
      bumpVersion: (ns) => void bumps.push(ns),
    });
    assert.deepEqual(tokens.sort(), [`${MAYA}:tiktok`, `${MAYA}:youtube`, `${OMAR}:x`].sort());
    assert.deepEqual(ytCalls, [["Ks-_Mh1QhMc", "a1b2c3d4e5F"]], "both of Maya's YouTube posts in ONE call");
    assert.equal(upserts.length, 1);
    assert.deepEqual(upserts[0].map((r) => r.publicationId).sort(), ["p-tt-1", "p-yt-1", "p-yt-2"]);
    assert.deepEqual(bumps.sort(), [metricsVersionNamespace(OTHER_PROJECT), metricsVersionNamespace(PROJECT)].sort());
    assert.deepEqual(summary, { posts: 4, stored: 3, groupsFailed: 0, deferred: 0 });
  });

  it("reads each post with the account that posted it — a delegate's post uses the delegate's token", async () => {
    const asked: string[] = [];
    // Omar (a delegate) posted Maya's company video to X; Maya owns the project.
    const delegatePost: SyncablePublication = { id: "p-x-2", projectId: PROJECT, posterUserId: OMAR, destination: "x", externalId: "1844417062718726001" };
    const summary = await syncPublicationMetrics([delegatePost], undefined, {
      now: () => NOW,
      selfAccessToken: async (user, platform) => {
        asked.push(`${user}:${platform}`);
        return user === OMAR ? "omar-x-token" : null;
      },
      readers: { x: readerReturning({ "1844417062718726001": { views: 4120, likes: 88, comments: 9, shares: 14 } }, []) } as never,
      upsert: async () => {},
      bumpVersion: () => {},
    });
    assert.deepEqual(asked, [`${OMAR}:x`]);
    assert.equal(summary.stored, 1, "not left unknown because a delegate posted it");
  });

  it("stops at the subrequest budget and leaves the rest due for the next run (boundary)", async () => {
    const reads: string[] = [];
    // Budget 8 less the run's fixed 2 leaves 6: Maya's YouTube group (token 2
    // + 1 call) = 3, her TikTok group = 3, then Omar's X group (3) doesn't fit.
    const summary = await syncPublicationMetrics(pubs, undefined, {
      budget: 8,
      now: () => NOW,
      selfAccessToken: async () => "tok",
      readers: {
        youtube: readerReturning({ "Ks-_Mh1QhMc": { views: 1, likes: null, comments: null, shares: null } }, []),
        tiktok: readerReturning({ "7429184417062718726": { views: 2, likes: null, comments: null, shares: null } }, []),
        x: async () => {
          reads.push("x");
          return new Map();
        },
      } as never,
      upsert: async () => {},
      bumpVersion: () => {},
    });
    assert.deepEqual(reads, []);
    assert.equal(summary.deferred, 1);
    assert.equal(summary.stored, 2);
  });

  it("a failing network read is counted and the rest still store (error case)", async () => {
    const upserts: string[][] = [];
    const summary = await syncPublicationMetrics(pubs.slice(0, 3), undefined, {
      now: () => NOW,
      selfAccessToken: async () => "tok",
      readers: {
        youtube: async () => {
          throw new Error("YouTube stats failed (403): quotaExceeded");
        },
        tiktok: readerReturning({ "7429184417062718726": { views: 980, likes: 41, comments: 3, shares: 2 } }, []),
      } as never,
      upsert: async (rows) => void upserts.push(rows.map((r) => r.publicationId)),
      bumpVersion: () => {},
    });
    assert.equal(summary.groupsFailed, 1);
    assert.deepEqual(upserts, [["p-tt-1"]]);
  });
});

describe("projectOffPlatformReach — versioned cache", () => {
  const db = (() => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "from", "where"]) chain[m] = () => chain;
    chain.limit = async () => [{ userId: MAYA, companyId: null }];
    return chain as unknown as Db;
  })();

  const snapshot = (views: number): PublicationMetricsRow[] => [
    {
      publicationId: "p-yt-1",
      destination: "youtube",
      externalUrl: "https://www.youtube.com/watch?v=Ks-_Mh1QhMc",
      views,
      likes: 56,
      shares: null,
      comments: 7,
      fetchedAt: NOW,
    },
  ];

  it("serves a second view from cache and reads fresh counts after a sync bumps the version", async () => {
    let loads = 0;
    let views = 1234;
    const deps = {
      db,
      assertWrite: async () => {},
      load: async () => {
        loads++;
        return snapshot(views);
      },
    };
    const first = await projectOffPlatformReach(MAYA, PROJECT, deps);
    const second = await projectOffPlatformReach(MAYA, PROJECT, deps);
    assert.equal(loads, 1);
    assert.equal(second.totals.views, 1234);
    assert.deepEqual(first, second);
    assert.ok(![...kv.store.keys()].some((k) => k.startsWith("social-metrics:")), "the payload never lands in KV");

    // A sync stores new counts for the project → bumps its version.
    views = 1502;
    await syncPublicationMetrics([pubs[0]], undefined, {
      now: () => NOW,
      selfAccessToken: async () => "tok",
      readers: { youtube: readerReturning({ "Ks-_Mh1QhMc": { views, likes: 60, comments: 7, shares: null } }, []) } as never,
      upsert: async () => {},
    });
    const versionKey = `cachever:${metricsVersionNamespace(PROJECT)}`;
    assert.ok(kv.store.has(versionKey), "the sync bumped the version token");

    const third = await projectOffPlatformReach(MAYA, PROJECT, deps);
    assert.equal(loads, 2);
    assert.equal(third.totals.views, 1502);
    assert.ok(![...kv.store.keys()].some((k) => k.startsWith("social-metrics:")));
  });
});

describe("toReach", () => {
  it("sums reported counts and keeps an unreported count null", () => {
    const reach = toReach([
      { publicationId: "a", destination: "youtube", externalUrl: null, views: 1234, likes: 56, shares: null, comments: 7, fetchedAt: NOW },
      { publicationId: "b", destination: "instagram", externalUrl: null, views: 310, likes: null, shares: null, comments: null, fetchedAt: NOW },
      { publicationId: "c", destination: "x", externalUrl: null, views: null, likes: null, shares: null, comments: null, fetchedAt: null },
    ]);
    assert.deepEqual(reach.totals, { views: 1544, likes: 56, shares: null, comments: 7 });
    assert.equal(reach.posts[2].fetchedAt, null);
  });
});
