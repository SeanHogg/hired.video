/**
 * YouTube service unit tests — closes part of gap #1344 (youtube was on the
 * zero-test-domain list). Covers the cleanly-testable surface across the four
 * service files:
 *
 *   youtubeOAuth.ts
 *     • youtubeOAuthConfig       — Env → OAuth subset projection
 *     • shouldRefreshAccessToken — pure refresh decision (missing token /
 *                                   missing/invalid/past expiry / safety window)
 *     • buildAuthUrl             — consent URL shape (client_id, scopes,
 *                                   offline params) + NOT_CONFIGURED throw
 *     • fetchPrimaryChannel      — fetch-stubbed: items[0] mapping + null paths
 *     • getFreshAccessToken      — short-circuit on fresh token, REFRESH_TOKEN_MISSING,
 *                                   refresh + persist via injected rotate
 *   youtubeUpload.ts
 *     • buildSnippet             — title/description/tags truncation + default category
 *     • buildMultipartBody       — boundary + content-type + body framing
 *   (the upload itself is the YouTube publisher adapter — see
 *    services/social/__tests__/publishers-youtube.test.ts)
 *   youtubeAccountRepository.ts
 *     • accountToDto             — public DTO shaping + channelTitle fallback
 *
 * `fetch` is stubbed per-test (no network). Methods that call getDb()
 * internally are exercised only via their injected-db / injected-fn seams.
 *
 * Run: node --import tsx --test src/services/youtube/__tests__/youtube.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  youtubeOAuthConfig,
  shouldRefreshAccessToken,
  buildAuthUrl,
  fetchPrimaryChannel,
  getFreshAccessToken,
  YouTubeAuthError,
  ACCESS_TOKEN_SAFETY_WINDOW_MS,
  hasRequiredYouTubeScopes,
  YOUTUBE_REQUIRED_SCOPES,
} from "../youtubeOAuth.js";
import { missingScopes } from "../../oauth/oauth2Provider.js";
import { buildSnippet, buildMultipartBody } from "../youtubeUpload.js";
import { accountToDto } from "../youtubeAccountRepository.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Capture {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Install a fetch stub that records the request and returns a JSON/text body. */
function stubFetch(resp: { ok?: boolean; status?: number; json?: unknown; text?: string }): Capture {
  const cap: Capture = {};
  globalThis.fetch = (async (url: any, init: any) => {
    cap.url = String(url);
    cap.method = init?.method;
    cap.headers = init?.headers;
    cap.body = init?.body;
    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      json: async () => resp.json ?? {},
      text: async () => resp.text ?? "",
    } as Response;
  }) as typeof fetch;
  return cap;
}

// ── youtubeOAuthConfig ─────────────────────────────────────────────────────

describe("granted-scope check (Google granular consent)", () => {
  const [UPLOAD, READONLY] = YOUTUBE_REQUIRED_SCOPES;
  const EMAIL = "https://www.googleapis.com/auth/userinfo.email";

  it("accepts a token carrying every required scope (plus extras, any order)", () => {
    assert.equal(hasRequiredYouTubeScopes(`openid ${EMAIL} ${READONLY} ${UPLOAD}`), true);
  });

  it("rejects when the user unticked a YouTube box", () => {
    assert.equal(hasRequiredYouTubeScopes(`${EMAIL} ${UPLOAD}`), false);
    assert.equal(hasRequiredYouTubeScopes(`${EMAIL} ${READONLY}`), false);
  });

  it("rejects when Continue was clicked with nothing ticked", () => {
    assert.equal(hasRequiredYouTubeScopes(EMAIL), false);
    assert.equal(hasRequiredYouTubeScopes(""), false);
  });

  it("missingScopes splits space- and comma-separated grants", () => {
    assert.deepEqual(missingScopes("a,b c", ["a", "b", "c", "d"]), ["d"]);
    assert.deepEqual(missingScopes("anything", []), []);
  });
});

describe("youtubeOAuthConfig", () => {
  it("projects the full Env to the OAuth client subset", () => {
    const cfg = youtubeOAuthConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret" });
    assert.deepEqual(cfg, { clientId: "cid", clientSecret: "secret" });
  });

  it("passes undefined through when env keys are absent", () => {
    const cfg = youtubeOAuthConfig({});
    assert.deepEqual(cfg, { clientId: undefined, clientSecret: undefined });
  });
});

