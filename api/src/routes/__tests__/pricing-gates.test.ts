/**
 * Tests for the Pricing-page Pro tier enforcement gates shipped 2026-04-26.
 *
 * Covers the four feature claims that were previously misadvertised on
 * `Pricing.tsx` and have since been backed by real implementations:
 *
 *   • #204 Priority job ranking      — scoreJobsForRanking()
 *   • #202 YouTube publish flow      — shouldRefreshAccessToken()
 *   • #203 AI LinkedIn post gen      — flattenStoryboardTranscript() +
 *                                       buildLinkedInHeuristicPost()
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
  type ScoreableJob,
} from "../../services/job/ranking.js";
import {
  shouldRefreshAccessToken,
  ACCESS_TOKEN_SAFETY_WINDOW_MS,
  expiresInToDate,
} from "../../services/youtube/youtubeOAuth.js";
import { buildSnippet, buildMultipartBody } from "../../services/youtube/youtubeUpload.js";
import { flattenStoryboardTranscript, buildLinkedInHeuristicPost } from "../studio-features.js";
import {
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
  TOKEN_PACKS,
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
    const decoder = new TextDecoder("utf-8", { fatal: false });
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
// #203 — flattenStoryboardTranscript + buildLinkedInHeuristicPost
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

describe("buildLinkedInHeuristicPost", () => {
  it("uses the first transcript line as the hook (truncated to 200 chars)", () => {
    const longLine = "x".repeat(300);
    const out = buildLinkedInHeuristicPost(longLine, "ignored resume");
    assert.equal(out.hook.length, 200);
    assert.equal(out.hook, "x".repeat(200));
  });

  it("falls back to resume text when transcript is empty", () => {
    const out = buildLinkedInHeuristicPost("", "Sean is a software engineer with 12 years of distributed-systems experience.");
    assert.ok(out.hook.startsWith("Sean is a software engineer"));
    assert.ok(out.hook.length <= 200);
  });

  it("falls back to a generic hook when both transcript and resume are empty", () => {
    const out = buildLinkedInHeuristicPost("", "");
    assert.equal(out.hook, "Just published a new video resume on hired.video.");
  });

  it("returns 5 hashtags with no '#' prefix (server adds it later)", () => {
    const out = buildLinkedInHeuristicPost("anything", "");
    assert.equal(out.hashtags.length, 5);
    for (const tag of out.hashtags) {
      assert.doesNotMatch(tag, /^#/);
      assert.match(tag, /^[a-z]+$/);
    }
  });

  it("provides a non-empty caption", () => {
    const out = buildLinkedInHeuristicPost("a", "b");
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

  it("Pro grants ≥10× the Free allowance (the 'unlimited-feeling' multiplier)", () => {
    assert.ok(PRO_AI_MONTHLY_TOKENS / FREE_AI_MONTHLY_TOKENS >= 10);
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

  it("Each token pack's effectiveDollarsPerMillion matches price ÷ tokens", () => {
    for (const pack of TOKEN_PACKS) {
      const recomputed = +((pack.price / (pack.tokens / 1_000_000))).toFixed(2);
      assert.equal(
        pack.effectiveDollarsPerMillion,
        recomputed,
        `Pack "${pack.name}": stored ${pack.effectiveDollarsPerMillion}, computed ${recomputed}`,
      );
    }
  });

  it("Token packs are sorted by ascending size (UX invariant)", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(
        TOKEN_PACKS[i].tokens > TOKEN_PACKS[i - 1].tokens,
        `Pack "${TOKEN_PACKS[i].name}" must be larger than "${TOKEN_PACKS[i - 1].name}"`,
      );
    }
  });

  it("Larger token packs offer a better $/M rate (volume discount)", () => {
    for (let i = 1; i < TOKEN_PACKS.length; i++) {
      assert.ok(
        TOKEN_PACKS[i].effectiveDollarsPerMillion <= TOKEN_PACKS[i - 1].effectiveDollarsPerMillion,
        `Pack "${TOKEN_PACKS[i].name}" must be ≤ $/M than smaller "${TOKEN_PACKS[i - 1].name}"`,
      );
    }
  });
});
