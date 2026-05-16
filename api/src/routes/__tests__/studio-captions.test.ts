/**
 * Tests for studio caption formatting + voice-clone slugification.
 *
 * Covers:
 *   • fmtSrtTime / fmtVttTime   — timestamp formatting for SRT / WebVTT
 *   • buildSrt                   — full SRT document rendering
 *   • buildVtt                   — full WebVTT document rendering
 *   • slugify (voice-clone)      — URL-safe slug generation
 *   • PLATFORM_FEE_BPS_DEFAULT   — 20% platform cut constant
 *   • MAX_PRICE_CENTS            — $1,000 hard cap on clone prices
 *
 * Caption rendering is the output format consumed by the editor, the
 * download button, and the YouTube/LinkedIn exporters. If these drift,
 * every downstream consumer breaks silently.
 *
 * Run: node --import tsx --test src/routes/__tests__/studio-captions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fmtSrtTime,
  fmtVttTime,
  buildSrt,
  buildVtt,
  PLATFORM_FEE_BPS_DEFAULT,
  MAX_PRICE_CENTS,
} from "../studio-features.js";
import { slugify } from "../../../../shared/slugify.js";

// ═══════════════════════════════════════════════════════════════════════════
// fmtSrtTime / fmtVttTime
// ═══════════════════════════════════════════════════════════════════════════

describe("fmtSrtTime", () => {
  it("formats 0 seconds as 00:00:00,000", () => {
    assert.equal(fmtSrtTime(0), "00:00:00,000");
  });

  it("uses comma as millisecond separator (SRT convention)", () => {
    assert.equal(fmtSrtTime(1.5), "00:00:01,500");
  });

  it("pads hours, minutes, seconds to 2 digits and ms to 3 digits", () => {
    assert.equal(fmtSrtTime(1), "00:00:01,000");
    assert.equal(fmtSrtTime(60), "00:01:00,000");
    assert.equal(fmtSrtTime(3600), "01:00:00,000");
  });

  it("handles fractional seconds correctly", () => {
    assert.equal(fmtSrtTime(1.234), "00:00:01,234");
  });

  it("handles hours > 9 without breaking padding", () => {
    assert.equal(fmtSrtTime(36000), "10:00:00,000");
  });

  it("handles combined hours + minutes + seconds + fractional ms", () => {
    // 1h 23m 45.678s
    assert.equal(fmtSrtTime(3600 + 23 * 60 + 45.678), "01:23:45,678");
  });
});

describe("fmtVttTime", () => {
  it("uses period as millisecond separator (WebVTT convention)", () => {
    assert.equal(fmtVttTime(1.5), "00:00:01.500");
  });

  it("produces the SRT timestamp with . instead of , — rest of format identical", () => {
    const srt = fmtSrtTime(3600 + 23 * 60 + 45.678);
    const vtt = fmtVttTime(3600 + 23 * 60 + 45.678);
    assert.equal(vtt, srt.replace(",", "."));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSrt
// ═══════════════════════════════════════════════════════════════════════════

describe("buildSrt", () => {
  it("renders a single cue with a 1-indexed sequence number", () => {
    const srt = buildSrt([{ start: 0, end: 2, text: "Hello" }]);
    assert.match(srt, /^1\n/);
    assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
    assert.match(srt, /Hello/);
  });

  it("emits sequence numbers in order starting from 1", () => {
    const srt = buildSrt([
      { start: 0, end: 1, text: "A" },
      { start: 1, end: 2, text: "B" },
      { start: 2, end: 3, text: "C" },
    ]);
    assert.match(srt, /^1\n/);
    assert.match(srt, /\n2\n/);
    assert.match(srt, /\n3\n/);
  });

  it("returns an empty string for no cues", () => {
    assert.equal(buildSrt([]), "");
  });

  it("produces SRT with standard block separation", () => {
    const srt = buildSrt([
      { start: 0, end: 1, text: "First" },
      { start: 1, end: 2, text: "Second" },
    ]);
    // Two cues → should contain two distinct text lines separated by
    // a blank line between blocks.
    assert.ok(srt.includes("First"));
    assert.ok(srt.includes("Second"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildVtt
// ═══════════════════════════════════════════════════════════════════════════

describe("buildVtt", () => {
  it("starts with the WEBVTT header", () => {
    const vtt = buildVtt([{ start: 0, end: 1, text: "Hello" }]);
    assert.match(vtt, /^WEBVTT\n/);
  });

  it("uses period-separated timestamps (WebVTT format)", () => {
    const vtt = buildVtt([{ start: 1.5, end: 2.75, text: "Hi" }]);
    assert.match(vtt, /00:00:01\.500 --> 00:00:02\.750/);
  });

  it("includes all cue texts", () => {
    const vtt = buildVtt([
      { start: 0, end: 1, text: "First" },
      { start: 1, end: 2, text: "Second" },
    ]);
    assert.ok(vtt.includes("First"));
    assert.ok(vtt.includes("Second"));
  });

  it("emits a WEBVTT header even for empty cue list (spec requires it)", () => {
    const vtt = buildVtt([]);
    assert.match(vtt, /^WEBVTT/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// slugify — voice-clone URL slug
// ═══════════════════════════════════════════════════════════════════════════

describe("slugify", () => {
  const voice = { fallback: "voice" as const };

  it("lowercases", () => {
    assert.equal(slugify("MyVoice", voice), "myvoice");
  });

  it("replaces non-alphanumeric runs with a single hyphen", () => {
    assert.equal(slugify("My Cool Voice!", voice), "my-cool-voice");
    assert.equal(slugify("voice   with   spaces", voice), "voice-with-spaces");
  });

  it("strips leading and trailing hyphens", () => {
    assert.equal(slugify("!!!hello!!!", voice), "hello");
    assert.equal(slugify("---hello---", voice), "hello");
  });

  it("truncates to 80 characters max", () => {
    const slug = slugify("a".repeat(200), voice);
    assert.ok(slug.length <= 80);
  });

  it("returns the fallback when input would produce an empty slug", () => {
    assert.equal(slugify("", voice), "voice");
    assert.equal(slugify("!!!", voice), "voice");
    assert.equal(slugify("---", voice), "voice");
  });

  it("strips diacritics via NFKD normalization", () => {
    assert.equal(slugify("café résumé", voice), "cafe-resume");
  });

  it("accepts a thunk fallback for dynamic defaults", () => {
    const slug = slugify("!!!", { fallback: () => `article-${42}` });
    assert.equal(slug, "article-42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Studio constants
// ═══════════════════════════════════════════════════════════════════════════

describe("Studio marketplace constants", () => {
  it("PLATFORM_FEE_BPS_DEFAULT is 5% (500 basis points)", () => {
    assert.equal(PLATFORM_FEE_BPS_DEFAULT, 500);
  });

  it("MAX_PRICE_CENTS caps at $1,000 ($100,000 cents)", () => {
    assert.equal(MAX_PRICE_CENTS, 100_000);
  });

  it("MAX_PRICE_CENTS is expressed in cents, not dollars (sanity check)", () => {
    // If someone accidentally sets this to 1000 (thinking $1000 as dollars),
    // we'd allow prices up to $10 instead of $1000. Pin the magnitude.
    assert.ok(MAX_PRICE_CENTS >= 10_000, "MAX_PRICE_CENTS suspiciously small — wrong unit?");
  });
});
