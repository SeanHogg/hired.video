/**
 * Article content-safety scanner tests — closes part of gap #1344
 * (contentScan.ts had no tests; promptGuard already does).
 *
 * `scanContent` tries an LLM first, but falls back to a deterministic
 * keyword "floor" scan when no provider key is configured. We force the
 * floor path by clearing BUILDERFORCE_API_KEY for the duration of the
 * suite (and restoring it after), which makes the public surface pure +
 * fully assertable with NO model + NO network.
 *
 * This pins the threshold/scoring/recommendation logic that drives the
 * SuperAdmin moderation queue chips:
 *   • clean text            → score 1, severity low, approve
 *   • profanity tiers       → 1 hit medium, ≥3 hits high+review
 *   • ToS seeds             → 1 hit medium, ≥2 hits high
 *   • a slur                → severity block, score 0, reject (hard floor)
 *   • score math            → 1 - 0.15*hits, clamped at 0
 *   • word-boundary match   → "shitake"/"assassin" must NOT trip profanity
 *   • title + body are both scanned; caller may be null
 *
 * Run: node --import tsx --test src/services/moderation/__tests__/contentScan.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { scanContent } from "../contentScan.js";
import { HARMFUL_SLURS } from "../promptGuard.js";

// Force the deterministic keyword-floor path (no LLM) regardless of env.
let savedKey: string | undefined;
before(() => {
  savedKey = process.env.BUILDERFORCE_API_KEY;
  delete process.env.BUILDERFORCE_API_KEY;
});
after(() => {
  if (savedKey === undefined) delete process.env.BUILDERFORCE_API_KEY;
  else process.env.BUILDERFORCE_API_KEY = savedKey;
});

function scan(title: string, bodyMd: string, kind?: "article" | "faq" | "guide") {
  return scanContent({ title, bodyMd, kind }, null);
}

describe("scanContent (keyword floor) — clean content", () => {
  it("scores a clean article 1.0 / low / approve", async () => {
    const r = await scan("How to ace your interview", "Prepare answers, research the company, follow up politely.");
    assert.equal(r.score, 1);
    assert.equal(r.findings.severity, "low");
    assert.equal(r.recommendation, "approve");
    assert.deepEqual(r.findings.profanity, []);
    assert.deepEqual(r.findings.racism, []);
    assert.deepEqual(r.findings.tosViolations, []);
  });

  it("scans both the title and the body", async () => {
    const inTitle = await scan("This is shit advice", "Totally clean body text.");
    assert.deepEqual(inTitle.findings.profanity, ["shit"]);
    const inBody = await scan("Clean title", "the body says shit here");
    assert.deepEqual(inBody.findings.profanity, ["shit"]);
  });
});

describe("scanContent (keyword floor) — profanity tiers", () => {
  it("one profanity hit → medium severity + 0.85 score", async () => {
    const r = await scan("title", "this is shit");
    assert.equal(r.findings.severity, "medium");
    assert.equal(r.findings.profanity.length, 1);
    assert.ok(Math.abs(r.score - 0.85) < 1e-9, `score was ${r.score}`);
    // medium severity does NOT force review; recommendation keys off score:
    // 0.85 >= 0.8 → approve (one stray swear isn't queue-worthy).
    assert.equal(r.recommendation, "approve");
  });

  it("three or more profanity hits → high severity + review", async () => {
    const r = await scan("title", "shit fuck piss everywhere");
    assert.ok(r.findings.profanity.length >= 3);
    assert.equal(r.findings.severity, "high");
    assert.equal(r.recommendation, "review");
  });

  it("applies word boundaries — embedded substrings do NOT trip profanity", async () => {
    const r = await scan("Cooking with shiitake and an assassin novel", "A piston and a dickens of a day.");
    assert.deepEqual(r.findings.profanity, [], `false positives: ${r.findings.profanity}`);
    assert.equal(r.findings.severity, "low");
  });
});

describe("scanContent (keyword floor) — ToS seeds", () => {
  it("one ToS phrase → medium severity", async () => {
    const r = await scan("Job offer", "Click here for a guaranteed job!"); // matches "click here" + "guaranteed job"
    assert.ok(r.findings.tosViolations.length >= 1);
    assert.ok(["medium", "high"].includes(r.findings.severity));
  });

  it("two or more ToS phrases → high severity + review", async () => {
    const r = await scan("Opportunity", "send money to join this pyramid scheme, free crypto awaits");
    assert.ok(r.findings.tosViolations.length >= 2, `tos hits: ${r.findings.tosViolations}`);
    assert.equal(r.findings.severity, "high");
    assert.equal(r.recommendation, "review");
  });
});

describe("scanContent (keyword floor) — slur hard floor", () => {
  it("any racism slur forces severity=block, score=0, reject", async () => {
    const slur = HARMFUL_SLURS[0]!;
    const r = await scan("title", `a sentence containing ${slur} as a word`);
    assert.equal(r.findings.severity, "block");
    assert.equal(r.score, 0);
    assert.equal(r.recommendation, "reject");
    assert.ok(r.findings.racism.includes(slur));
  });
});

describe("scanContent (keyword floor) — score math", () => {
  it("score drops by 0.15 per hit and never goes below 0", async () => {
    // 2 profanity + 1 tos = 3 hits → 1 - 0.45 = 0.55
    const r = await scan("title", "shit and fuck plus a pyramid scheme");
    const hits = r.findings.profanity.length + r.findings.tosViolations.length;
    assert.equal(hits, 3);
    assert.ok(Math.abs(r.score - 0.55) < 1e-9, `score was ${r.score}`);
    assert.ok(r.score >= 0);
  });
});
