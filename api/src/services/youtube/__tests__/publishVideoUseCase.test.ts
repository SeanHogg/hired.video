/**
 * publishVideoToYouTube use-case tests — closes part of gap #1344.
 *
 * This is the orchestration layer (#202): load+own video → resolve account →
 * fresh token → fetch MP4 → upload → persist IDs. Every external collaborator
 * is an injected seam (db / fetchMedia / getActiveAccount / getFreshAccessToken
 * / uploadVideo), so the whole flow + its discriminated PublishVideoError
 * mapping is unit-testable with NO network and NO real DB.
 *
 * The `db` seam is the shared fake-db (simple select/update on `videos`).
 *
 * Covers each error branch + the happy path + the persisted-IDs write:
 *   • VIDEO_NOT_FOUND      — no matching (id, userId) row
 *   • VIDEO_NOT_READY      — row exists but r2Key is null (not compiled)
 *   • ACCOUNT_NOT_CONNECTED— no active YouTube account
 *   • AUTH_FAILED          — getFreshAccessToken throws YouTubeAuthError
 *   • MEDIA_FETCH_FAILED   — CDN fetch non-OK
 *   • UPLOAD_FAILED        — uploadVideo throws YouTubeUploadError
 *   • happy path           — returns the result AND writes youtubeVideoId/url
 *
 * Run: node --import tsx --test src/services/youtube/__tests__/publishVideoUseCase.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { publishVideoToYouTube, PublishVideoError } from "../publishVideoUseCase.js";
import { YouTubeAuthError } from "../youtubeOAuth.js";
import { YouTubeUploadError } from "../youtubeUpload.js";
import { V4_UUID, SYNTHETIC_V4_UUID } from "../../../../../shared/__tests__/uuid-fixtures.js";

const USER = V4_UUID;
const VIDEO_ID = SYNTHETIC_V4_UUID;

const INPUT = {
  userId: USER,
  videoId: VIDEO_ID,
  meta: { title: "My Resume Reel", description: "Body", privacy: "public" as const },
  oauthConfig: { clientId: "cid", clientSecret: "secret" },
};

/** A video row owned by USER, compiled (r2Key set). */
function videoRow(over: Record<string, unknown> = {}) {
  return { id: VIDEO_ID, userId: USER, r2Key: "compiled/abc.mp4", ...over };
}

const OK_MEDIA: () => Promise<Response> = async () =>
  ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Response);

/** Base happy-path deps; each test overrides the seam it exercises. */
function deps(db: any, over: Record<string, unknown> = {}) {
  return {
    db,
    fetchMedia: OK_MEDIA,
    getActiveAccount: async () => ({ id: "acct-1", accessToken: "tok" } as any),
    getFreshAccessToken: async () => "fresh-token",
    uploadVideo: async () => ({ youtubeVideoId: "yt-1", youtubeUrl: "https://www.youtube.com/watch?v=yt-1" }),
    ...over,
  } as any;
}

describe("publishVideoToYouTube — guard branches", () => {
  it("throws VIDEO_NOT_FOUND when no matching video row exists", async () => {
    const { db } = buildFakeDb({ videos: [] });
    await assert.rejects(
      () => publishVideoToYouTube(INPUT, deps(db)),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "VIDEO_NOT_FOUND",
    );
  });

  it("throws VIDEO_NOT_READY when the video has no r2Key yet", async () => {
    const { db } = buildFakeDb({ videos: [videoRow({ r2Key: null })] });
    await assert.rejects(
      () => publishVideoToYouTube(INPUT, deps(db)),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "VIDEO_NOT_READY",
    );
  });

  it("throws ACCOUNT_NOT_CONNECTED when the user has no active YouTube account", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    await assert.rejects(
      () => publishVideoToYouTube(INPUT, deps(db, { getActiveAccount: async () => null })),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "ACCOUNT_NOT_CONNECTED",
    );
  });
});

describe("publishVideoToYouTube — failure mapping", () => {
  it("maps a YouTubeAuthError to AUTH_FAILED (and preserves the cause)", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    const authErr = new YouTubeAuthError("REFRESH_TOKEN_MISSING", "no refresh token");
    await assert.rejects(
      () =>
        publishVideoToYouTube(INPUT, deps(db, {
          getFreshAccessToken: async () => {
            throw authErr;
          },
        })),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "AUTH_FAILED" && err.cause === authErr,
    );
  });

  it("rethrows a non-auth error from the token step unchanged", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    const boom = new Error("network down");
    await assert.rejects(
      () =>
        publishVideoToYouTube(INPUT, deps(db, {
          getFreshAccessToken: async () => {
            throw boom;
          },
        })),
      (err: unknown) => err === boom,
    );
  });

  it("maps a non-OK CDN media fetch to MEDIA_FETCH_FAILED", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    await assert.rejects(
      () =>
        publishVideoToYouTube(INPUT, deps(db, {
          fetchMedia: async () => ({ ok: false, status: 404 } as Response),
        })),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "MEDIA_FETCH_FAILED",
    );
  });

  it("maps a YouTubeUploadError to UPLOAD_FAILED", async () => {
    const { db } = buildFakeDb({ videos: [videoRow()] });
    await assert.rejects(
      () =>
        publishVideoToYouTube(INPUT, deps(db, {
          uploadVideo: async () => {
            throw new YouTubeUploadError(403, "quotaExceeded");
          },
        })),
      (err: unknown) => err instanceof PublishVideoError && err.kind === "UPLOAD_FAILED",
    );
  });
});

describe("publishVideoToYouTube — happy path", () => {
  it("returns the upload result and persists youtubeVideoId + youtubeUrl on the video row", async () => {
    const { db, state } = buildFakeDb({ videos: [videoRow()] });
    const result = await publishVideoToYouTube(INPUT, deps(db));
    assert.deepEqual(result, {
      youtubeVideoId: "yt-1",
      youtubeUrl: "https://www.youtube.com/watch?v=yt-1",
    });
    const row = state.videos[0]!;
    assert.equal(row.youtubeVideoId, "yt-1");
    assert.equal(row.youtubeUrl, "https://www.youtube.com/watch?v=yt-1");
  });
});
