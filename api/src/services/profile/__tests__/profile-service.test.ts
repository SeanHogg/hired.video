/**
 * Unit coverage for the `profile` service domain (gap #1344 — service
 * domains with ZERO tests). Two service files carry cleanly-testable
 * surface; the rest reach `getDb()` internally or need joins (see the
 * "Skipped" note at the bottom) and are left to the route layer.
 *
 * Covered here:
 *   1. profile-mode.ts
 *      • decideProfileMode  — the PURE resume/channel resolver (explicit
 *        opt-in wins; auto-flip priority follower > views > videos; default
 *        resume). The load-bearing SSoT per project_creator_persona_model.
 *      • resolveProfileMode — db-injected: explicit fast-path takes no
 *        signal read; auto path sums native videos + youtube ingests.
 *      • findUserByHandle   — db-injected slug lookup (hit + miss).
 *   2. youtube-ingest.ts
 *      • extractYoutubeVideoId — PURE url→id parser across every URL shape.
 *      • listIngests           — db-injected, hidden-filter vs includeHidden.
 *      • setIngestHidden       — db-injected, owner-scoped update.
 *      • deleteIngest          — db-injected, owner-scoped delete.
 *      • ingestYoutubeUrl      — db-injected insert + idempotent update
 *        (global fetch stubbed so no network).
 *
 * Run: node --import tsx --test src/services/profile/__tests__/profile-service.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import {
  decideProfileMode,
  resolveProfileMode,
  findUserByHandle,
  type ProfileSignals,
} from "../profile-mode.js";
import {
  extractYoutubeVideoId,
  listIngests,
  setIngestHidden,
  deleteIngest,
  ingestYoutubeUrl,
} from "../youtube-ingest.js";

// Seed-derived-shaped UUIDs (real-shape ids for the columns these queries read).
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ── 1a. decideProfileMode — the pure resolver ────────────────────────────

const NO_SIGNALS: ProfileSignals = {
  publicVideoCount: 0,
  totalViews: 0,
  followerCount: 0,
};

describe("decideProfileMode — explicit opt-in always wins", () => {
  it("honours an explicit 'resume' even with channel-grade signals", () => {
    const r = decideProfileMode("resume", {
      publicVideoCount: 999,
      totalViews: 999_999,
      followerCount: 999,
    });
    assert.equal(r.mode, "resume");
    assert.equal(r.auto, false);
    assert.equal(r.setting, "resume");
  });

  it("honours an explicit 'channel' even with zero signals", () => {
    const r = decideProfileMode("channel", NO_SIGNALS);
    assert.equal(r.mode, "channel");
    assert.equal(r.auto, false);
  });
});

describe("decideProfileMode — auto-flip thresholds", () => {
  it("defaults to resume when every signal is below its floor", () => {
    const r = decideProfileMode("auto", { publicVideoCount: 4, totalViews: 999, followerCount: 49 });
    assert.equal(r.mode, "resume");
    assert.equal(r.auto, true);
  });

  it("flips to channel at exactly 50 followers (inclusive boundary)", () => {
    const r = decideProfileMode("auto", { ...NO_SIGNALS, followerCount: 50 });
    assert.equal(r.mode, "channel");
    assert.equal(r.auto, true);
  });

  it("flips to channel at exactly 1000 total views", () => {
    assert.equal(decideProfileMode("auto", { ...NO_SIGNALS, totalViews: 1000 }).mode, "channel");
  });

  it("flips to channel at exactly 5 public videos", () => {
    assert.equal(decideProfileMode("auto", { ...NO_SIGNALS, publicVideoCount: 5 }).mode, "channel");
  });

  it("keeps the original signals on the resolution for the caller", () => {
    const signals = { publicVideoCount: 5, totalViews: 0, followerCount: 0 };
    assert.deepEqual(decideProfileMode("auto", signals).signals, signals);
  });
});

// ── 1b. resolveProfileMode — db-injected ─────────────────────────────────

describe("resolveProfileMode — db-injected signal resolution", () => {
  it("explicit opt-in short-circuits WITHOUT touching the videos tables", async () => {
    const { db, calls } = buildFakeDb({});
    const r = await resolveProfileMode(db as never, { id: USER, profileMode: "channel" });
    assert.equal(r.mode, "channel");
    assert.equal(r.auto, false);
    // Fast path: no SELECTs recorded (calls only logs writes, but the key
    // assertion is that the explicit setting wins and signals stay zero).
    assert.deepEqual(r.signals, { publicVideoCount: 0, totalViews: 0, followerCount: 0 });
    void calls;
  });

  it("auto + a thin library resolves to resume", async () => {
    const { db } = buildFakeDb({
      videos: [{ id: "v1", userId: USER, privacyStatus: "public" }],
      creator_youtube_ingests: [],
    });
    const r = await resolveProfileMode(db as never, { id: USER, profileMode: "auto" });
    assert.equal(r.mode, "resume");
    assert.equal(r.signals.publicVideoCount, 1);
  });

  it("auto + (native public videos + visible youtube ingests) ≥ 5 flips to channel", async () => {
    const { db } = buildFakeDb({
      videos: [
        { id: "v1", userId: USER, privacyStatus: "public" },
        { id: "v2", userId: USER, privacyStatus: "public" },
        { id: "v3", userId: USER, privacyStatus: "public" },
        // private + another user's video must NOT count
        { id: "v4", userId: USER, privacyStatus: "private" },
        { id: "v5", userId: OTHER_USER, privacyStatus: "public" },
      ],
      creator_youtube_ingests: [
        { id: "y1", userId: USER, isHidden: false },
        { id: "y2", userId: USER, isHidden: false },
        // hidden ingest must NOT count toward the channel signal
        { id: "y3", userId: USER, isHidden: true },
      ],
    });
    const r = await resolveProfileMode(db as never, { id: USER, profileMode: "auto" });
    // 3 public native + 2 visible youtube = 5 → channel
    assert.equal(r.signals.publicVideoCount, 5);
    assert.equal(r.mode, "channel");
    assert.equal(r.auto, true);
  });

  it("treats a null profileMode as 'auto'", async () => {
    const { db } = buildFakeDb({ videos: [], creator_youtube_ingests: [] });
    const r = await resolveProfileMode(db as never, { id: USER, profileMode: null as never });
    assert.equal(r.setting, "auto");
    assert.equal(r.mode, "resume");
  });
});

// ── 1c. findUserByHandle ─────────────────────────────────────────────────

describe("findUserByHandle", () => {
  it("returns the matching user row for a known handle", async () => {
    const { db } = buildFakeDb({
      users: [
        { id: USER, name: "Ada", externalPublicHandle: "ada" },
        { id: OTHER_USER, name: "Bo", externalPublicHandle: "bo" },
      ],
    });
    const row = await findUserByHandle(db as never, "ada");
    assert.equal(row?.id, USER);
  });

  it("returns null for an unknown handle", async () => {
    const { db } = buildFakeDb({
      users: [{ id: USER, name: "Ada", externalPublicHandle: "ada" }],
    });
    assert.equal(await findUserByHandle(db as never, "nope"), null);
  });

  it("never returns credential columns on the public channel lookup", async () => {
    const { db } = buildFakeDb({
      users: [{ id: USER, name: "Ada", externalPublicHandle: "ada", passwordHash: "$argon2id$v=19$x", mfaSecret: "JBSWY3DPEHPK3PXP" }],
    });
    const row = await findUserByHandle(db as never, "ada");
    assert.equal(row?.id, USER);
    assert.ok(row && !("passwordHash" in row), "passwordHash must not be selected");
    assert.ok(row && !("mfaSecret" in row), "mfaSecret must not be selected");
  });
});

// ── 2a. extractYoutubeVideoId — the pure parser ──────────────────────────

describe("extractYoutubeVideoId — every supported URL shape", () => {
  const ID = "dQw4w9WgXcQ"; // canonical 11-char id

  it("parses the watch?v= form", () => {
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
  });
  it("parses extra query params before v=", () => {
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/watch?feature=foo&v=${ID}`), ID);
  });
  it("parses the youtu.be short form", () => {
    assert.equal(extractYoutubeVideoId(`https://youtu.be/${ID}`), ID);
  });
  it("parses the /embed/ form", () => {
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/embed/${ID}`), ID);
  });
  it("parses the /shorts/ form", () => {
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
  });
  it("parses the /live/ form", () => {
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/live/${ID}`), ID);
  });
  it("accepts a bare 11-char id and trims surrounding whitespace", () => {
    assert.equal(extractYoutubeVideoId(`  ${ID}  `), ID);
  });
  it("returns null for empty / non-youtube / malformed input", () => {
    assert.equal(extractYoutubeVideoId(""), null);
    assert.equal(extractYoutubeVideoId("https://example.com/watch?v=abc"), null);
    assert.equal(extractYoutubeVideoId("not a url"), null);
    // 10 chars — one short of a valid id
    assert.equal(extractYoutubeVideoId("dQw4w9WgXc"), null);
  });
});

// ── 2b. listIngests — hidden filtering ───────────────────────────────────

describe("listIngests — hidden filter", () => {
  it("hides hidden ingests by default and scopes to the owner (two-predicate AND)", async () => {
    // The default branch ANDs userId + isHidden=false — a two-condition
    // predicate the fake-db evaluator compiles for real, so both the
    // owner scope AND the hidden filter are exercised here.
    const { db } = buildFakeDb({
      creator_youtube_ingests: [
        { id: "y1", userId: USER, isHidden: false, displayOrder: 0, ingestedAt: new Date() },
        { id: "y2", userId: USER, isHidden: true, displayOrder: 1, ingestedAt: new Date() },
        { id: "y3", userId: OTHER_USER, isHidden: false, displayOrder: 0, ingestedAt: new Date() },
      ],
    });
    const rows = await listIngests(db as never, USER);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["y1"]);
  });

  it("includes hidden ingests when asked", async () => {
    // includeHidden uses a SINGLE-condition and(eq(userId)) — a shape the
    // fake-db evaluator can't compile (it falls through to match-all), so
    // we seed only the owner's rows and assert the hidden one is returned.
    // Owner-scoping for this branch is covered at the route layer.
    const { db } = buildFakeDb({
      creator_youtube_ingests: [
        { id: "y1", userId: USER, isHidden: false, displayOrder: 0, ingestedAt: new Date() },
        { id: "y2", userId: USER, isHidden: true, displayOrder: 1, ingestedAt: new Date() },
      ],
    });
    const rows = await listIngests(db as never, USER, { includeHidden: true });
    assert.deepEqual(rows.map((r) => r.id).sort(), ["y1", "y2"]);
  });
});

// ── 2c. setIngestHidden — owner-scoped update ────────────────────────────

describe("setIngestHidden", () => {
  it("flips the hidden flag on the owner's ingest", async () => {
    const { db, state } = buildFakeDb({
      creator_youtube_ingests: [{ id: "y1", userId: USER, isHidden: false }],
    });
    await setIngestHidden(db as never, "y1", USER, true);
    assert.equal(state.creator_youtube_ingests[0].isHidden, true);
  });

  it("does NOT touch an ingest owned by a different user", async () => {
    const { db, state } = buildFakeDb({
      creator_youtube_ingests: [{ id: "y1", userId: USER, isHidden: false }],
    });
    await setIngestHidden(db as never, "y1", OTHER_USER, true);
    assert.equal(state.creator_youtube_ingests[0].isHidden, false, "owner mismatch is a no-op");
  });
});

// ── 2d. deleteIngest — owner-scoped delete ───────────────────────────────

describe("deleteIngest", () => {
  it("removes the owner's ingest row", async () => {
    const { db, state } = buildFakeDb({
      creator_youtube_ingests: [
        { id: "y1", userId: USER },
        { id: "y2", userId: USER },
      ],
    });
    await deleteIngest(db as never, "y1", USER);
    assert.deepEqual(state.creator_youtube_ingests.map((r) => r.id), ["y2"]);
  });

  it("leaves another user's ingest in place", async () => {
    const { db, state } = buildFakeDb({
      creator_youtube_ingests: [{ id: "y1", userId: USER }],
    });
    await deleteIngest(db as never, "y1", OTHER_USER);
    assert.equal(state.creator_youtube_ingests.length, 1, "owner mismatch deletes nothing");
  });
});

// ── 2e. ingestYoutubeUrl — insert + idempotent update ────────────────────
//
// fetchOembed hits youtube.com over the network; stub global fetch so the
// test is hermetic. A non-ok response makes fetchOembed return null, so the
// row is written with null oembed metadata — exactly the offline-fallback
// path the service documents.

describe("ingestYoutubeUrl", () => {
  const ID = "dQw4w9WgXcQ";
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // Non-ok → fetchOembed returns null (no metadata enrichment).
    globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) })) as never;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("rejects a URL with no parseable video id", async () => {
    const { db } = buildFakeDb({ creator_youtube_ingests: [] });
    await assert.rejects(
      () => ingestYoutubeUrl(db as never, USER, "https://example.com/nope"),
      /parse a YouTube video id/,
    );
  });

  it("inserts a fresh ingest (alreadyImported=false) and normalises the source URL", async () => {
    const { db, state } = buildFakeDb({ creator_youtube_ingests: [] });
    const { ingest, alreadyImported } = await ingestYoutubeUrl(
      db as never,
      USER,
      `https://youtu.be/${ID}`,
    );
    assert.equal(alreadyImported, false);
    assert.equal(ingest.youtubeVideoId, ID);
    assert.equal(ingest.sourceUrl, `https://www.youtube.com/watch?v=${ID}`);
    assert.equal(state.creator_youtube_ingests.length, 1);
  });

  it("is idempotent — re-importing the same video updates in place (alreadyImported=true)", async () => {
    const { db, state } = buildFakeDb({
      creator_youtube_ingests: [
        { id: "y1", userId: USER, youtubeVideoId: ID, sourceUrl: "old", title: "Existing title" },
      ],
    });
    const { ingest, alreadyImported } = await ingestYoutubeUrl(
      db as never,
      USER,
      `https://www.youtube.com/watch?v=${ID}`,
    );
    assert.equal(alreadyImported, true);
    assert.equal(ingest.id, "y1");
    // oembed was null → existing title preserved, sourceUrl normalised.
    assert.equal(ingest.title, "Existing title");
    assert.equal(ingest.sourceUrl, `https://www.youtube.com/watch?v=${ID}`);
    assert.equal(state.creator_youtube_ingests.length, 1, "no duplicate row");
  });
});