// ── shouldRefreshAccessToken ───────────────────────────────────────────────

describe("shouldRefreshAccessToken", () => {
  const NOW = 1_000_000_000_000;

  it("refreshes when the access token is missing", () => {
    assert.equal(shouldRefreshAccessToken({ accessToken: null, tokenExpiresAt: new Date(NOW + 10_000_000) }, NOW), true);
  });

  it("refreshes when the expiry is missing", () => {
    assert.equal(shouldRefreshAccessToken({ accessToken: "tok", tokenExpiresAt: null }, NOW), true);
  });

  it("refreshes when the expiry is an invalid date string", () => {
    assert.equal(shouldRefreshAccessToken({ accessToken: "tok", tokenExpiresAt: "not-a-date" }, NOW), true);
  });

  it("refreshes when the expiry is already in the past", () => {
    assert.equal(shouldRefreshAccessToken({ accessToken: "tok", tokenExpiresAt: new Date(NOW - 1) }, NOW), true);
  });

  it("refreshes when the expiry falls inside the safety window (boundary)", () => {
    // expiry exactly at now + window → <= → refresh
    const atWindow = new Date(NOW + ACCESS_TOKEN_SAFETY_WINDOW_MS);
    assert.equal(shouldRefreshAccessToken({ accessToken: "tok", tokenExpiresAt: atWindow }, NOW), true);
  });

  it("does NOT refresh when the token is valid well beyond the safety window", () => {
    const future = new Date(NOW + ACCESS_TOKEN_SAFETY_WINDOW_MS + 60_000);
    assert.equal(shouldRefreshAccessToken({ accessToken: "tok", tokenExpiresAt: future }, NOW), false);
  });
});

// ── buildAuthUrl ───────────────────────────────────────────────────────────

describe("buildAuthUrl", () => {
  it("builds a Google consent URL with client_id, redirect, scopes + offline params", () => {
    const url = buildAuthUrl({ clientId: "cid", clientSecret: "secret" }, "https://app.example/cb");
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(parsed.searchParams.get("client_id"), "cid");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example/cb");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.match(parsed.searchParams.get("scope") ?? "", /youtube\.upload/);
    // GOOGLE_OFFLINE_AUTH_PARAMS threaded through
    assert.equal(parsed.searchParams.get("access_type"), "offline");
    assert.equal(parsed.searchParams.get("prompt"), "consent");
  });

  it("throws a NOT_CONFIGURED OAuth2Error when clientId is missing", () => {
    assert.throws(
      () => buildAuthUrl({ clientId: undefined, clientSecret: "secret" }, "https://app.example/cb"),
      (err: unknown) => err instanceof Error && /not configured/i.test(err.message),
    );
  });
});

// ── fetchPrimaryChannel ────────────────────────────────────────────────────

describe("fetchPrimaryChannel", () => {
  it("maps items[0] to { id, title } and sends a Bearer auth header", async () => {
    const cap = stubFetch({ json: { items: [{ id: "chan-1", snippet: { title: "My Channel" } }] } });
    const channel = await fetchPrimaryChannel("acc-tok");
    assert.deepEqual(channel, { id: "chan-1", title: "My Channel" });
    assert.match(cap.url ?? "", /youtube\/v3\/channels/);
    assert.equal(cap.headers?.Authorization, "Bearer acc-tok");
  });

  it("returns null on a non-OK response", async () => {
    stubFetch({ ok: false, status: 403, json: {} });
    assert.equal(await fetchPrimaryChannel("acc-tok"), null);
  });

  it("returns null when the channel list is empty", async () => {
    stubFetch({ json: { items: [] } });
    assert.equal(await fetchPrimaryChannel("acc-tok"), null);
  });
});

// ── getFreshAccessToken ────────────────────────────────────────────────────

const CONFIG = { clientId: "cid", clientSecret: "secret" };

function account(over: Record<string, unknown> = {}) {
  return {
    id: "acct-1",
    accessToken: "cached-token",
    refreshToken: "refresh-token",
    // far future so shouldRefreshAccessToken returns false by default
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...over,
  } as any;
}

