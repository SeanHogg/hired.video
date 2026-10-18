/**
 * YouTube publisher adapter (#2044) — the Data API v3 multipart upload behind
 * the same `SocialVideoPublisher` port as every other network, driven by a
 * fake `fetch` answering with responses shaped like YouTube's documented
 * `videos.insert` / `videos.list` payloads and error envelopes. Plus the
 * registry contract every adapter must meet.
 *
 * Run: node --import tsx --test src/services/social/__tests__/publishers-youtube.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createYouTubeMetricsReader, createYouTubePublisher, youtubeTitle } from "../publishers/youtube.js";
import { SOCIAL_VIDEO_PUBLISHERS, SOCIAL_VIEW_READERS } from "../publishers/index.js";
import { SocialPublishError, viewsOf } from "../publishers/types.js";
import { VIDEO_PUBLISH_PLATFORMS } from "../../../../../shared/social-platforms.js";

// ── Recorded responses (shape of videos.insert / videos.list / error envelopes) ──

const INSERT_OK = {
  kind: "youtube#video",
  etag: "Xr0qAvt2s4cO1nSHN0Uu0cX8m3Q",
  id: "Ks-_Mh1QhMc",
  snippet: {
    publishedAt: "2026-10-10T18:22:04Z",
    channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    title: "Dana Okafor — video resume",
    description: "Product designer, 10 years in fintech.",
    categoryId: "22",
  },
  status: { uploadStatus: "uploaded", privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
};

const ERROR_401 = {
  error: {
    code: 401,
    message: "Request had invalid authentication credentials. Expected OAuth 2 access token.",
    errors: [{ message: "Invalid Credentials", domain: "global", reason: "authError", location: "Authorization" }],
    status: "UNAUTHENTICATED",
  },
};

const ERROR_403_QUOTA = {
  error: {
    code: 403,
    message: "The request cannot be completed because you have exceeded your quota.",
    errors: [{ message: "The request cannot be completed because you have exceeded your quota.", domain: "youtube.quota", reason: "quotaExceeded" }],
  },
};

const ERROR_403_FORBIDDEN = {
  error: {
    code: 403,
    message: "Request had insufficient authentication scopes.",
    errors: [{ message: "Insufficient Permission", domain: "global", reason: "insufficientPermissions" }],
    status: "PERMISSION_DENIED",
  },
};

const STATS_OK = {
  kind: "youtube#videoListResponse",
  items: [
    { kind: "youtube#video", id: "Ks-_Mh1QhMc", statistics: { viewCount: "1234", likeCount: "56", commentCount: "7" } },
    { kind: "youtube#video", id: "a1b2c3d4e5F", statistics: { viewCount: "0" } },
  ],
  pageInfo: { totalResults: 2, resultsPerPage: 2 },
};

interface Call {
  url: string;
  init?: RequestInit;
}

function scriptedFetch(steps: Array<{ match: string; status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const step = steps[i++];
    assert.ok(step, `unexpected request #${i}: ${url}`);
    assert.ok(url.includes(step.match), `request #${i} expected ${step.match}, got ${url}`);
    return new Response(step.body === undefined ? "" : JSON.stringify(step.body), { status: step.status ?? 200 });
  };
  return { fetch, calls };
}

const VIDEO = { url: "https://cdn.hired.video/v/abc.mp4", bytes: async () => new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) };
const REQ = {
  accessToken: "ya29.a0AfH6SM",
  video: VIDEO,
  caption: "Product designer, 10 years in fintech.",
  title: "Dana Okafor — video resume",
};

function decodeBody(call: Call): string {
  return new TextDecoder().decode(call.init?.body as Uint8Array);
}

describe("YouTube publisher", () => {
  it("uploads the MP4 bytes in one multipart request and links the watch page", async () => {
    const { fetch, calls } = scriptedFetch([{ match: "upload/youtube/v3/videos?uploadType=multipart", body: INSERT_OK }]);
    const result = await createYouTubePublisher({ fetch }).publish({ ...REQ, youtube: { privacy: "public", tags: ["hiring"] } });
    assert.deepEqual(result, { externalId: "Ks-_Mh1QhMc", externalUrl: "https://www.youtube.com/watch?v=Ks-_Mh1QhMc" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer ya29.a0AfH6SM");
    assert.match(headers["Content-Type"], /^multipart\/related; boundary=/);
    const body = decodeBody(calls[0]);
    assert.match(body, /"privacyStatus":"public"/);
    assert.match(body, /"tags":\["hiring"\]/);
    assert.match(body, /"description":"Product designer, 10 years in fintech\."/);
    assert.match(body, /Content-Type: video\/mp4/);
  });

  it("defaults to unlisted when no YouTube settings are sent", async () => {
    const { fetch, calls } = scriptedFetch([{ match: "upload/youtube", body: INSERT_OK }]);
    await createYouTubePublisher({ fetch }).publish(REQ);
    assert.match(decodeBody(calls[0]), /"privacyStatus":"unlisted"/);
  });

  it("tags a Short with #Shorts in the title", async () => {
    const { fetch, calls } = scriptedFetch([{ match: "upload/youtube", body: INSERT_OK }]);
    await createYouTubePublisher({ fetch }).publish({ ...REQ, youtube: { privacy: "public", shorts: true } });
    assert.match(decodeBody(calls[0]), /"title":"Dana Okafor — video resume #Shorts"/);
  });

  it("maps a rejected token (401) to NOT_AUTHORIZED", async () => {
    const { fetch } = scriptedFetch([{ match: "upload/youtube", status: 401, body: ERROR_401 }]);
    await assert.rejects(
      createYouTubePublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED",
    );
  });

  it("maps a missing-scope 403 to NOT_AUTHORIZED (reconnect fixes it)", async () => {
    const { fetch } = scriptedFetch([{ match: "upload/youtube", status: 403, body: ERROR_403_FORBIDDEN }]);
    await assert.rejects(
      createYouTubePublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED",
    );
  });

  it("maps a quota 403 to PLATFORM_ERROR — reconnecting would not help", async () => {
    const { fetch } = scriptedFetch([{ match: "upload/youtube", status: 403, body: ERROR_403_QUOTA }]);
    await assert.rejects(
      createYouTubePublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "PLATFORM_ERROR" && /quotaExceeded/.test(e.message),
    );
  });

  it("treats a 200 without a video id as a platform error", async () => {
    const { fetch } = scriptedFetch([{ match: "upload/youtube", body: { kind: "youtube#video" } }]);
    await assert.rejects(
      createYouTubePublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "PLATFORM_ERROR",
    );
  });
});

describe("youtubeTitle", () => {
  it("leaves a long-form title alone (clipped to 100)", () => {
    assert.equal(youtubeTitle("  My reel  ", false), "My reel");
    assert.equal(youtubeTitle("x".repeat(140), false).length, 100);
  });
  it("adds #Shorts once and keeps the whole title within 100 chars (boundary)", () => {
    const t = youtubeTitle("y".repeat(140), true);
    assert.equal(t.length, 100);
    assert.ok(t.endsWith(" #Shorts"));
    assert.equal(youtubeTitle("Already a #shorts clip", true), "Already a #shorts clip");
  });
});

describe("YouTube view reader", () => {
  it("reads lifetime views, 50 ids per call", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => (i === 0 ? "Ks-_Mh1QhMc" : `id${i}`));
    const { fetch, calls } = scriptedFetch([
      { match: "youtube/v3/videos?part=statistics", body: STATS_OK },
      { match: "youtube/v3/videos?part=statistics", body: { items: [] } },
    ]);
    const views = await viewsOf(createYouTubeMetricsReader({ fetch }))("tok", ids);
    assert.equal(calls.length, 2);
    assert.equal(views.get("Ks-_Mh1QhMc"), 1234);
    assert.equal(views.get("a1b2c3d4e5F"), 0);
    assert.equal(views.has("id50"), false, "unanswered ids stay unknown, not zero");
  });
});

describe("publisher registry contract", () => {
  it("registers one adapter and one view reader per video platform, YouTube included", () => {
    for (const platform of VIDEO_PUBLISH_PLATFORMS) {
      assert.equal(SOCIAL_VIDEO_PUBLISHERS[platform]?.platform, platform, `${platform} adapter`);
      assert.equal(typeof SOCIAL_VIEW_READERS[platform], "function", `${platform} view reader`);
    }
    assert.deepEqual(Object.keys(SOCIAL_VIDEO_PUBLISHERS).sort(), [...VIDEO_PUBLISH_PLATFORMS].sort());
  });
});
