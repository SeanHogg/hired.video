/**
 * LinkedIn publisher adapter — the server-side member video post (#2313)
 * driven by a scripted fake `fetch`, so the call order, byte ranges, ETag
 * hand-off, token containment and error mapping are pinned without LinkedIn.
 *
 * Run: node --import tsx --test src/services/social/__tests__/publishers-linkedin.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLinkedInPublisher,
  createLinkedInViewReader,
  escapeLinkedInCommentary,
} from "../publishers/linkedin.js";
import { SocialPublishError } from "../publishers/types.js";
import { LINKEDIN_POST_TEXT_MAX } from "../../../../../shared/social-platforms.js";

interface Call {
  url: string;
  init: RequestInit;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** 10-byte video split into two upload parts: [0..5] and [6..9]. */
function scriptedFetch(
  overrides: { userinfoStatus?: number; sub?: string | null; uploadStatus?: number; postStatus?: number; postId?: string | null } = {},
) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url, init });
    if (url.endsWith("/v2/userinfo")) {
      if (overrides.userinfoStatus) return json({ message: "token revoked" }, overrides.userinfoStatus);
      return json(overrides.sub === null ? {} : { sub: overrides.sub ?? "abc123", name: "Dana" });
    }
    if (url.includes("action=initializeUpload")) {
      return json({
        value: {
          video: "urn:li:video:V1",
          uploadToken: "TOKEN-UP",
          uploadInstructions: [
            { uploadUrl: "https://upload.linkedin.test/p1", firstByte: 0, lastByte: 5 },
            { uploadUrl: "https://upload.linkedin.test/p2", firstByte: 6, lastByte: 9 },
          ],
        },
      });
    }
    if (url.startsWith("https://upload.linkedin.test/")) {
      const status = overrides.uploadStatus ?? 200;
      return new Response(null, { status, headers: status === 200 ? { etag: `etag-${url.slice(-2)}` } : {} });
    }
    if (url.includes("action=finalizeUpload")) return new Response(null, { status: 200 });
    if (url.endsWith("/posts")) {
      const status = overrides.postStatus ?? 201;
      const id = overrides.postId === undefined ? "urn:li:share:42" : overrides.postId;
      return new Response(null, { status, headers: id && status < 300 ? { "x-restli-id": id } : {} });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetch };
}

const REQ = {
  accessToken: "SECRET-TOKEN",
  video: { url: "https://cdn.hired.video/v/abc.mp4", bytes: async () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) },
  caption: "New role (finally)! #hiring",
  title: "My video",
};

