/**
 * schedulePosts (#2047): the server refuses a send time in the past or more
 * than 90 days out, a guest session, a lane a destination doesn't have,
 * TikTok without the creator's settings, and a cut of another project; a
 * valid compose becomes one job per destination at the same send time.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/schedule-publish-jobs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../../../db/index.js";
import { schedulePosts, ScheduleError, type ScheduleDeps, type SchedulePostsInput } from "../schedule-publish-jobs.js";

const NOW = new Date("2026-10-11T14:05:00.000Z");
const CREATOR = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const CUT_VIDEO = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";

const TIKTOK = {
  privacyLevel: "PUBLIC_TO_EVERYONE",
  allowComment: true,
  allowDuet: false,
  allowStitch: false,
  discloseContent: false,
  yourBrand: false,
  brandedContent: false,
};

/** The project read answers this row. */
function projectDb(row: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where"]) chain[m] = () => chain;
  chain.limit = async () => (row ? [row] : []);
  return chain as unknown as Db;
}

const RENDERED = { id: PROJECT, userId: CREATOR, companyId: null, videoId: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f" };

function deps(overrides: Partial<ScheduleDeps> = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const d: ScheduleDeps = {
    db: projectDb(RENDERED),
    now: () => NOW,
    assertWrite: async () => {},
    resolveVariant: async (_db, { videoId }) =>
      videoId === CUT_VIDEO
        ? { id: "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d", projectId: PROJECT, variantKey: "9x16-full", contentRevision: "tl_7f3a9c2e81.b1", videoId, r2Key: "k", branded: true }
        : null,
    insert: (async (rows: Array<Record<string, unknown>>) => {
      inserted.push(...rows);
      return rows.map((r, i) => ({ ...r, id: `job-${i}` }));
    }) as unknown as ScheduleDeps["insert"],
    ...overrides,
  };
  return { d, inserted };
}

function input(overrides: Partial<SchedulePostsInput> = {}): SchedulePostsInput {
  return {
    actor: { userId: CREATOR, isGuest: false },
    projectId: PROJECT,
    caption: "  Open to senior product design roles. #design  ",
    scheduledAt: new Date("2026-10-12T16:00:00.000Z"),
    destinations: [
      { destination: "youtube", lane: "self", settings: { youtube: { privacy: "public" } } },
      { destination: "tiktok", lane: "self", variantVideoId: CUT_VIDEO, settings: { tiktok: TIKTOK } },
      { destination: "instagram", lane: "managed" },
      { destination: "feed", lane: "self" },
    ],
    ...overrides,
  };
}

const kind = (k: string) => (e: unknown) => e instanceof ScheduleError && e.kind === k;

describe("schedulePosts — validation", () => {
  it("refuses a send time in the past", async () => {
    const { d } = deps();
    await assert.rejects(schedulePosts(input({ scheduledAt: new Date("2026-10-11T09:00:00.000Z") }), d), kind("IN_PAST"));
  });

  it("refuses a send time more than 90 days ahead", async () => {
    const { d } = deps();
    await assert.rejects(schedulePosts(input({ scheduledAt: new Date("2027-01-15T09:00:00.000Z") }), d), kind("TOO_FAR_AHEAD"));
  });

  it("refuses a guest session", async () => {
    const { d } = deps();
    await assert.rejects(schedulePosts(input({ actor: { userId: CREATOR, isGuest: true } }), d), kind("ACCOUNT_REQUIRED"));
  });

  it("refuses the brand lane on LinkedIn and the brand lane on the feed", async () => {
    const { d } = deps();
    await assert.rejects(schedulePosts(input({ destinations: [{ destination: "linkedin", lane: "managed" }] }), d), kind("INVALID_LANE"));
    await assert.rejects(schedulePosts(input({ destinations: [{ destination: "feed", lane: "managed" }] }), d), kind("INVALID_LANE"));
  });

  it("refuses TikTok without the creator's privacy choice", async () => {
    const { d } = deps();
    await assert.rejects(
      schedulePosts(input({ destinations: [{ destination: "tiktok", lane: "self", settings: { tiktok: { ...TIKTOK, privacyLevel: "" } } }] }), d),
      kind("TIKTOK_SETTINGS_REQUIRED"),
    );
  });

  it("refuses a cut that isn't a cut of this project", async () => {
    const { d } = deps();
    await assert.rejects(
      schedulePosts(input({ destinations: [{ destination: "x", lane: "self", variantVideoId: "11111111-2222-4333-8444-555555555555" }] }), d),
      kind("INVALID_VARIANT"),
    );
  });

  it("refuses an unrendered project", async () => {
    const { d } = deps({ db: projectDb({ ...RENDERED, videoId: null }) });
    await assert.rejects(schedulePosts(input(), d), kind("VIDEO_NOT_READY"));
  });
});

describe("schedulePosts — a valid compose", () => {
  it("creates one job per destination, same send time, trimmed caption, cut by id", async () => {
    const { d, inserted } = deps();
    const result = await schedulePosts(input(), d);
    assert.equal(result.jobs.length, 4);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(
      inserted.map((r) => [r.destination, r.lane]),
      [["youtube", "self"], ["tiktok", "self"], ["instagram", "managed"], ["feed", "self"]],
    );
    for (const r of inserted) {
      assert.equal((r.scheduledAt as Date).toISOString(), "2026-10-12T16:00:00.000Z");
      assert.equal((r.runAt as Date).toISOString(), "2026-10-12T16:00:00.000Z");
      assert.equal(r.caption, "Open to senior product design roles. #design");
      assert.equal(r.createdBy, CREATOR);
    }
    assert.equal(inserted[1].renderVariantId, "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d");
    assert.equal(inserted[0].renderVariantId, null);
    assert.equal(inserted[2].postSettings, null);
  });

  it("reports a destination already queued as skipped (boundary)", async () => {
    const { d } = deps({
      insert: (async (rows: Array<Record<string, unknown>>) =>
        rows.filter((r) => r.destination !== "youtube").map((r, i) => ({ ...r, id: `job-${i}` }))) as unknown as ScheduleDeps["insert"],
    });
    const result = await schedulePosts(input(), d);
    assert.deepEqual(result.skipped, [{ destination: "youtube", lane: "self" }]);
  });
});

describe("schedulePosts — per-destination caption and title (PRD §4.2)", () => {
  it("stores each destination's effective caption and its title override", async () => {
    const { d, inserted } = deps();
    await schedulePosts(
      input({
        caption: "Open to senior product design roles — 60 seconds on how I work. #design",
        destinations: [
          { destination: "youtube", lane: "self", title: "Maya Chen — Senior Product Designer (60s pitch)", settings: { youtube: { privacy: "public" } } },
          { destination: "x", lane: "self", caption: "  60s on how I design. Hiring? DMs open. #design  " },
          { destination: "feed", lane: "self" },
        ],
      }),
      d,
    );
    assert.equal(inserted[0].caption, "Open to senior product design roles — 60 seconds on how I work. #design");
    assert.deepEqual(inserted[0].postSettings, {
      youtube: { privacy: "public" },
      title: "Maya Chen — Senior Product Designer (60s pitch)",
    });
    assert.equal(inserted[1].caption, "60s on how I design. Hiring? DMs open. #design");
    assert.equal(inserted[1].postSettings, null);
    assert.equal(inserted[2].caption, "Open to senior product design roles — 60 seconds on how I work. #design");
  });

  it("refuses a caption over the network's own limit (X: 280), even when it's the shared one", async () => {
    const { d } = deps();
    const long = "I design hiring tools. ".repeat(13); // 299 chars
    await assert.rejects(schedulePosts(input({ caption: long, destinations: [{ destination: "x", lane: "self" }] }), d), kind("CAPTION_TOO_LONG"));
    // The same caption is fine for LinkedIn (3000).
    await assert.doesNotReject(schedulePosts(input({ caption: long, destinations: [{ destination: "linkedin", lane: "self" }] }), d));
  });

  it("a short override rescues a destination the shared caption is too long for (boundary)", async () => {
    const { d } = deps();
    const long = "I design hiring tools. ".repeat(13);
    await assert.doesNotReject(
      schedulePosts(input({ caption: long, destinations: [{ destination: "x", lane: "self", caption: "x".repeat(280) }] }), d),
    );
  });

  it("refuses a title where the network shows none, and one over YouTube's 100", async () => {
    const { d } = deps();
    await assert.rejects(
      schedulePosts(input({ destinations: [{ destination: "x", lane: "self", title: "A title X never shows" }] }), d),
      kind("TITLE_NOT_SUPPORTED"),
    );
    await assert.rejects(
      schedulePosts(input({ destinations: [{ destination: "youtube", lane: "self", title: "t".repeat(101) }] }), d),
      kind("TITLE_TOO_LONG"),
    );
  });
});
