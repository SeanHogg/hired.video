/**
 * #978 TikTok request-shape tests: identity/get (or identity/create) and
 * file/video/ad/upload (UPLOAD_BY_URL) before ad/create; both ids cached
 * per advertiser on the creative metadata and reused.
 *
 * Run: node --import tsx --test src/services/paid-media/__tests__/tiktok-adapter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTikTokAdapter } from "../adapters/tiktok/index.js";
import { cachedTikTokVideoId } from "../adapters/tiktok/uploadVideo.js";
import { cachedTikTokIdentityId } from "../adapters/tiktok/identity.js";
import { ADAPTER_CFG as CFG, ADAPTER_CTX as CTX, useFetchStub } from "./fetch-stub.js";

const { calls, responses } = useFetchStub();
const TT = "https://business-api.tiktok.com/open_api/v1.3";

const creative = {
  internalId: "cr-1", name: "Pitch reel", format: "single_video" as const, ctaText: "LEARN_MORE",
  assetUrl: "https://media.hired.video/renders/pitch-reel.mp4", assets: [],
  metadata: { tiktokDisplayName: "Sean Hogg" } as Record<string, unknown>,
};

describe("#978 TikTok identity + video upload", () => {
  it("first sync: identity/get (none) → identity/create → file/video/ad/upload", async () => {
    responses.push(
      { code: 0, data: { identity_list: [] } },
      { code: 0, data: { identity_id: "ident-new" } },
      { code: 0, message: "OK", data: [{ video_id: "v_123", file_name: "Pitch reel" }] },
    );
    const ref = await createTikTokAdapter(CFG).createCreative(CTX, creative);
    assert.equal(calls.length, 3);

    assert.equal(calls[0]!.init.method, "GET");
    const getUrl = new URL(calls[0]!.url);
    assert.equal(`${getUrl.origin}${getUrl.pathname}`, `${TT}/identity/get/`);
    assert.equal(getUrl.searchParams.get("advertiser_id"), "1234567890");
    assert.equal(getUrl.searchParams.get("identity_type"), "CUSTOMIZED_USER");

    assert.equal(calls[1]!.url, `${TT}/identity/create/`);
    assert.equal(calls[1]!.init.method, "POST");
    assert.deepEqual(calls[1]!.body, { advertiser_id: "1234567890", display_name: "Sean Hogg" });

    assert.equal(calls[2]!.url, `${TT}/file/video/ad/upload/`);
    assert.equal((calls[2]!.init.headers as Record<string, string>)["Access-Token"], "tok");
    const up = calls[2]!.body;
    assert.equal(up.advertiser_id, "1234567890");
    assert.equal(up.upload_type, "UPLOAD_BY_URL");
    assert.equal(up.video_url, creative.assetUrl);
    assert.match(up.file_name, /^Pitch reel-\d+$/);

    assert.equal(ref.externalId, "v_123");
    assert.deepEqual(ref.metadataPatch, {
      tiktokVideoIds: { "1234567890": "v_123" },
      tiktokIdentityIds: { "1234567890": "ident-new" },
    });
  });

  it("reuses an existing identity matched by display name (no create)", async () => {
    responses.push(
      { code: 0, data: { identity_list: [{ identity_id: "ident-a", display_name: "Other" }, { identity_id: "ident-b", display_name: "Sean Hogg" }] } },
      { code: 0, data: [{ video_id: "v_9" }] },
    );
    const ref = await createTikTokAdapter(CFG).createCreative(CTX, creative);
    assert.equal(calls.filter((c) => c.url.includes("identity/create")).length, 0);
    assert.deepEqual((ref.metadataPatch as any).tiktokIdentityIds, { "1234567890": "ident-b" });
  });

  it("defaults the display name when the creative has none", async () => {
    responses.push({ code: 0, data: { identity_list: [] } }, { code: 0, data: { identity_id: "i" } }, { code: 0, data: [{ video_id: "v" }] });
    await createTikTokAdapter(CFG).createCreative(CTX, { ...creative, metadata: {} });
    assert.equal(calls[1]!.body.display_name, "hired.video");
  });

  it("later syncs reuse the cached identity + video: no API calls, no patch", async () => {
    const ref = await createTikTokAdapter(CFG).createCreative(CTX, {
      ...creative,
      metadata: { tiktokVideoIds: { "1234567890": "v_cached" }, tiktokIdentityIds: { "1234567890": "ident-cached" } },
    });
    assert.equal(calls.length, 0);
    assert.equal(ref.externalId, "v_cached");
    assert.equal(ref.metadataPatch, undefined);
  });

  it("a non-video creative stays synthetic (no calls)", async () => {
    const ref = await createTikTokAdapter(CFG).createCreative(CTX, { ...creative, format: "single_image" });
    assert.equal(calls.length, 0);
    assert.equal(ref.externalId, "synthetic:cr-1");
  });
});

describe("#978 TikTok ad/create", () => {
  it("references the uploaded video and the cached identity", async () => {
    responses.push({ code: 0, data: { ad_ids: ["ad_1"] } });
    const ref = await createTikTokAdapter(CFG).createAd(CTX, {
      internalId: "ad-1", externalAdSetId: "ag_1", externalCreativeId: "v_123", name: "Ad 1",
      status: "active", destinationUrl: "https://hired.video/p/sean",
      metadata: { tiktokIdentityIds: { "1234567890": "ident-9" } },
    });
    assert.equal(ref.externalId, "ad_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${TT}/ad/create/`);
    assert.equal(calls[0]!.body.advertiser_id, "1234567890");
    assert.equal(calls[0]!.body.adgroup_id, "ag_1");
    const c = calls[0]!.body.creatives[0];
    assert.equal(c.video_id, "v_123");
    assert.equal(c.identity_id, "ident-9");
    assert.equal(c.identity_type, "CUSTOMIZED_USER");
    assert.equal(c.ad_format, "SINGLE_VIDEO");
    assert.equal(c.landing_page_url, "https://hired.video/p/sean");
  });

  it("provisions the identity on the fly when the creative metadata has none", async () => {
    responses.push(
      { code: 0, data: { identity_list: [{ identity_id: "ident-x", display_name: "hired.video" }] } },
      { code: 0, data: { ad_ids: ["ad_2"] } },
    );
    await createTikTokAdapter(CFG).createAd(CTX, {
      internalId: "ad-2", externalAdSetId: "ag_1", externalCreativeId: "v_1", name: "Ad 2",
      status: "active", destinationUrl: "https://hired.video", metadata: {},
    });
    assert.equal(calls[1]!.body.creatives[0].identity_id, "ident-x");
  });

  it("errors: vendor failures surface; an ad without a video is rejected", async () => {
    responses.push({ code: 0, data: { identity_list: [{ identity_id: "i1", display_name: "Sean Hogg" }] } }, { code: 40002, message: "video_url unreachable" });
    await assert.rejects(() => createTikTokAdapter(CFG).createCreative(CTX, creative), /video_url unreachable/);
    responses.push({ code: 40100, message: "no permission" });
    await assert.rejects(() => createTikTokAdapter(CFG).createCreative(CTX, creative), /identity lookup failed: no permission/);
    await assert.rejects(
      () => createTikTokAdapter(CFG).createAd(CTX, {
        internalId: "ad-3", externalAdSetId: "ag_1", externalCreativeId: "synthetic:cr-2", name: "Ad 3",
        status: "active", destinationUrl: "https://hired.video", metadata: {},
      }),
      /video creative/,
    );
  });

  it("cache readers honour manually pasted legacy ids", () => {
    assert.equal(cachedTikTokVideoId({ tiktokVideoId: "v_manual" }, "any"), "v_manual");
    assert.equal(cachedTikTokIdentityId({ tiktokIdentityId: "i_manual" }, "any"), "i_manual");
    assert.equal(cachedTikTokVideoId({}, "any"), null);
  });
});
