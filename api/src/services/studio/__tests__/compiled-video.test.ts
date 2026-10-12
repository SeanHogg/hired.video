/**
 * compiled-video — the rendered video every publish path posts (replaces the
 * YouTube-only use case's helpers, #2044): ownership + render guard, the
 * CDN byte fetch, and the YouTube link written back to the video row.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/compiled-video.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import {
  fetchCompiledVideoBytes,
  linkYouTubeUpload,
  PublishVideoError,
  requireCompiledVideo,
} from "../compiled-video.js";
import { V4_UUID, SYNTHETIC_V4_UUID } from "../../../../../shared/__tests__/uuid-fixtures.js";

const OWNER = V4_UUID;
const VIDEO_ID = SYNTHETIC_V4_UUID;

function videoRow(over: Record<string, unknown> = {}) {
  return { id: VIDEO_ID, userId: OWNER, r2Key: "videos/8f2c1a9e/compiled.mp4", youtubeVideoId: null, youtubeUrl: null, ...over };
}

describe("requireCompiledVideo", () => {
  it("returns the owner's compiled row", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    const row = await requireCompiledVideo(db as never, { videoId: VIDEO_ID, ownerUserId: OWNER });
    assert.equal(row.id, VIDEO_ID);
  });

  it("is VIDEO_NOT_FOUND for another user's video", async () => {
    const { db } = buildFakeDb({ videos: [videoRow({ userId: "00000000-0000-4000-8000-000000000001" })] });
    await assert.rejects(
      requireCompiledVideo(db as never, { videoId: VIDEO_ID, ownerUserId: OWNER }),
      (e: unknown) => e instanceof PublishVideoError && e.kind === "VIDEO_NOT_FOUND",
    );
  });

  it("is VIDEO_NOT_READY before the render uploads (boundary: no r2Key)", async () => {
    const { db } = buildFakeDb({ videos: [videoRow({ r2Key: null })] });
    await assert.rejects(
      requireCompiledVideo(db as never, { videoId: VIDEO_ID, ownerUserId: OWNER }),
      (e: unknown) => e instanceof PublishVideoError && e.kind === "VIDEO_NOT_READY",
    );
  });
});

describe("fetchCompiledVideoBytes", () => {
  it("reads the MP4 from the CDN", async () => {
    let asked = "";
    const bytes = await fetchCompiledVideoBytes(videoRow() as never, async (url) => {
      asked = url;
      return new Response(new Uint8Array([0, 0, 0, 24]), { status: 200 });
    });
    assert.match(asked, /videos\/8f2c1a9e\/compiled\.mp4$/);
    assert.deepEqual([...bytes], [0, 0, 0, 24]);
  });

  it("is MEDIA_FETCH_FAILED on a CDN miss", async () => {
    await assert.rejects(
      fetchCompiledVideoBytes(videoRow() as never, async () => new Response("", { status: 404 })),
      (e: unknown) => e instanceof PublishVideoError && e.kind === "MEDIA_FETCH_FAILED",
    );
  });
});

describe("linkYouTubeUpload", () => {
  it("writes the YouTube id and watch URL onto the video row", async () => {
    const { db, state } = buildFakeDb({ videos: [videoRow()] });
    await linkYouTubeUpload(db as never, VIDEO_ID, {
      externalId: "Ks-_Mh1QhMc",
      externalUrl: "https://www.youtube.com/watch?v=Ks-_Mh1QhMc",
    });
    assert.equal(state.videos[0]!.youtubeVideoId, "Ks-_Mh1QhMc");
    assert.equal(state.videos[0]!.youtubeUrl, "https://www.youtube.com/watch?v=Ks-_Mh1QhMc");
  });
});
