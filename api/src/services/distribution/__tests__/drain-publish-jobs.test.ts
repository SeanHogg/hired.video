/**
 * The scheduled-post drainer (#2047): batch limit, the per-run subrequest
 * budget (a claim only takes destinations whose cost still fits), retry
 * with backoff, permanent failures, idempotency (a job that already
 * produced its post is never re-posted), the atomic claim (two overlapping
 * runs never send the same job), and the claim's SQL (ONE UPDATE … FOR
 * UPDATE SKIP LOCKED, filtered to the affordable kinds).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/drain-publish-jobs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/neon-http";
import { schema, type Db } from "../../../db/index.js";
import { buildClaimDueJobs, type JobResultRef, type PublishJob } from "../../../repositories/socialPublishJobRepository.js";
import {
  drainPublishJobs,
  JOB_KINDS,
  MAX_PUBLISH_ATTEMPTS,
  PUBLISH_JOBS_PER_RUN,
  PublishJobError,
  retryDelayMs,
  STALE_RUNNING_MS,
  type DrainDeps,
} from "../drain-publish-jobs.js";
import { CLAIM_COST, PUBLISH_SUBREQUEST_BUDGET, publishJobCost } from "../subrequest-budget.js";

const NOW = new Date("2026-10-11T14:05:00.000Z");
const CREATOR = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

/** A claimed job row as the claim's RETURNING hands it back (attempts already + 1). */
function job(overrides: Partial<PublishJob> = {}): PublishJob {
  return {
    id: "5d0c3a8e-2f41-4b6a-9e7d-1c2b3a4f5e60",
    projectId: PROJECT,
    createdBy: CREATOR,
    destination: "tiktok",
    lane: "self",
    renderVariantId: null,
    caption: "My 60-second pitch for product design roles #hiring #design",
    postSettings: {
      tiktok: {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        allowDuet: false,
        allowStitch: false,
        discloseContent: false,
        yourBrand: false,
        brandedContent: false,
      },
    },
    scheduledAt: new Date("2026-10-11T14:00:00.000Z"),
    runAt: new Date("2026-10-11T14:00:00.000Z"),
    status: "running",
    attempts: 1,
    lastError: null,
    lockedAt: NOW,
    startedAt: NOW,
    completedAt: null,
    publicationId: null,
    promotionSubmissionId: null,
    feedPostId: null,
    createdAt: new Date("2026-10-10T09:12:44.000Z"),
    updatedAt: NOW,
    source: "user",
    captionSource: null,
    postYourself: false,
    ...overrides,
  };
}

/** Records every outcome the drainer writes. */
function recorder(jobs: PublishJob[], behaviour: Partial<Pick<DrainDeps, "send" | "producedRecord">> = {}) {
  const log = {
    claimArgs: [] as Array<Parameters<DrainDeps["claim"]>[0]>,
    sent: [] as string[],
    done: [] as Array<{ id: string; ref: JobResultRef }>,
    retry: [] as Array<{ id: string; error: string; runAt: Date }>,
    failed: [] as Array<{ id: string; error: string }>,
    settled: [] as string[],
  };
  const deps: DrainDeps = {
    // One due job per claim, in queue order (what LIMIT 1 hands back).
    claim: async (args) => {
      log.claimArgs.push(args);
      return jobs.shift() ?? null;
    },
    producedRecord: behaviour.producedRecord ?? (async () => null),
    send:
      behaviour.send ??
      (async (j) => {
        log.sent.push(j.id);
        return { publicationId: `pub-${j.id}` };
      }),
    markDone: async (id, ref) => void log.done.push({ id, ref }),
    markRetry: async (id, error, runAt) => void log.retry.push({ id, error, runAt }),
    markFailed: async (id, error) => void log.failed.push({ id, error }),
    onSettled: (j) => void log.settled.push(j.id),
  };
  return { deps, log };
}

