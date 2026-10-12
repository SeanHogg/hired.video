/**
 * Sending one scheduled post (#2047): the fitted-cut fallback (a cut the
 * master has moved past, or one that was reclaimed, posts the master), the
 * lane routing, and which failures are permanent.
 *
 * The DB is a scripted stub: each awaited `…limit(1)` read answers the next
 * scripted rows (project row, then the cut row), shaped like production.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/send-publish-job.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../../../db/index.js";
import type { PublishJob } from "../../../repositories/socialPublishJobRepository.js";
import { sendPublishJob, type SendDeps } from "../send-publish-job.js";
import { PublishJobError } from "../drain-publish-jobs.js";
import { PublishProjectVideoError } from "../../social/publish-project-video.js";
import { PromotionError } from "../../promotions/promotionUseCases.js";

const CREATOR = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const MASTER_VIDEO = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const CUT_VIDEO = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const CUT_ID = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const MASTER_HASH = "tl_7f3a9c2e81";

const PROJECT_ROW = {
  id: PROJECT,
  userId: CREATOR,
  slug: "maya-chen-product-designer",
  isPublic: true,
  videoId: MASTER_VIDEO,
  masterHash: MASTER_HASH,
  title: "Maya Chen — Product Designer",
};

/** A chainable query stub: every builder call returns the chain; awaiting
 *  `.limit()` (or the chain) answers the next scripted rows. */
function scriptedDb(...answers: unknown[][]) {
  const reads: number[] = [];
  let n = 0;
  const chain: Record<string, unknown> = {};
  const next = () => {
    reads.push(n);
    return Promise.resolve(answers[n++] ?? []);
  };
  for (const m of ["select", "from", "leftJoin", "innerJoin", "where", "orderBy"]) chain[m] = () => chain;
  chain.limit = () => next();
  return { db: chain as unknown as Db, reads };
}

function job(overrides: Partial<PublishJob> = {}): PublishJob {
  return {
    id: "5d0c3a8e-2f41-4b6a-9e7d-1c2b3a4f5e60",
    projectId: PROJECT,
    createdBy: CREATOR,
    destination: "instagram",
    lane: "self",
    renderVariantId: null,
    caption: "Open to senior product design roles — 60 seconds on how I work. #design",
    captionSource: null,
    postSettings: null,
    scheduledAt: new Date("2026-10-11T14:00:00.000Z"),
    runAt: new Date("2026-10-11T14:00:00.000Z"),
    status: "running",
    attempts: 1,
    lastError: null,
    lockedAt: new Date("2026-10-11T14:05:00.000Z"),
    startedAt: new Date("2026-10-11T14:05:00.000Z"),
    completedAt: null,
    source: "user",
    publicationId: null,
    promotionSubmissionId: null,
    feedPostId: null,
    createdAt: new Date("2026-10-10T09:12:44.000Z"),
    updatedAt: new Date("2026-10-11T14:05:00.000Z"),
    ...overrides,
  };
}

/** Captures the Lane-B call. */
function selfPublisher() {
  const calls: Array<{ platform: string; variantVideoId?: string; title: string; caption: string }> = [];
  const publishSelf = (async (input: { platform: string; variantVideoId?: string; title: string; caption: string }) => {
    calls.push({ platform: input.platform, variantVideoId: input.variantVideoId, title: input.title, caption: input.caption });
    return { id: "7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b" };
  }) as unknown as SendDeps["publishSelf"];
  return { calls, publishSelf };
}

const cutRow = (contentRevision: string) => ({
  id: CUT_ID,
  projectId: PROJECT,
  variantKey: "9x16-full",
  contentRevision,
  videoId: CUT_VIDEO,
  r2Key: `studio/${CREATOR}/${PROJECT}/variants/9x16-full-1760190300000.mp4`,
  branded: true,
});

describe("sendPublishJob — fitted cut fallback (#2045)", () => {
  it("posts the scheduled cut while it still shows what the master shows", async () => {
    const { db } = scriptedDb([PROJECT_ROW], [cutRow(`${MASTER_HASH}.b1`)]);
    const self = selfPublisher();
    const ref = await sendPublishJob(job({ renderVariantId: CUT_ID }), undefined, { db, publishSelf: self.publishSelf });
    assert.equal(self.calls[0].variantVideoId, CUT_VIDEO);
    assert.deepEqual(ref, { publicationId: "7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b" });
  });

  it("falls back to the master when the master was re-rendered since scheduling", async () => {
    const { db } = scriptedDb([PROJECT_ROW], [cutRow("tl_0000aaaa11.b1")]);
    const self = selfPublisher();
    await sendPublishJob(job({ renderVariantId: CUT_ID }), undefined, { db, publishSelf: self.publishSelf });
    assert.equal(self.calls[0].variantVideoId, undefined);
  });

  it("falls back to the master when the cut was reclaimed (row gone)", async () => {
    const { db } = scriptedDb([PROJECT_ROW], []);
    const self = selfPublisher();
    await sendPublishJob(job({ renderVariantId: CUT_ID }), undefined, { db, publishSelf: self.publishSelf });
    assert.equal(self.calls[0].variantVideoId, undefined);
  });

  it("a job with no cut posts the master without looking one up", async () => {
    const { db, reads } = scriptedDb([PROJECT_ROW]);
    const self = selfPublisher();
    await sendPublishJob(job(), undefined, { db, publishSelf: self.publishSelf });
    assert.equal(reads.length, 1);
    assert.equal(self.calls[0].variantVideoId, undefined);
    assert.equal(self.calls[0].title, "Maya Chen — Product Designer");
    assert.equal(self.calls[0].caption, job().caption);
  });
});