describe("getFreshAccessToken", () => {
  it("returns the cached token without refreshing when it is still valid", async () => {
    let rotated = false;
    const token = await getFreshAccessToken(CONFIG, account(), async () => {
      rotated = true;
    });
    assert.equal(token, "cached-token");
    assert.equal(rotated, false, "should not persist a rotation when no refresh happened");
  });

  it("throws REFRESH_TOKEN_MISSING when a refresh is needed but no refresh token is stored", async () => {
    const stale = account({ accessToken: null, refreshToken: null });
    await assert.rejects(
      () => getFreshAccessToken(CONFIG, stale, async () => {}),
      (err: unknown) => err instanceof YouTubeAuthError && err.reason === "REFRESH_TOKEN_MISSING",
    );
  });

  it("refreshes via Google then persists the rotation through the injected fn", async () => {
    // Token endpoint response for the generic OAuth2 refresh.
    stubFetch({ json: { access_token: "new-token", expires_in: 3600, scope: "s" } });
    const stale = account({ accessToken: null });
    let rotation: any = null;
    const token = await getFreshAccessToken(CONFIG, stale, async (accountId, rot) => {
      rotation = { accountId, rot };
    });
    assert.equal(token, "new-token");
    assert.equal(rotation.accountId, "acct-1");
    assert.equal(rotation.rot.accessToken, "new-token");
    assert.ok(rotation.rot.tokenExpiresAt instanceof Date);
  });

  it("wraps a failed token request as a REFRESH_FAILED YouTubeAuthError", async () => {
    stubFetch({ ok: false, status: 400, text: "invalid_grant" });
    const stale = account({ accessToken: null });
    await assert.rejects(
      () => getFreshAccessToken(CONFIG, stale, async () => {}),
      (err: unknown) => err instanceof YouTubeAuthError && err.reason === "REFRESH_FAILED",
    );
  });
});

// ── buildSnippet ───────────────────────────────────────────────────────────

describe("buildSnippet", () => {
  it("caps title at 100, description at 5000, tags at 15, sets default category + kids flag", () => {
    const snippet = buildSnippet({
      title: "t".repeat(150),
      description: "d".repeat(6000),
      privacy: "unlisted",
      tags: Array.from({ length: 30 }, (_, i) => `tag${i}`),
    });
    assert.equal(snippet.snippet.title.length, 100);
    assert.equal(snippet.snippet.description.length, 5000);
    assert.equal(snippet.snippet.tags?.length, 15);
    assert.equal(snippet.snippet.categoryId, "22");
    assert.equal(snippet.status.privacyStatus, "unlisted");
    assert.equal(snippet.status.selfDeclaredMadeForKids, false);
  });

  it("leaves tags undefined when none are supplied", () => {
    const snippet = buildSnippet({ title: "Hi", description: "Body", privacy: "private" });
    assert.equal(snippet.snippet.tags, undefined);
    assert.equal(snippet.status.privacyStatus, "private");
  });
});

// ── buildMultipartBody ─────────────────────────────────────────────────────

describe("buildMultipartBody", () => {
  it("frames the JSON metadata + media bytes with the boundary and returns a matching content-type", () => {
    const media = new Uint8Array([1, 2, 3, 4]);
    const { body, boundary, contentType } = buildMultipartBody(
      { title: "Demo", description: "Body", privacy: "public" },
      media,
      "BOUND",
    );
    assert.equal(boundary, "BOUND");
    assert.equal(contentType, "multipart/related; boundary=BOUND");
    const text = new TextDecoder().decode(body);
    assert.match(text, /--BOUND\r\n/);
    assert.match(text, /Content-Type: application\/json/);
    assert.match(text, /Content-Type: video\/mp4/);
    assert.match(text, /--BOUND--/);
    // media bytes are embedded — total length = head + media + tail
    assert.ok(body.length > media.length, "body should embed the media bytes");
  });
});

// ── accountToDto ───────────────────────────────────────────────────────────

describe("accountToDto", () => {
  it("exposes only frontend-safe fields with an ISO connectedAt", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const dto = accountToDto({
      channelId: "chan-1",
      channelTitle: "Ada's Channel",
      createdAt: created,
    } as any);
    assert.deepEqual(dto, {
      channelId: "chan-1",
      channelTitle: "Ada's Channel",
      channelThumbnail: undefined,
      subscriberCount: undefined,
      videoCount: undefined,
      connectedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("falls back to a default channelTitle when none is stored", () => {
    const dto = accountToDto({ channelId: null, channelTitle: null, createdAt: new Date() } as any);
    assert.equal(dto.channelTitle, "My YouTube Channel");
    assert.equal(dto.channelId, null);
  });
});