describe("drainPublishJobs — batch limit", () => {
  it("an empty queue costs one claim, with the 15-minute stale cut-off and any kind", async () => {
    const { deps, log } = recorder([]);
    await drainPublishJobs(deps, NOW);
    assert.equal(log.claimArgs.length, 1);
    assert.equal(log.claimArgs[0].kinds, null);
    assert.equal(PUBLISH_JOBS_PER_RUN, 3);
    assert.equal(log.claimArgs[0].staleBefore.getTime(), NOW.getTime() - STALE_RUNNING_MS);
  });

  it("never sends more than 3 even with more due (boundary)", async () => {
    const five = Array.from({ length: 5 }, (_, i) => job({ id: `job-${i}`, destination: "feed" }));
    const { deps, log } = recorder(five);
    const summary = await drainPublishJobs(deps, NOW);
    assert.deepEqual(log.sent, ["job-0", "job-1", "job-2"]);
    assert.equal(summary.sent, 3);
  });

  it("sends each claimed job once and links what it produced", async () => {
    const { deps, log } = recorder([job({ id: "a" }), job({ id: "b", destination: "feed" })]);
    const summary = await drainPublishJobs(deps, NOW);
    assert.deepEqual(log.done, [
      { id: "a", ref: { publicationId: "pub-a" } },
      { id: "b", ref: { publicationId: "pub-b" } },
    ]);
    assert.deepEqual(log.settled, ["a", "b"]);
    assert.equal(summary.claimed, 2);
    assert.equal(summary.sent, 2);
  });
});

describe("drainPublishJobs — subrequest budget", () => {
  it("every job kind fits an empty run, so none can starve", () => {
    for (const k of JOB_KINDS) assert.ok(CLAIM_COST + publishJobCost(k.destination, k.lane) <= PUBLISH_SUBREQUEST_BUDGET, `${k.destination}/${k.lane}`);
    assert.ok(publishJobCost("instagram", "self") > publishJobCost("youtube", "self"), "Instagram's polls cost more");
  });

  it("after an Instagram post only what still fits is claimed, then the run stops", async () => {
    const queue = [job({ id: "ig", destination: "instagram" }), job({ id: "feed", destination: "feed" }), job({ id: "yt", destination: "youtube" })];
    const { deps, log } = recorder(queue);
    const summary = await drainPublishJobs(deps, NOW);
    // 30 − (claim 1 + Instagram 23) = 6: only a feed post (claim 1 + 4) fits next.
    assert.deepEqual(log.claimArgs[1].kinds, [{ destination: "feed", lane: "self" }]);
    // 6 − 5 = 1: nothing fits, so no third claim; YouTube waits for the next tick.
    assert.equal(log.claimArgs.length, 2);
    assert.deepEqual(log.sent, ["ig", "feed"]);
    assert.equal(summary.budgetLeft, 1);
  });

  it("a run whose budget can't afford one claim claims nothing (error case)", async () => {
    const { deps, log } = recorder([job()]);
    await drainPublishJobs({ ...deps, budget: 3 }, NOW);
    assert.equal(log.claimArgs.length, 0);
  });
});

describe("drainPublishJobs — retry and backoff", () => {
  const flaky = async () => {
    throw new PublishJobError("TikTok upload chunk 1/1 failed (503)", false);
  };

  it("backs off 5, 10, 20 minutes between attempts", () => {
    assert.equal(retryDelayMs(1), 5 * 60 * 1000);
    assert.equal(retryDelayMs(2), 10 * 60 * 1000);
    assert.equal(retryDelayMs(3), 20 * 60 * 1000);
  });

  it("puts a retryable failure back in the queue after the backoff, keeping the error", async () => {
    const { deps, log } = recorder([job({ attempts: 2 })], { send: flaky });
    await drainPublishJobs(deps, NOW);
    assert.equal(log.retry.length, 1);
    assert.equal(log.retry[0].error, "TikTok upload chunk 1/1 failed (503)");
    assert.equal(log.retry[0].runAt.getTime(), NOW.getTime() + 10 * 60 * 1000);
    assert.equal(log.failed.length, 0);
  });

  it("fails the job, error kept, on the last allowed attempt", async () => {
    const { deps, log } = recorder([job({ attempts: MAX_PUBLISH_ATTEMPTS })], { send: flaky });
    await drainPublishJobs(deps, NOW);
    assert.equal(log.retry.length, 0);
    assert.deepEqual(log.failed, [{ id: job().id, error: "TikTok upload chunk 1/1 failed (503)" }]);
  });

  it("fails a permanent error at once (not connected is never retried)", async () => {
    const { deps, log } = recorder([job()], {
      send: async () => {
        throw new PublishJobError("Connect your tiktok account first.", true);
      },
    });
    await drainPublishJobs(deps, NOW);
    assert.equal(log.retry.length, 0);
    assert.equal(log.failed[0].error, "Connect your tiktok account first.");
  });

  it("treats an unexpected throw as retryable", async () => {
    const { deps, log } = recorder([job()], {
      send: async () => {
        throw new Error("fetch failed");
      },
    });
    await drainPublishJobs(deps, NOW);
    assert.equal(log.retry[0].runAt.getTime(), NOW.getTime() + 5 * 60 * 1000);
  });

  it("pushes a retry that would land in quiet hours to 08:00 UTC", async () => {
    const night = new Date("2026-10-11T02:00:00.000Z");
    const { deps, log } = recorder([job({ attempts: 1 })], { send: flaky });
    await drainPublishJobs(deps, night);
    assert.equal(log.retry[0].runAt.toISOString(), "2026-10-11T08:00:00.000Z");
  });
});

