/**
 * Tests for the autofill helpers that power the Chrome extension autofill
 * flow and the web application form analyzer.
 *
 * Covers:
 *   • normalizeQuestion        — canonical form for cache lookups
 *   • hashQuestion             — stable SHA-256 of the normalised form
 *   • detectAtsProvider        — URL → ATS provider name mapping
 *   • ATS_URL_PATTERNS         — known-ATS regex coverage
 *
 * These pin the cache-key contract (two extensions hashing the same
 * question must produce the same key) and the ATS detection rules that
 * downstream UI uses to pick the right autofill strategy.
 *
 * Run: node --import tsx --test src/services/__tests__/autofill-helpers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeQuestion, hashQuestion } from "../autofill.js";
import { detectAtsProvider, ATS_URL_PATTERNS } from "../../../../shared/autofill.js";

// ═══════════════════════════════════════════════════════════════════════════
// normalizeQuestion
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeQuestion", () => {
  it("lowercases the input", () => {
    assert.equal(normalizeQuestion("Why Do You Want This Job?"), "why do you want this job");
  });

  it("strips punctuation", () => {
    assert.equal(
      normalizeQuestion("What's your greatest weakness?!"),
      "whats your greatest weakness",
    );
  });

  it("collapses runs of whitespace to a single space", () => {
    assert.equal(normalizeQuestion("tell    me\tabout\n\nyourself"), "tell me about yourself");
  });

  it("trims leading and trailing whitespace", () => {
    assert.equal(normalizeQuestion("   hello world   "), "hello world");
  });

  it("produces identical output for equivalent phrasings with different formatting", () => {
    const a = normalizeQuestion("Tell me about yourself.");
    const b = normalizeQuestion("TELL ME ABOUT YOURSELF!!!");
    const c = normalizeQuestion("tell   me about   yourself");
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it("returns empty string when the input is only punctuation + whitespace", () => {
    assert.equal(normalizeQuestion("  ?!?   ...  "), "");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// hashQuestion — SHA-256 of the normalised question
// ═══════════════════════════════════════════════════════════════════════════

describe("hashQuestion", () => {
  it("returns a 64-character hex string (SHA-256 digest)", async () => {
    const hash = await hashQuestion("Tell me about yourself");
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input always hashes to the same value", async () => {
    const a = await hashQuestion("Why do you want this job?");
    const b = await hashQuestion("Why do you want this job?");
    assert.equal(a, b);
  });

  it("produces the same hash for equivalent phrasings with different formatting", async () => {
    // This is the entire point of normalising before hashing: two sessions
    // asking "what's your greatest weakness?!" and "What's your greatest weakness"
    // should hit the same cache entry.
    const a = await hashQuestion("Tell me about yourself.");
    const b = await hashQuestion("TELL ME ABOUT YOURSELF!!!");
    assert.equal(a, b);
  });

  it("produces different hashes for different questions", async () => {
    const a = await hashQuestion("Why do you want this job?");
    const b = await hashQuestion("What are your strengths?");
    assert.notEqual(a, b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectAtsProvider — ATS URL fingerprinting
// ═══════════════════════════════════════════════════════════════════════════

describe("detectAtsProvider", () => {
  it("detects Greenhouse from boards.greenhouse.io", () => {
    assert.equal(detectAtsProvider("https://boards.greenhouse.io/acme/jobs/123"), "greenhouse");
  });

  it("detects Greenhouse embedded on a company subdomain", () => {
    assert.equal(detectAtsProvider("https://careers.acme.greenhouse.io/jobs/456"), "greenhouse");
  });

  it("detects Lever from jobs.lever.co", () => {
    assert.equal(detectAtsProvider("https://jobs.lever.co/acme/engineer"), "lever");
  });

  it("detects Workday from myworkdayjobs.com", () => {
    assert.equal(
      detectAtsProvider("https://acme.wd1.myworkdayjobs.com/Careers/job/HQ/Software-Engineer_R123"),
      "workday",
    );
    assert.equal(
      detectAtsProvider("https://acme.wd3.myworkdaysite.com/jobs/123"),
      "workday",
    );
  });

  it("detects Ashby from jobs.ashbyhq.com", () => {
    assert.equal(detectAtsProvider("https://jobs.ashbyhq.com/acme/engineer"), "ashby");
  });

  it("detects SmartRecruiters from jobs.smartrecruiters.com", () => {
    assert.equal(
      detectAtsProvider("https://jobs.smartrecruiters.com/Acme/123-software-engineer"),
      "smartrecruiters",
    );
  });

  it("detects iCIMS from .icims.com", () => {
    assert.equal(
      detectAtsProvider("https://careers-acme.icims.com/jobs/123/engineer"),
      "icims",
    );
  });

  it("detects BambooHR from .bamboohr.com/careers", () => {
    assert.equal(
      detectAtsProvider("https://acme.bamboohr.com/careers/123"),
      "bamboohr",
    );
  });

  it("returns null for URLs that do not match any known ATS", () => {
    assert.equal(detectAtsProvider("https://acme.com/careers"), null);
    assert.equal(detectAtsProvider("https://linkedin.com/jobs/view/123"), null);
    assert.equal(detectAtsProvider(""), null);
  });

  it("is case-insensitive (ATS URLs in the wild have mixed casing)", () => {
    assert.equal(detectAtsProvider("https://BOARDS.GREENHOUSE.IO/acme/jobs/1"), "greenhouse");
    assert.equal(detectAtsProvider("https://JOBS.LEVER.CO/acme/x"), "lever");
  });
});

describe("ATS_URL_PATTERNS", () => {
  it("covers all 7 supported ATS providers", () => {
    const providers = Object.keys(ATS_URL_PATTERNS).sort();
    assert.deepEqual(providers, [
      "ashby",
      "bamboohr",
      "greenhouse",
      "icims",
      "lever",
      "smartrecruiters",
      "workday",
    ]);
  });

  it("each pattern is a global-safe regex (no stateful /g flag that trips .test across calls)", () => {
    // Regexes with /g carry lastIndex state and can skip matches on
    // subsequent .test() calls — a real bug in practice. Verify none of
    // the patterns use /g.
    for (const [name, pattern] of Object.entries(ATS_URL_PATTERNS)) {
      assert.equal(pattern.global, false, `${name}: pattern must not be /g`);
    }
  });
});