describe("sendPublishJob — failures", () => {
  it("a deleted project is a permanent failure", async () => {
    const { db } = scriptedDb([]);
    await assert.rejects(
      sendPublishJob(job(), undefined, { db }),
      (e: unknown) => e instanceof PublishJobError && e.permanent,
    );
  });

  it("not connected is permanent; a platform error is retryable", async () => {
    for (const [kind, permanent] of [
      ["NOT_CONNECTED", true],
      ["CHANNEL_LIMIT", true],
      ["PUBLISH_FAILED", false],
    ] as const) {
      const { db } = scriptedDb([PROJECT_ROW]);
      const publishSelf = (async () => {
        throw new PublishProjectVideoError(kind, `${kind} from the gate`);
      }) as unknown as SendDeps["publishSelf"];
      await assert.rejects(
        sendPublishJob(job(), undefined, { db, publishSelf }),
        (e: unknown) => e instanceof PublishJobError && e.permanent === permanent,
        kind,
      );
    }
  });
});

describe("sendPublishJob — Lane A (managed)", () => {
  it("submits to the promotion queue with the job's caption as the description", async () => {
    const { db } = scriptedDb([PROJECT_ROW]);
    const seen: Array<{ platform: string; description: string }> = [];
    const submitManaged = (async (args: { platform: string; description: string }) => {
      seen.push({ platform: args.platform, description: args.description });
      return { id: "c0ffee00-1234-4abc-8def-0123456789ab" };
    }) as unknown as SendDeps["submitManaged"];
    const ref = await sendPublishJob(job({ lane: "managed", destination: "youtube" }), undefined, { db, submitManaged });
    assert.deepEqual(seen, [{ platform: "youtube", description: job().caption }]);
    assert.deepEqual(ref, { promotionSubmissionId: "c0ffee00-1234-4abc-8def-0123456789ab" });
  });

  it("an already-pending submission is this post (idempotent), not a failure", async () => {
    const { db } = scriptedDb([PROJECT_ROW], [{ id: "c0ffee00-1234-4abc-8def-0123456789ab" }]);
    const submitManaged = (async () => {
      throw new PromotionError("ALREADY_SUBMITTED", "This project is already waiting for review.");
    }) as unknown as SendDeps["submitManaged"];
    const ref = await sendPublishJob(job({ lane: "managed", destination: "tiktok" }), undefined, { db, submitManaged });
    assert.deepEqual(ref, { promotionSubmissionId: "c0ffee00-1234-4abc-8def-0123456789ab" });
  });

  it("a brand lane that isn't live is permanent", async () => {
    const { db } = scriptedDb([PROJECT_ROW]);
    const submitManaged = (async () => {
      throw new PromotionError("LANE_NOT_READY", "Promotion on this platform isn't available yet.");
    }) as unknown as SendDeps["submitManaged"];
    await assert.rejects(
      sendPublishJob(job({ lane: "managed", destination: "x" }), undefined, { db, submitManaged }),
      (e: unknown) => e instanceof PublishJobError && e.permanent,
    );
  });
});

describe("sendPublishJob — per-destination title (PRD §4.2)", () => {
  it("posts the destination's own title when the job carries one", async () => {
    const { db } = scriptedDb([PROJECT_ROW]);
    const self = selfPublisher();
    await sendPublishJob(
      job({ destination: "youtube", postSettings: { youtube: { privacy: "public" }, title: "Maya Chen — Senior Product Designer (60s pitch)" } }),
      undefined,
      { db, publishSelf: self.publishSelf },
    );
    assert.equal(self.calls[0].title, "Maya Chen — Senior Product Designer (60s pitch)");
  });

  it("falls back to the video's title without one", async () => {
    const { db } = scriptedDb([PROJECT_ROW]);
    const self = selfPublisher();
    await sendPublishJob(job({ destination: "youtube", postSettings: { youtube: { privacy: "public" } } }), undefined, { db, publishSelf: self.publishSelf });
    assert.equal(self.calls[0].title, "Maya Chen — Product Designer");
  });
});