describe("LinkedIn publisher", () => {
  it("resolves the member, uploads each byte range, finalizes with ETags in order, then posts", async () => {
    const { calls, fetch } = scriptedFetch();
    const result = await createLinkedInPublisher({ fetch }).publish(REQ);
    assert.deepEqual(result, {
      externalId: "urn:li:share:42",
      externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:42",
    });
    assert.deepEqual(
      calls.map((c) => c.url.replace("https://api.linkedin.com/rest", "")),
      [
        "https://api.linkedin.com/v2/userinfo",
        "/videos?action=initializeUpload",
        "https://upload.linkedin.test/p1",
        "https://upload.linkedin.test/p2",
        "/videos?action=finalizeUpload",
        "/posts",
      ],
    );

    const init = JSON.parse(String(calls[1].init.body));
    assert.equal(init.initializeUploadRequest.owner, "urn:li:person:abc123");
    assert.equal(init.initializeUploadRequest.fileSizeBytes, 10);

    assert.deepEqual(Array.from(calls[2].init.body as Uint8Array), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(Array.from(calls[3].init.body as Uint8Array), [6, 7, 8, 9]);

    const finalize = JSON.parse(String(calls[4].init.body));
    assert.deepEqual(finalize.finalizeUploadRequest, {
      video: "urn:li:video:V1",
      uploadToken: "TOKEN-UP",
      uploadedPartIds: ["etag-p1", "etag-p2"],
    });

    const post = JSON.parse(String(calls[5].init.body));
    assert.equal(post.author, "urn:li:person:abc123");
    assert.equal(post.visibility, "PUBLIC");
    assert.equal(post.content.media.id, "urn:li:video:V1");
    assert.equal(post.content.media.title, "My video");
    assert.equal(post.commentary, "New role \\(finally\\)! #hiring");
  });

  it("falls back to the title when there is no caption, clipped to LinkedIn's limit", async () => {
    const { calls, fetch } = scriptedFetch();
    await createLinkedInPublisher({ fetch }).publish({ ...REQ, caption: "", title: "x".repeat(LINKEDIN_POST_TEXT_MAX + 50) });
    const post = JSON.parse(String(calls[5].init.body));
    assert.equal(post.commentary.length, LINKEDIN_POST_TEXT_MAX);
  });

  it("sends the member token only to LinkedIn's API, never to the pre-signed upload URLs", async () => {
    const { calls, fetch } = scriptedFetch();
    await createLinkedInPublisher({ fetch }).publish(REQ);
    for (const c of calls) {
      const auth = (c.init.headers as Record<string, string> | undefined)?.Authorization;
      if (c.url.startsWith("https://api.linkedin.com/")) assert.equal(auth, "Bearer SECRET-TOKEN");
      else assert.equal(auth, undefined);
    }
  });

  it("maps a rejected token to NOT_AUTHORIZED before uploading anything", async () => {
    const { calls, fetch } = scriptedFetch({ userinfoStatus: 401 });
    await assert.rejects(
      createLinkedInPublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED",
    );
    assert.equal(calls.length, 1);
  });

  it("reports ACCOUNT_UNSUPPORTED when LinkedIn returns no member id", async () => {
    const { fetch } = scriptedFetch({ sub: null });
    await assert.rejects(
      createLinkedInPublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "ACCOUNT_UNSUPPORTED",
    );
  });

  it("fails as PLATFORM_ERROR when an upload part is rejected", async () => {
    const { fetch } = scriptedFetch({ uploadStatus: 500 });
    await assert.rejects(
      createLinkedInPublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "PLATFORM_ERROR",
    );
  });

  it("maps a 403 on the post (missing w_member_social) to NOT_AUTHORIZED", async () => {
    const { fetch } = scriptedFetch({ postStatus: 403 });
    await assert.rejects(
      createLinkedInPublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED",
    );
  });

  it("fails when LinkedIn returns no post id", async () => {
    const { fetch } = scriptedFetch({ postId: null });
    await assert.rejects(
      createLinkedInPublisher({ fetch }).publish(REQ),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "PLATFORM_ERROR" && /no post id/.test(e.message),
    );
  });
});

describe("LinkedIn view reader", () => {
  it("reads impressions per post and leaves deleted posts out", async () => {
    const calls: string[] = [];
    const fetch = async (url: string): Promise<Response> => {
      calls.push(url);
      if (url.includes("share%3A1")) return json({ elements: [{ count: 321 }] });
      return new Response("", { status: 404 });
    };
    const views = await createLinkedInViewReader({ fetch })("tok", ["urn:li:share:1", "urn:li:ugcPost:2"]);
    assert.deepEqual([...views], [["urn:li:share:1", 321]]);
    assert.ok(calls[0].includes("entity=(share:urn%3Ali%3Ashare%3A1)"));
    assert.ok(calls[1].includes("entity=(ugc:urn%3Ali%3AugcPost%3A2)"));
    assert.ok(calls.every((u) => u.includes("queryType=IMPRESSION")));
  });

  it("surfaces a token without the analytics scope as NOT_AUTHORIZED", async () => {
    const fetch = async (): Promise<Response> => new Response("forbidden", { status: 403 });
    await assert.rejects(
      createLinkedInViewReader({ fetch })("tok", ["urn:li:share:1"]),
      (e: unknown) => e instanceof SocialPublishError && e.kind === "NOT_AUTHORIZED",
    );
  });
});

describe("escapeLinkedInCommentary", () => {
  it("escapes little-text markup but keeps hashtags", () => {
    assert.equal(escapeLinkedInCommentary("a_b *c* [d] @e #f"), "a\\_b \\*c\\* \\[d\\] \\@e #f");
  });
});