describe("drainPublishJobs — idempotency", () => {
  it("a re-claimed job that already produced its publication is marked done, not re-posted", async () => {
    const { deps, log } = recorder([job({ attempts: 2, lastError: "Worker exceeded CPU time limit" })], {
      producedRecord: async () => ({ publicationId: "7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b" }),
    });
    const summary = await drainPublishJobs(deps, NOW);
    assert.deepEqual(log.sent, []);
    assert.deepEqual(log.done, [{ id: job().id, ref: { publicationId: "7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b" } }]);
    assert.equal(summary.alreadySent, 1);
  });

  it("a first attempt never asks (nothing can have been posted yet)", async () => {
    let asked = 0;
    const { deps, log } = recorder([job({ attempts: 1 })], {
      producedRecord: async () => {
        asked++;
        return { publicationId: "x" };
      },
    });
    await drainPublishJobs(deps, NOW);
    assert.equal(asked, 0);
    assert.equal(log.sent.length, 1);
  });

  it("a job past its attempts is failed without sending (error case)", async () => {
    const { deps, log } = recorder([job({ attempts: MAX_PUBLISH_ATTEMPTS + 1, lastError: "TikTok video query failed (500)" })]);
    await drainPublishJobs(deps, NOW);
    assert.deepEqual(log.sent, []);
    assert.deepEqual(log.failed, [{ id: job().id, error: "TikTok video query failed (500)" }]);
  });
});

describe("atomic claim", () => {
  it("two overlapping runs over one queue send every job exactly once", async () => {
    // The claim's SKIP LOCKED semantics: a job handed to one run is gone for the other.
    const queue = Array.from({ length: 5 }, (_, i) => job({ id: `job-${i}`, destination: "feed" }));
    const sent: string[] = [];
    const run = () =>
      drainPublishJobs(
        {
          claim: async () => queue.shift() ?? null,
          producedRecord: async () => null,
          send: async (j) => {
            await Promise.resolve();
            sent.push(j.id);
            return { publicationId: j.id };
          },
          markDone: async () => {},
          markRetry: async () => {},
          markFailed: async () => {},
        },
        NOW,
      );
    await Promise.all([run(), run()]);
    assert.equal(sent.length, 5);
    assert.equal(new Set(sent).size, 5);
  });

  it("is ONE UPDATE over a FOR UPDATE SKIP LOCKED subselect with the batch limit", () => {
    const db = drizzle.mock({ schema }) as unknown as Db;
    const { sql, params } = buildClaimDueJobs(db, {
      limit: 3,
      kinds: null,
      now: NOW,
      staleBefore: new Date(NOW.getTime() - STALE_RUNNING_MS),
    }).toSQL();
    const q = sql.toLowerCase();
    assert.ok(q.startsWith("update \"social_publish_jobs\""), q);
    assert.match(q, /"id" in \(select/);
    assert.match(q, /for update skip locked/);
    assert.match(q, /limit \$\d+/);
    assert.match(q, /returning/);
    assert.ok(params.includes(3), "the batch limit is bound");
    assert.ok(params.includes("scheduled") && params.includes("running"));
  });

  it("filters the claim to the affordable (destination, lane) kinds", () => {
    const db = drizzle.mock({ schema }) as unknown as Db;
    const { sql, params } = buildClaimDueJobs(db, {
      limit: 1,
      now: NOW,
      staleBefore: new Date(NOW.getTime() - STALE_RUNNING_MS),
      kinds: [
        { destination: "feed", lane: "self" },
        { destination: "youtube", lane: "managed" },
      ],
    }).toSQL();
    assert.match(sql.toLowerCase(), /"destination" = \$\d+ and (?:"social_publish_jobs"\.)?"lane" = \$\d+/);
    for (const v of ["feed", "self", "youtube", "managed"]) assert.ok(params.includes(v), v);
  });
});
