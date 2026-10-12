/**
 * Social video publisher adapters — driven by a scripted fake `fetch` so the
 * request sequence, payloads and error mapping are pinned without a network.
 *
 * Run: node --import tsx --test src/services/social/__tests__/publishers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTikTokPublisher, createTikTokViewReader, tiktokChunkPlan } from "../publishers/tiktok.js";
import { createInstagramPublisher, createInstagramViewReader } from "../publishers/instagram.js";
import { createFacebookPublisher, createFacebookViewReader } from "../publishers/facebook.js";
import { createXPublisher, createXViewReader } from "../publishers/x.js";
import { SocialPublishError } from "../publishers/types.js";
import { EMPTY_TIKTOK_POST_SETTINGS } from "../../../../../shared/tiktok-post-settings.js";

interface Call {
  url: string;
  init?: RequestInit;
}

/** Each step matches a URL fragment and answers with a JSON body + status. */
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

const noWait = async () => undefined;
const VIDEO = { url: "https://cdn.hired.video/v/abc.mp4", bytes: async () => new Uint8Array(1000) };
const REQ = { accessToken: "tok", video: VIDEO, caption: "My video resume #hiring", title: "Dana — video resume" };

describe("tiktokChunkPlan", () => {
  it("uploads files up to 64 MB in one chunk", () => {
    assert.deepEqual(tiktokChunkPlan(5_000_000), { chunkSize: 5_000_000, count: 1 });
  });
  it("splits larger files into 10 MB chunks, remainder folded into the last", () => {
    assert.deepEqual(tiktokChunkPlan(100 * 1024 * 1024 + 7), { chunkSize: 10 * 1024 * 1024, count: 10 });
  });
});

describe("TikTok publisher", () => {
  it("inits, uploads, polls and links the finished post", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "creator_info", body: { data: { creator_username: "dana", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } } },
      { match: "video/init", body: { data: { publish_id: "p1", upload_url: "https://upload.tiktok/x" }, error: { code: "ok" } } },
      { match: "upload.tiktok", body: {} },
      { match: "status/fetch", body: { data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } } },
      { match: "status/fetch", body: { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [777] }, error: { code: "ok" } } },
    ]);
    const result = await createTikTokPublisher({ fetch, wait: noWait }).publish(REQ);
    assert.deepEqual(result, { externalId: "777", externalUrl: "https://www.tiktok.com/@dana/video/777" });
    const init = JSON.parse(String(calls[1].init?.body));
    assert.equal(init.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
    assert.equal(init.source_info.total_chunk_count, 1);
    assert.equal((calls[2].init?.headers as Record<string, string>)["Content-Range"], "bytes 0-999/1000");
  });

  it("falls back to the only privacy level an unaudited app gets", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "creator_info", body: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } },
      { match: "video/init", body: { data: { publish_id: "p1", upload_url: "https://upload.tiktok/x" }, error: { code: "ok" } } },
      { match: "upload.tiktok" },
      { match: "status/fetch", body: { data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } } },
    ]);
    const result = await createTikTokPublisher({ fetch, wait: noWait }).publish(REQ);
    assert.equal(JSON.parse(String(calls[1].init?.body)).post_info.privacy_level, "SELF_ONLY");
    assert.deepEqual(result, { externalId: "p1", externalUrl: null });
  });

  it("posts with the creator's own settings, honouring account-level disables", async () => {
    const { fetch, calls } = scriptedFetch([
      {
        match: "creator_info",
        body: {
          data: { creator_username: "dana", privacy_level_options: ["SELF_ONLY", "FOLLOWER_OF_CREATOR"], duet_disabled: true },
          error: { code: "ok" },
        },
      },
      { match: "video/init", body: { data: { publish_id: "p1", upload_url: "https://upload.tiktok/x" }, error: { code: "ok" } } },
      { match: "upload.tiktok" },
      { match: "status/fetch", body: { data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } } },
    ]);
    const tiktok = {
      ...EMPTY_TIKTOK_POST_SETTINGS,
      privacyLevel: "FOLLOWER_OF_CREATOR",
      allowComment: true,
      allowDuet: true,
      discloseContent: true,
      yourBrand: true,
    };
    await createTikTokPublisher({ fetch, wait: noWait }).publish({ ...REQ, tiktok });
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)).post_info, {
      title: REQ.caption,
      privacy_level: "FOLLOWER_OF_CREATOR",
      disable_comment: false,
      disable_duet: true,
      disable_stitch: true,
      brand_organic_toggle: true,
      brand_content_toggle: false,
    });
  });

  it("refuses settings without a privacy choice before uploading anything", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "creator_info", body: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } },
    ]);
    await assert.rejects(
      createTikTokPublisher({ fetch, wait: noWait }).publish({ ...REQ, tiktok: EMPTY_TIKTOK_POST_SETTINGS }),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "ACCOUNT_UNSUPPORTED",
    );
    assert.equal(calls.length, 1);
  });

  it("maps an expired token to NOT_AUTHORIZED", async () => {
    const { fetch } = scriptedFetch([
      { match: "creator_info", status: 401, body: { error: { code: "access_token_invalid" } } },
    ]);
    await assert.rejects(createTikTokPublisher({ fetch, wait: noWait }).publish(REQ), (e: unknown) =>
      e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED");
  });
});

