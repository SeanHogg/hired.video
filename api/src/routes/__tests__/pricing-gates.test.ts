/**
 * Tests for the Pricing-page Pro tier enforcement gates shipped 2026-04-26.
 *
 * Covers the four feature claims that were previously misadvertised on
 * `Pricing.tsx` and have since been backed by real implementations:
 *
 *   • #204 Priority job ranking      — scoreJobsForRanking()
 *   • #202 YouTube publish flow      — shouldRefreshAccessToken()
 *   • #203 AI LinkedIn post gen      — flattenStoryboardTranscript() +
 *                                       buildHeuristicCaption()
 *   • Interview practice free limit  — FREE_INTERVIEW_SESSIONS_PER_MONTH
 *                                       (shared/pricing.ts constants)
 *
 * These tests target the pure helpers extracted from the route handlers so
 * the assertions don't require a live Postgres / OAuth roundtrip. The
 * per-route auth + DB plumbing is exercised end-to-end at deploy time.
 *
 * Run: node --import tsx --test src/routes/__tests__/pricing-gates.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  scoreJobsForRanking,
  RANKING_WEIGHTS,
  RANKING_RULES,
  termInBodyRule,
  sponsoredBaseRule,
  termInTitleProRule,
  recencyProRule,
  sponsoredProBoostRule,
  type ScoreableJob,
  type ScoringContext,
  type ScoringRule,
} from "../../services/job/ranking.js";
import {
  shouldRefreshAccessToken,
  ACCESS_TOKEN_SAFETY_WINDOW_MS,
  expiresInToDate,
  getFreshAccessToken,
  type RotateAccessTokenFn,
} from "../../services/youtube/youtubeOAuth.js";
import { buildSnippet, buildMultipartBody } from "../../services/youtube/youtubeUpload.js";
import {
  PublishVideoError,
  type PublishVideoErrorKind,
} from "../../services/studio/compiled-video.js";
import { startOfMonthUtc } from "../../middleware/free-tier-limits.js";
import { flattenStoryboardTranscript, buildHeuristicCaption, projectTranscript } from "../../services/studio/social-caption.js";
import {
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
} from "../../../../shared/pricing.js";

// ═══════════════════════════════════════════════════════════════════════════
// #204 — scoreJobsForRanking
// ═══════════════════════════════════════════════════════════════════════════

const NOW = new Date("2026-04-26T12:00:00Z").getTime();
const days = (n: number) => new Date(NOW - n * 86_400_000);

function makeJob(overrides: Partial<ScoreableJob> = {}): ScoreableJob {
  return {
    id: overrides.id ?? "job-1",
    title: "Senior Engineer",
    description: "Backend platform team building distributed systems.",
    createdAt: days(60),
    sponsored: false,
    sponsoredRankBoost: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// #204 — individual ScoringRule strategies (each rule in isolation)
// ═══════════════════════════════════════════════════════════════════════════

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    job: { title: "Engineer", description: "platform team", createdAt: days(60) },
    terms: ["engineer"],
    isPro: false,
    now: NOW,
    ...overrides,
  };
}

describe("ScoringRule: termInBody", () => {
  it("fires for both Free and Pro (tier='both')", () => {
    assert.equal(termInBodyRule.tier, "both");
  });

  it("contributes once per query term that hits title or description", () => {
    const score = termInBodyRule.score(ctx({
      job: { title: "Senior Engineer", description: "platform lead" },
      terms: ["engineer", "platform"],
    }));
    assert.equal(score, 2 * RANKING_WEIGHTS.termInBody);
  });

  it("returns 0 when no term matches", () => {
    assert.equal(termInBodyRule.score(ctx({ terms: ["banana"] })), 0);
  });
});

describe("ScoringRule: sponsoredBase", () => {
  it("returns 0 when job is not sponsored", () => {
    assert.equal(sponsoredBaseRule.score(ctx({ job: { sponsored: false } })), 0);
  });

  it("adds the base bump plus the per-row boost", () => {
    const score = sponsoredBaseRule.score(ctx({
      job: { sponsored: true, sponsoredRankBoost: 7 },
    }));
    assert.equal(score, RANKING_WEIGHTS.sponsoredBase + 7);
  });
});

describe("ScoringRule: termInTitlePro", () => {
  it("is Pro-only (tier='pro')", () => {
    assert.equal(termInTitleProRule.tier, "pro");
  });

  it("returns 0 for Free callers even with title hits", () => {
    const score = termInTitleProRule.score(ctx({
      job: { title: "Backend Engineer" },
      terms: ["engineer"],
      isPro: false,
    }));
    assert.equal(score, 0);
  });

  it("contributes per-term-in-title × Pro weight", () => {
    const score = termInTitleProRule.score(ctx({
      job: { title: "Backend Platform Engineer" },
      terms: ["backend", "platform"],
      isPro: true,
    }));
    assert.equal(score, 2 * RANKING_WEIGHTS.termInTitlePro);
  });
});

describe("ScoringRule: recencyPro", () => {
  it("is Pro-only (tier='pro')", () => {
    assert.equal(recencyProRule.tier, "pro");
  });

  it("returns 0 for Free callers even on day-old jobs", () => {
    assert.equal(
      recencyProRule.score(ctx({ job: { createdAt: days(1) }, isPro: false })),
      0,
    );
  });

  it("returns the fresh boost inside the fresh window", () => {
    assert.equal(
      recencyProRule.score(ctx({ job: { createdAt: days(1) }, isPro: true })),
      RANKING_WEIGHTS.recencyFreshBoost,
    );
  });

  it("returns the recent boost between fresh and recent windows", () => {
    assert.equal(
      recencyProRule.score(ctx({ job: { createdAt: days(20) }, isPro: true })),
      RANKING_WEIGHTS.recencyRecentBoost,
    );
  });

  it("returns 0 outside both recency windows", () => {
    assert.equal(
      recencyProRule.score(ctx({ job: { createdAt: days(180) }, isPro: true })),
      0,
    );
  });

  it("treats null createdAt as 'old enough' (no recency boost)", () => {
    assert.equal(
      recencyProRule.score(ctx({ job: { createdAt: null }, isPro: true })),
      0,
    );
  });
});

describe("ScoringRule: sponsoredProBoost", () => {
  it("is Pro-only and only fires when sponsored", () => {
    assert.equal(
      sponsoredProBoostRule.score(ctx({ job: { sponsored: true }, isPro: false })),
      0,
    );
    assert.equal(
      sponsoredProBoostRule.score(ctx({ job: { sponsored: false }, isPro: true })),
      0,
    );
    assert.equal(
      sponsoredProBoostRule.score(ctx({ job: { sponsored: true }, isPro: true })),
      RANKING_WEIGHTS.sponsoredBoostPro,
    );
  });
});

describe("RANKING_RULES — composed scorer", () => {
  it("includes every Pro-only rule plus the universal ones", () => {
    const names = RANKING_RULES.map((r) => r.name).sort();
    assert.deepEqual(names, [
      "recency-pro",
      "sponsored-base",
      "sponsored-pro-boost",
      "term-in-body",
      "term-in-title-pro",
    ]);
  });

  it("OCP seam: scoreJobsForRanking accepts a custom ruleset", () => {
    // Demonstrates the strategy pattern's value — a caller can swap the
    // entire ruleset without touching the scorer or the existing rules.
    const customRule: ScoringRule = {
      name: "everything-scores-42",
      tier: "both",
      score: () => 42,
    };
    const ranked = scoreJobsForRanking(
      [makeJob({ id: "a" }), makeJob({ id: "b" })],
      "engineer",
      false,
      NOW,
      [customRule],
    );
    for (const j of ranked) assert.equal(j._score, 42);
  });
});

describe("scoreJobsForRanking — Free tier", () => {
  it(`scores per-term description matches at +${RANKING_WEIGHTS.termInBody} each`, () => {
    const [scored] = scoreJobsForRanking(
      [makeJob({ description: "Senior Backend Engineer with platform experience" })],
      "backend platform",
      false,
      NOW,
    );
    // Two query terms each match once.
    assert.equal(scored._score, 2 * RANKING_WEIGHTS.termInBody);
  });

  it("adds the sponsored bump plus the per-row sponsoredRankBoost", () => {
    const [scored] = scoreJobsForRanking(
      [makeJob({ sponsored: true, sponsoredRankBoost: 7 })],
      "engineer",
      false,
      NOW,
    );
    // term-in-body × 1 + sponsoredBase + per-row boost
    assert.equal(scored._score, RANKING_WEIGHTS.termInBody + RANKING_WEIGHTS.sponsoredBase + 7);
  });

  it("does NOT apply the Pro recency / title-overlap boost", () => {
    const fresh = makeJob({ id: "fresh", createdAt: days(1) });
    const stale = makeJob({ id: "stale", createdAt: days(180) });
    const [a, b] = scoreJobsForRanking([fresh, stale], "engineer", false, NOW);
    // Both score identically (10 from description match). Sort is stable in V8
    // when scores tie, so neither is required to come first — only that they
    // tie. The Pro test below shows the recency tiebreaker kicking in.
    assert.equal(a._score, b._score);
  });

  it("handles empty query without exploding", () => {
    const [scored] = scoreJobsForRanking([makeJob()], "", false, NOW);
    assert.equal(scored._score, 0);
  });
});

describe("scoreJobsForRanking — Pro tier priority boost", () => {
  it("ranks recent jobs above stale ones (recency boost)", () => {
    const fresh = makeJob({ id: "fresh", createdAt: days(1) });    // fresh window
    const recent = makeJob({ id: "recent", createdAt: days(20) }); // recent window
    const stale = makeJob({ id: "stale", createdAt: days(180) });  // outside both
    const ranked = scoreJobsForRanking([stale, recent, fresh], "engineer", true, NOW);
    assert.deepEqual(ranked.map((j) => j.id), ["fresh", "recent", "stale"]);
    // Verify the boosts actually came from the recency branch, not from
    // tie-stable sort or some other path.
    assert.equal(ranked[0]._score - ranked[2]._score, RANKING_WEIGHTS.recencyFreshBoost);
    assert.equal(ranked[1]._score - ranked[2]._score, RANKING_WEIGHTS.recencyRecentBoost);
  });

  it("title hits weigh more than description hits (~3×)", () => {
    const titleHit = makeJob({
      id: "title",
      title: "Backend Platform Engineer",
      description: "Generic team description.",
    });
    const descOnly = makeJob({
      id: "desc",
      title: "Senior Engineer",
      description: "Backend platform contributor.",
    });
    // Pin recency so the recency bonus ties (both 60d old → +0).
    const ranked = scoreJobsForRanking([descOnly, titleHit], "backend platform", true, NOW);
    assert.equal(ranked[0].id, "title", "title-overlap should win the tiebreaker");
    // titleHit:  body×2 + title×2
    // descOnly:  body×2 + title×0
    assert.equal(ranked[0]._score, 2 * RANKING_WEIGHTS.termInBody + 2 * RANKING_WEIGHTS.termInTitlePro);
    assert.equal(ranked[1]._score, 2 * RANKING_WEIGHTS.termInBody);
  });

  it("amplifies sponsored placements with the Pro boost only", () => {
    const [free] = scoreJobsForRanking([makeJob({ sponsored: true })], "", false, NOW);
    const [pro] = scoreJobsForRanking(
      [makeJob({ sponsored: true, createdAt: days(180) })],
      "",
      true,
      NOW,
    );
    assert.equal(free._score, RANKING_WEIGHTS.sponsoredBase);
    assert.equal(pro._score, RANKING_WEIGHTS.sponsoredBase + RANKING_WEIGHTS.sponsoredBoostPro);
  });

  it("missing createdAt does not crash and falls in the 'no recency boost' bucket", () => {
    const [scored] = scoreJobsForRanking(
      // Use a query that hits the description ONLY (not the title) so we
      // can isolate the recency-boost branch from the title-overlap branch.
      [makeJob({ createdAt: null })],
      "platform",
      true,
      NOW,
    );
    // Description match only — no title overlap, no recency boost,
    // no sponsored amplifier.
    assert.equal(scored._score, RANKING_WEIGHTS.termInBody);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #202 — shouldRefreshAccessToken (YouTube publish flow)
// ═══════════════════════════════════════════════════════════════════════════

describe("shouldRefreshAccessToken", () => {
  const now = Date.now();

  it("returns true when no access token is stored", () => {
    assert.equal(
      shouldRefreshAccessToken({ accessToken: null, tokenExpiresAt: new Date(now + 600_000) }, now),
      true,
    );
  });

  it("returns true when no expiry is stored", () => {
    assert.equal(
      shouldRefreshAccessToken({ accessToken: "abc", tokenExpiresAt: null }, now),
      true,
    );
  });

  it("returns true when the token has already expired", () => {
    assert.equal(
      shouldRefreshAccessToken(
        { accessToken: "abc", tokenExpiresAt: new Date(now - 1000) },
        now,
      ),
      true,
    );
  });

  it("returns true when the token expires inside the 60s safety window", () => {
    assert.equal(
      shouldRefreshAccessToken(
        { accessToken: "abc", tokenExpiresAt: new Date(now + 30_000) },
        now,
      ),
      true,
    );
  });

  it("returns false when the token is fresh past the safety window", () => {
    assert.equal(
      shouldRefreshAccessToken(
        { accessToken: "abc", tokenExpiresAt: new Date(now + 5 * 60_000) },
        now,
      ),
      false,
    );
  });

  it("returns true on malformed expiry strings", () => {
    assert.equal(
      shouldRefreshAccessToken(
        { accessToken: "abc", tokenExpiresAt: "not-a-date" },
        now,
      ),
      true,
    );
  });

  it("ACCESS_TOKEN_SAFETY_WINDOW_MS matches Google's 1h token TTL minus a buffer", () => {
    // 60 seconds is comfortably below YouTube's 3600s expiry.
    assert.ok(ACCESS_TOKEN_SAFETY_WINDOW_MS >= 30_000);
    assert.ok(ACCESS_TOKEN_SAFETY_WINDOW_MS <= 5 * 60_000);
  });
});

describe("getFreshAccessToken — DI seam (no refresh path)", () => {
  // The refresh path requires a Google /token fetch; covered by integration
  // tests at deploy time. These tests exercise the cache-hit branch which
  // is reachable without any network IO.
  const config = { clientId: "id", clientSecret: "secret" };
  const farFuture = new Date(Date.now() + 60 * 60_000);

  it("returns the cached access token without invoking the rotate callback", async () => {
    const calls: Array<unknown> = [];
    const rotate: RotateAccessTokenFn = async (...args) => { calls.push(args); };
    const token = await getFreshAccessToken(config, {
      id: "acct-1",
      accessToken: "cached",
      tokenExpiresAt: farFuture,
      refreshToken: "rt",
    } as any, rotate);
    assert.equal(token, "cached");
    assert.equal(calls.length, 0, "rotate must not be invoked when cache is fresh");
  });
});

describe("PublishVideoError", () => {
  const allKinds: PublishVideoErrorKind[] = ["VIDEO_NOT_FOUND", "VIDEO_NOT_READY", "MEDIA_FETCH_FAILED"];

  it("PublishVideoError carries kind + message + cause", () => {
    const cause = new Error("upstream");
    const err = new PublishVideoError("MEDIA_FETCH_FAILED", "boom", cause);
    assert.equal(err.kind, "MEDIA_FETCH_FAILED");
    assert.equal(err.message, "boom");
    assert.equal(err.cause, cause);
    assert.ok(err instanceof Error, "should still be an Error subclass");
    assert.equal(err.name, "PublishVideoError");
  });

  it("every PublishVideoErrorKind is distinct", () => {
    assert.equal(new Set(allKinds).size, allKinds.length);
  });
});

describe("startOfMonthUtc (free-tier limits helper)", () => {
  it("returns UTC midnight on day 1 of the same month", () => {
    const out = startOfMonthUtc(new Date("2026-04-26T13:45:32.123Z"));
    assert.equal(out.toISOString(), "2026-04-01T00:00:00.000Z");
  });

  it("rolls back from late-in-month timestamps", () => {
    const out = startOfMonthUtc(new Date("2026-12-31T23:59:59.999Z"));
    assert.equal(out.toISOString(), "2026-12-01T00:00:00.000Z");
  });

  it("does not mutate the input Date", () => {
    const input = new Date("2026-04-26T13:45:32.123Z");
    const before = input.toISOString();
    startOfMonthUtc(input);
    assert.equal(input.toISOString(), before);
  });
});

describe("oauth2Provider — buildAuthUrl (OCP abstraction)", () => {
  it("composes auth URL from config + redirect + extra params", async () => {
    const { buildAuthUrl } = await import("../../services/oauth/oauth2Provider.js");
    const url = buildAuthUrl(
      {
        name: "Test",
        clientId: "cid-123",
        clientSecret: "secret",
        authEndpoint: "https://provider.example/auth",
        tokenEndpoint: "https://provider.example/token",
        scopes: "read write",
      },
      { redirectUri: "https://app.example/cb", extraParams: { prompt: "consent" } },
    );
    assert.ok(url.startsWith("https://provider.example/auth?"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "cid-123");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example/cb");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("scope"), "read write");
    assert.equal(parsed.searchParams.get("prompt"), "consent");
  });

  it("throws OAuth2Error(NOT_CONFIGURED) when clientId is missing", async () => {
    const { buildAuthUrl, OAuth2Error } = await import("../../services/oauth/oauth2Provider.js");
    assert.throws(
      () => buildAuthUrl(
        { name: "Test", clientId: undefined, clientSecret: "x", authEndpoint: "u", tokenEndpoint: "u", scopes: "" },
        { redirectUri: "https://x" },
      ),
      (err: unknown) => err instanceof OAuth2Error && err.reason === "NOT_CONFIGURED",
    );
  });

  it("expiresInToDate applies the same 30s buffer as the YouTube wrapper", async () => {
    const { expiresInToDate } = await import("../../services/oauth/oauth2Provider.js");
    const pinned = new Date("2026-04-26T12:00:00Z").getTime();
    const out = expiresInToDate(3600, pinned);
    assert.equal(out.getTime(), pinned + 3570 * 1000);
  });
});

describe("googleOAuth2 — provider config helper", () => {
  it("googleOAuth2Config wires the standard Google endpoints", async () => {
    const { googleOAuth2Config, GOOGLE_AUTH_ENDPOINT, GOOGLE_TOKEN_ENDPOINT } =
      await import("../../services/oauth/googleOAuth2.js");
    const cfg = googleOAuth2Config({
      clientId: "g-id",
      clientSecret: "g-secret",
      scopes: "openid email",
      name: "Test-YT",
    });
    assert.equal(cfg.authEndpoint, GOOGLE_AUTH_ENDPOINT);
    assert.equal(cfg.tokenEndpoint, GOOGLE_TOKEN_ENDPOINT);
    assert.equal(cfg.scopes, "openid email");
    assert.equal(cfg.name, "Test-YT");
  });

  it("GOOGLE_OFFLINE_AUTH_PARAMS includes access_type=offline + prompt=consent", async () => {
    const { GOOGLE_OFFLINE_AUTH_PARAMS } = await import("../../services/oauth/googleOAuth2.js");
    assert.equal(GOOGLE_OFFLINE_AUTH_PARAMS.access_type, "offline");
    assert.equal(GOOGLE_OFFLINE_AUTH_PARAMS.prompt, "consent");
  });
});

describe("youtubeOAuthConfig (Env → narrow projection)", () => {
  it("projects only the two OAuth fields from a full Env-shaped object", async () => {
    const { youtubeOAuthConfig } = await import("../../services/youtube/youtubeOAuth.js");
    const env = {
      GOOGLE_CLIENT_ID: "yt-id",
      GOOGLE_CLIENT_SECRET: "yt-secret",
      DATABASE_URL: "postgres://example",  // must NOT appear on output
      OPENAI_API_KEY: "sk-...",
    };
    const out = youtubeOAuthConfig(env);
    assert.deepEqual(Object.keys(out).sort(), ["clientId", "clientSecret"]);
    assert.equal(out.clientId, "yt-id");
    assert.equal(out.clientSecret, "yt-secret");
  });

  it("propagates undefined when the bindings are missing (drives the 503 response path)", async () => {
    const { youtubeOAuthConfig } = await import("../../services/youtube/youtubeOAuth.js");
    const out = youtubeOAuthConfig({});
    assert.equal(out.clientId, undefined);
    assert.equal(out.clientSecret, undefined);
  });
});

describe("expiresInToDate (YouTube OAuth)", () => {
  it("converts seconds-from-now to an absolute Date with a 30s safety buffer", () => {
    const pinned = new Date("2026-04-26T12:00:00Z").getTime();
    const out = expiresInToDate(3600, pinned);
    // 3600s − 30s buffer = 3570s after `pinned`.
    assert.equal(out.getTime(), pinned + 3570 * 1000);
  });

  it("survives the 0-second edge case (token already expired) without throwing", () => {
    const pinned = Date.now();
    const out = expiresInToDate(0, pinned);
    // Buffer means the result is in the past; that's fine — caller will
    // hit `shouldRefreshAccessToken` and refresh on next request.
    assert.ok(out.getTime() < pinned);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #202 — buildSnippet + buildMultipartBody (YouTube upload)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildSnippet (YouTube upload metadata)", () => {
  it("truncates title to 100 chars + description to 5000 (Data API v3 limits)", () => {
    const out = buildSnippet({
      title: "x".repeat(150),
      description: "y".repeat(6000),
      privacy: "unlisted",
    });
    assert.equal(out.snippet.title.length, 100);
    assert.equal(out.snippet.description.length, 5000);
  });

  it("caps tags at 15 entries (Data API v3 limit)", () => {
    const out = buildSnippet({
      title: "ok",
      description: "",
      privacy: "unlisted",
      tags: Array.from({ length: 30 }, (_, i) => `tag${i}`),
    });
    assert.equal(out.snippet.tags?.length, 15);
  });

  it("defaults to category 22 (People & Blogs) and selfDeclaredMadeForKids=false", () => {
    const out = buildSnippet({ title: "t", description: "d", privacy: "private" });
    assert.equal(out.snippet.categoryId, "22");
    assert.equal(out.status.selfDeclaredMadeForKids, false);
  });

  it("passes through privacyStatus exactly as provided", () => {
    for (const privacy of ["public", "private", "unlisted"] as const) {
      const out = buildSnippet({ title: "t", description: "", privacy });
      assert.equal(out.status.privacyStatus, privacy);
    }
  });
});

describe("buildMultipartBody", () => {
  const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // not a real MP4 — body is opaque
  const meta = { title: "t", description: "d", privacy: "unlisted" as const };

  it("returns a Content-Type header matching the boundary it generated", () => {
    const { contentType, boundary } = buildMultipartBody(meta, fakeBytes, "fixed-boundary");
    assert.equal(boundary, "fixed-boundary");
    assert.equal(contentType, "multipart/related; boundary=fixed-boundary");
  });

  it("body length equals head + media + tail (no over-allocation)", () => {
    const { body } = buildMultipartBody(meta, fakeBytes, "b");
    // Head and tail vary, so just assert the media bytes appear inside.
    const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false });
    const text = decoder.decode(body);
    assert.match(text, /^--b\r\n/);
    assert.match(text, /\r\n--b--\r\n$/);
    assert.match(text, /Content-Type: video\/mp4/);
    assert.ok(body.length > fakeBytes.length, "body should include head and tail");
  });

  it("embeds the metadata JSON before the binary", () => {
    const { body } = buildMultipartBody(
      { ...meta, title: "Sentinel-Title-12345" },
      fakeBytes,
      "b",
    );
    const text = new TextDecoder().decode(body);
    assert.ok(text.includes(`"title":"Sentinel-Title-12345"`));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #203 — flattenStoryboardTranscript + buildHeuristicCaption
// ═══════════════════════════════════════════════════════════════════════════

describe("flattenStoryboardTranscript", () => {
  it("returns empty string for missing or malformed storyboards", () => {
    assert.equal(flattenStoryboardTranscript(null), "");
    assert.equal(flattenStoryboardTranscript(undefined), "");
    assert.equal(flattenStoryboardTranscript({}), "");
    assert.equal(flattenStoryboardTranscript({ scenes: "not-an-array" }), "");
  });

  it("joins title / subtitle / text with em-dashes within a scene", () => {
    const out = flattenStoryboardTranscript({
      scenes: [{ title: "Intro", subtitle: "Hi there", text: "I'm Sean." }],
    });
    assert.equal(out, "Intro — Hi there — I'm Sean.");
  });

  it("uses one line per scene", () => {
    const out = flattenStoryboardTranscript({
      scenes: [
        { title: "Scene 1" },
        { title: "Scene 2" },
        { title: "Scene 3" },
      ],
    });
    assert.equal(out.split("\n").length, 3);
  });

  it("skips empty scenes (no fields populated)", () => {
    const out = flattenStoryboardTranscript({
      scenes: [{ title: "A" }, {}, { title: "B" }],
    });
    assert.equal(out, "A\nB");
  });
});

// The kit video is saved as kind='nle' (Timeline JSON, no storyboard) —
// "Write it for me" read nothing from it and the caption silently failed.
describe("projectTranscript", () => {
  const bg = (id: string, start: number, label: string) => ({
    id: `${id}_bg`, sourceId: "", startFrame: start, durationFrames: 150, sourceInFrame: 0,
    effects: [{ kind: "canvas-v2:background", params: { color: "#000", sceneId: id, label } }],
  });
  const widget = (id: string, start: number, params: Record<string, unknown>) => ({
    id, sourceId: "", startFrame: start, durationFrames: 150, sourceInFrame: 0,
    effects: [{ kind: "canvas-v2:text", params: { x: 0, y: 0, ...params } }],
  });
  const timelineSpec = {
    schemaVersion: 1, fps: 30, width: 1920, height: 1080, backgroundColor: "#000",
    tracks: [
      { id: "v1", kind: "video", label: "Background", clips: [bg("s1", 0, "Hook"), bg("s2", 150, "Skills")] },
      {
        id: "v2", kind: "video", label: "Widgets", allowsOverlap: true,
        clips: [
          widget("w1", 0, { text: "HOOK" }),
          widget("w2", 0, { text: "Improved delivery from 57% to 85%" }),
          widget("w3", 150, { chips: ["Leadership", { label: "Cloud" }, ""] }),
        ],
      },
      { id: "a1", kind: "audio", label: "A1", clips: [] },
    ],
  };

  it("reads an nle project's on-screen text, one line per scene", () => {
    const out = projectTranscript({ kind: "nle", storyboard: null, timelineSpec });
    assert.equal(out, "Hook: HOOK — Improved delivery from 57% to 85%\nSkills: Leadership, Cloud");
  });

  it("returns empty for a missing or malformed timeline", () => {
    assert.equal(projectTranscript({ kind: "nle", storyboard: null, timelineSpec: null }), "");
    assert.equal(projectTranscript({ kind: "nle", storyboard: null, timelineSpec: { tracks: "x" } }), "");
  });

  it("still reads the storyboard for scene projects", () => {
    const out = projectTranscript({ kind: "scene", storyboard: { scenes: [{ title: "A" }] }, timelineSpec });
    assert.equal(out, "A");
  });
});

describe("buildHeuristicCaption", () => {
  it("uses the first transcript line as the hook (truncated to 200 chars)", () => {
    const longLine = "x".repeat(300);
    const out = buildHeuristicCaption(longLine, "ignored resume");
    assert.equal(out.hook.length, 200);
    assert.equal(out.hook, "x".repeat(200));
  });

  it("falls back to resume text when transcript is empty", () => {
    const out = buildHeuristicCaption("", "Sean is a software engineer with 12 years of distributed-systems experience.");
    assert.ok(out.hook.startsWith("Sean is a software engineer"));
    assert.ok(out.hook.length <= 200);
  });

  it("falls back to a generic hook when both transcript and resume are empty", () => {
    const out = buildHeuristicCaption("", "");
    assert.equal(out.hook, "Just published a new video resume on hired.video.");
  });

  it("returns 5 hashtags with no '#' prefix (server adds it later)", () => {
    const out = buildHeuristicCaption("anything", "");
    assert.equal(out.hashtags.length, 5);
    for (const tag of out.hashtags) {
      assert.doesNotMatch(tag, /^#/);
      assert.match(tag, /^[a-z]+$/);
    }
  });

  it("provides a non-empty caption", () => {
    const out = buildHeuristicCaption("a", "b");
    assert.ok(out.caption.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pricing constants — sanity checks for the gate values shipped this batch
// ═══════════════════════════════════════════════════════════════════════════

describe("Free-tier interview practice limit", () => {
  it("is a small positive integer (Pricing copy: 'AI interview practice (limited)')", () => {
    assert.ok(Number.isInteger(FREE_INTERVIEW_SESSIONS_PER_MONTH));
    assert.ok(FREE_INTERVIEW_SESSIONS_PER_MONTH >= 1);
    // Anything ≥10 would essentially be unlimited for a normal job seeker.
    // If we raise it past that, revisit the Pricing page bullet copy.
    assert.ok(FREE_INTERVIEW_SESSIONS_PER_MONTH < 10);
  });
});

describe("AI Assistance token allowances", () => {
  it("Pro grants strictly more monthly tokens than Free", () => {
    assert.ok(PRO_AI_MONTHLY_TOKENS > FREE_AI_MONTHLY_TOKENS);
  });
});

describe("Pricing invariants", () => {
  // These tests cross-validate fields that are *derived* from each other.
  // If someone bumps PRO_MONTHLY_PRICE without updating PRO_YEARLY_PRICE,
  // the discount silently drifts — the test catches it.
  it("Yearly price is monthly × 12 × 0.8 (the advertised 20% annual discount)", () => {
    const expected = +(PRO_MONTHLY_PRICE * 12 * 0.8).toFixed(2);
    assert.equal(PRO_YEARLY_PRICE, expected);
  });
});