describe("Instagram publisher", () => {
  it("rejects an account with no linked Business/Creator profile", async () => {
    const { fetch } = scriptedFetch([{ match: "me/accounts", body: { data: [{ id: "page1" }] } }]);
    await assert.rejects(createInstagramPublisher({ fetch, wait: noWait }).publish(REQ), (e: unknown) =>
      e instanceof SocialPublishError && e.kind === "ACCOUNT_UNSUPPORTED");
  });

  it("creates a Reels container from the CDN URL, waits, publishes and links", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "me/accounts", body: { data: [{ instagram_business_account: { id: "ig1" } }] } },
      { match: "ig1/media", body: { id: "c1" } },
      { match: "c1?fields=status_code", body: { status_code: "IN_PROGRESS" } },
      { match: "c1?fields=status_code", body: { status_code: "FINISHED" } },
      { match: "ig1/media_publish", body: { id: "m1" } },
      { match: "m1?fields=permalink", body: { permalink: "https://instagram.com/reel/m1" } },
    ]);
    const result = await createInstagramPublisher({ fetch, wait: noWait }).publish(REQ);
    assert.deepEqual(result, { externalId: "m1", externalUrl: "https://instagram.com/reel/m1" });
    const container = JSON.parse(String(calls[1].init?.body));
    assert.equal(container.media_type, "REELS");
    assert.equal(container.video_url, VIDEO.url);
  });
});

describe("Facebook publisher", () => {
  it("posts to the first Page with that Page's token", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "me/accounts", body: { data: [{ id: "page9", access_token: "page-tok" }] } },
      { match: "page9/videos", body: { id: "v5" } },
    ]);
    const result = await createFacebookPublisher({ fetch }).publish(REQ);
    assert.deepEqual(result, { externalId: "v5", externalUrl: "https://www.facebook.com/watch/?v=v5" });
    assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer page-tok");
    assert.match(String(calls[1].init?.body), /file_url=https%3A%2F%2Fcdn\.hired\.video/);
  });

  it("needs a Page", async () => {
    const { fetch } = scriptedFetch([{ match: "me/accounts", body: { data: [] } }]);
    await assert.rejects(createFacebookPublisher({ fetch }).publish(REQ), (e: unknown) =>
      e instanceof SocialPublishError && e.kind === "ACCOUNT_UNSUPPORTED");
  });
});

describe("X publisher", () => {
  it("uploads in segments, waits for processing, then posts with the media id", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "media/upload/initialize", body: { data: { id: "med1" } } },
      { match: "media/upload/med1/append" },
      { match: "media/upload/med1/finalize", body: { data: { processing_info: { state: "pending" } } } },
      { match: "command=STATUS", body: { data: { processing_info: { state: "succeeded" } } } },
      { match: "/2/tweets", body: { data: { id: "t1" } } },
    ]);
    const result = await createXPublisher({ fetch, wait: noWait }).publish(REQ);
    assert.deepEqual(result, { externalId: "t1", externalUrl: "https://x.com/i/web/status/t1" });
    assert.deepEqual(JSON.parse(String(calls[4].init?.body)).media, { media_ids: ["med1"] });
  });

  it("clips the post text to 280 characters", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "media/upload/initialize", body: { data: { id: "med1" } } },
      { match: "append" },
      { match: "finalize", body: { data: {} } },
      { match: "/2/tweets", body: { data: { id: "t1" } } },
    ]);
    await createXPublisher({ fetch, wait: noWait }).publish({ ...REQ, caption: "a".repeat(400) });
    assert.equal(JSON.parse(String(calls[3].init?.body)).text.length, 280);
  });
});

describe("view readers", () => {
  const insight = (name: string, value: number) => ({ code: 200, body: JSON.stringify({ data: [{ name, values: [{ value }] }] }) });

  it("TikTok queries only finished video ids and maps view_count", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "video/query", body: { data: { videos: [{ id: "777", view_count: 42 }] }, error: { code: "ok" } } },
    ]);
    const views = await createTikTokViewReader({ fetch })("tok", ["777", "v_pub_file~abc"]);
    assert.deepEqual([...views], [["777", 42]]);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { filters: { video_ids: ["777"] } });
  });

  it("TikTok surfaces a missing video.list scope as NOT_AUTHORIZED", async () => {
    const { fetch } = scriptedFetch([{ match: "video/query", body: { error: { code: "scope_not_authorized" } } }]);
    await assert.rejects(createTikTokViewReader({ fetch })("tok", ["1"]), (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED");
  });

  it("Instagram batches insights and skips the item that failed", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "graph.facebook.com", body: [insight("views", 120), { code: 400, body: "{}" }] },
    ]);
    const views = await createInstagramViewReader({ fetch })("tok", ["m1", "gone"]);
    assert.deepEqual([...views], [["m1", 120]]);
    const batch = JSON.parse(new URLSearchParams(String(calls[0].init?.body)).get("batch")!);
    assert.equal(batch[0].relative_url, "m1/insights?metric=views");
  });

  it("Facebook reads video insights with the Page token", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "me/accounts", body: { data: [{ id: "pg", access_token: "page-tok" }] } },
      { match: "graph.facebook.com", body: [insight("total_video_views", 9)] },
    ]);
    const views = await createFacebookViewReader({ fetch })("tok", ["v1"]);
    assert.deepEqual([...views], [["v1", 9]]);
    assert.equal(new URLSearchParams(String(calls[1].init?.body)).get("access_token"), "page-tok");
  });

  it("X maps impression_count and ignores deleted posts", async () => {
    const { fetch, calls } = scriptedFetch([
      { match: "tweets?ids=", body: { data: [{ id: "t1", public_metrics: { impression_count: 300 } }], errors: [{ resource_id: "t2" }] } },
    ]);
    const views = await createXViewReader({ fetch })("tok", ["t1", "t2"]);
    assert.deepEqual([...views], [["t1", 300]]);
    assert.ok(calls[0].url.includes("ids=t1,t2"));
  });
});
