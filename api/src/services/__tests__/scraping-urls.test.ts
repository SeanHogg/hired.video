/**
 * Unit tests for shared/scraping/urls.ts — URL canonicalization, ATS
 * detection, job-board detection, and "is this a job URL" heuristics.
 *
 * Run: node --import tsx --test src/services/__tests__/scraping-urls.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeJobUrl,
  canonicalizeJobUrl,
  detectAtsProvider,
  detectJobBoard,
  looksLikeJobUrl,
  TRACKING_PARAMS,
  ATS_URL_PATTERNS,
} from "../../../../shared/scraping/urls.js";

// ---------------------------------------------------------------------------
// normalizeJobUrl
// ---------------------------------------------------------------------------

describe("normalizeJobUrl", () => {
  it("returns undefined for empty / null / undefined", () => {
    assert.equal(normalizeJobUrl(undefined), undefined);
    assert.equal(normalizeJobUrl(null), undefined);
    assert.equal(normalizeJobUrl(""), undefined);
  });

  it("returns input unchanged for non-URL strings (doesn't throw)", () => {
    assert.equal(normalizeJobUrl("not a url"), "not a url");
  });

  it("strips common LinkedIn tracking params", () => {
    const raw =
      "https://www.linkedin.com/jobs/view/12345/?refId=abc&trackingId=xyz&trk=guest&currentJobId=999";
    const out = normalizeJobUrl(raw);
    assert.ok(out);
    assert.doesNotMatch(out!, /refId/i);
    assert.doesNotMatch(out!, /trackingId/i);
    assert.doesNotMatch(out!, /trk=/i);
    assert.doesNotMatch(out!, /currentJobId/i);
  });

  it("strips UTM params", () => {
    const raw =
      "https://example.com/jobs/42?utm_source=nl&utm_medium=email&utm_campaign=april";
    const out = normalizeJobUrl(raw)!;
    assert.doesNotMatch(out, /utm_/);
  });

  it("preserves non-tracking params", () => {
    const raw = "https://example.com/jobs?location=remote&level=senior&utm_source=x";
    const out = normalizeJobUrl(raw)!;
    assert.match(out, /location=remote/);
    assert.match(out, /level=senior/);
    assert.doesNotMatch(out, /utm_source/);
  });

  it("strips trailing hash", () => {
    const raw = "https://example.com/jobs/42#detail";
    const out = normalizeJobUrl(raw)!;
    assert.doesNotMatch(out, /#detail/);
  });

  it("is idempotent", () => {
    const raw = "https://www.linkedin.com/jobs/view/1/?refId=abc";
    const once = normalizeJobUrl(raw);
    const twice = normalizeJobUrl(once);
    assert.equal(once, twice);
  });

  it("is case-insensitive on param names", () => {
    const raw = "https://example.com/jobs?UTM_SOURCE=x&TrackingID=y";
    const out = normalizeJobUrl(raw)!;
    assert.doesNotMatch(out, /utm_source/i);
    assert.doesNotMatch(out, /trackingid/i);
  });

  it("TRACKING_PARAMS is exported and non-empty", () => {
    assert.ok(TRACKING_PARAMS.size > 10);
  });
});

// ---------------------------------------------------------------------------
// canonicalizeJobUrl
// ---------------------------------------------------------------------------

describe("canonicalizeJobUrl", () => {
  it("rewrites LinkedIn collections URL with currentJobId to /jobs/view/", () => {
    const raw = "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4147842251";
    assert.equal(
      canonicalizeJobUrl(raw),
      "https://www.linkedin.com/jobs/view/4147842251/",
    );
  });

  it("keeps LinkedIn /jobs/view/ URLs stable", () => {
    const raw = "https://www.linkedin.com/jobs/view/4147842251/";
    assert.equal(canonicalizeJobUrl(raw), raw);
  });

  it("extracts jobId from /jobs/view/ even with extra path bits", () => {
    const raw = "https://www.linkedin.com/jobs/view/4147842251/?trk=search";
    assert.equal(
      canonicalizeJobUrl(raw),
      "https://www.linkedin.com/jobs/view/4147842251/",
    );
  });

  it("keeps a clean Indeed /viewjob URL stable", () => {
    const raw = "https://www.indeed.com/viewjob?jk=abc123";
    assert.equal(canonicalizeJobUrl(raw), raw);
  });

  it("rewrites an Indeed search page's vjk to the job's /viewjob URL", () => {
    assert.equal(
      canonicalizeJobUrl("https://www.indeed.com/jobs?q=cto&l=Detroit%2C+MI&vjk=9f1c2e3d4b5a6978"),
      "https://www.indeed.com/viewjob?jk=9f1c2e3d4b5a6978",
    );
    assert.equal(
      canonicalizeJobUrl("https://ca.indeed.com/viewjob?jk=abc123&from=serp&tk=xyz"),
      "https://ca.indeed.com/viewjob?jk=abc123",
    );
  });

  it("two jobs on the same Indeed search page normalize to different URLs", () => {
    const a = normalizeJobUrl("https://www.indeed.com/jobs?q=cto&l=Detroit&vjk=aaa111");
    const b = normalizeJobUrl("https://www.indeed.com/jobs?q=cto&l=Detroit&vjk=bbb222");
    assert.notEqual(a, b);
    assert.equal(a, "https://www.indeed.com/viewjob?jk=aaa111");
  });

  it("leaves an Indeed search page with no job selected untouched", () => {
    const raw = "https://www.indeed.com/jobs?q=cto";
    assert.equal(canonicalizeJobUrl(raw), raw);
  });

  it("leaves arbitrary employer careers pages untouched", () => {
    const raw = "https://careers.acme.com/jobs/senior-swe-123";
    assert.equal(canonicalizeJobUrl(raw), raw);
  });

  it("returns input unchanged for unparseable URLs", () => {
    assert.equal(canonicalizeJobUrl("not a url"), "not a url");
  });

  it("returns empty string for empty input", () => {
    assert.equal(canonicalizeJobUrl(""), "");
  });
});

// ---------------------------------------------------------------------------
// detectAtsProvider
// ---------------------------------------------------------------------------

describe("detectAtsProvider", () => {
  it("detects Greenhouse", () => {
    assert.equal(detectAtsProvider("https://boards.greenhouse.io/acme/jobs/123"), "greenhouse");
    assert.equal(detectAtsProvider("https://acme.greenhouse.io/jobs/456"), "greenhouse");
  });

  it("detects Lever", () => {
    assert.equal(detectAtsProvider("https://jobs.lever.co/startup/pm-role"), "lever");
  });

  it("detects Workday (both myworkdayjobs and myworkdaysite)", () => {
    assert.equal(
      detectAtsProvider("https://homedepot.wd5.myworkdayjobs.com/careers/job/123"),
      "workday",
    );
    assert.equal(
      detectAtsProvider("https://company.wd1.myworkdaysite.com/recruiting/job/456"),
      "workday",
    );
  });

  it("detects Ashby, SmartRecruiters, iCIMS, BambooHR", () => {
    assert.equal(detectAtsProvider("https://jobs.ashbyhq.com/acme/abc"), "ashby");
    assert.equal(detectAtsProvider("https://jobs.smartrecruiters.com/Company/role"), "smartrecruiters");
    assert.equal(detectAtsProvider("https://company.icims.com/jobs/123"), "icims");
    assert.equal(detectAtsProvider("https://company.bamboohr.com/careers/12"), "bamboohr");
  });

  it("returns null for LinkedIn, Indeed, Glassdoor (not ATS providers)", () => {
    assert.equal(detectAtsProvider("https://www.linkedin.com/jobs/view/12345"), null);
    assert.equal(detectAtsProvider("https://www.indeed.com/viewjob?jk=abc"), null);
    assert.equal(detectAtsProvider("https://www.glassdoor.com/Job/role-123"), null);
  });

  it("returns null for null / undefined / empty", () => {
    assert.equal(detectAtsProvider(null), null);
    assert.equal(detectAtsProvider(undefined), null);
    assert.equal(detectAtsProvider(""), null);
  });

  it("is case-insensitive", () => {
    assert.equal(
      detectAtsProvider("https://BOARDS.GREENHOUSE.IO/ACME/JOBS/1"),
      "greenhouse",
    );
  });

  it("ATS_URL_PATTERNS exports every supported provider", () => {
    const keys = Object.keys(ATS_URL_PATTERNS).sort();
    assert.deepEqual(keys.sort(), [
      "ashby",
      "bamboohr",
      "greenhouse",
      "icims",
      "lever",
      "smartrecruiters",
      "workday",
    ]);
  });
});

// ---------------------------------------------------------------------------
// detectJobBoard
// ---------------------------------------------------------------------------

describe("detectJobBoard", () => {
  it("detects major boards", () => {
    assert.equal(detectJobBoard("https://www.linkedin.com/jobs/view/123"), "linkedin");
    assert.equal(detectJobBoard("https://www.indeed.com/viewjob?jk=abc"), "indeed");
    assert.equal(detectJobBoard("https://www.glassdoor.com/Job/role-123"), "glassdoor");
    assert.equal(detectJobBoard("https://www.ziprecruiter.com/jobs/123"), "ziprecruiter");
    assert.equal(detectJobBoard("https://www.google.com/search?q=jobs"), "google");
    assert.equal(detectJobBoard("https://www.amazon.jobs/en/jobs/10407286/sr-sa"), "amazon");
  });

  it("returns null for ATS providers and unknown hosts", () => {
    assert.equal(detectJobBoard("https://boards.greenhouse.io/acme/jobs/123"), null);
    assert.equal(detectJobBoard("https://careers.acme.com/role/1"), null);
  });

  it("returns null for null / empty", () => {
    assert.equal(detectJobBoard(null), null);
    assert.equal(detectJobBoard(""), null);
  });

  it("does not false-positive on hostnames that *contain* a board name", () => {
    // indeed-clone.fake.com should NOT match "indeed.com"
    assert.equal(detectJobBoard("https://indeed-clone.fake.com/jobs/1"), null);
  });
});

// ---------------------------------------------------------------------------
// looksLikeJobUrl
// ---------------------------------------------------------------------------

describe("looksLikeJobUrl", () => {
  it("accepts ATS URLs unconditionally", () => {
    assert.equal(looksLikeJobUrl("https://jobs.lever.co/startup/pm"), true);
    assert.equal(looksLikeJobUrl("https://boards.greenhouse.io/co/jobs/123"), true);
  });

  it("accepts job-board URLs with /jobs path", () => {
    assert.equal(looksLikeJobUrl("https://www.linkedin.com/jobs/view/1"), true);
    assert.equal(looksLikeJobUrl("https://www.indeed.com/viewjob?jk=abc"), true);
  });

  it("rejects LinkedIn feed, profile, messaging pages", () => {
    assert.equal(looksLikeJobUrl("https://www.linkedin.com/feed/"), false);
    assert.equal(looksLikeJobUrl("https://www.linkedin.com/in/sean-hogg/"), false);
    assert.equal(looksLikeJobUrl("https://www.linkedin.com/messaging/"), false);
  });

  it("rejects hired.video own pages", () => {
    assert.equal(looksLikeJobUrl("https://hired.video/Tools/JobResumeMatch"), false);
    assert.equal(looksLikeJobUrl("https://www.hired.video/home"), false);
    assert.equal(looksLikeJobUrl("http://localhost:3000/"), false);
    assert.equal(looksLikeJobUrl("http://127.0.0.1:3000/"), false);
  });

  it("accepts generic careers URLs", () => {
    assert.equal(looksLikeJobUrl("https://careers.acme.com/jobs/eng-123"), true);
    assert.equal(looksLikeJobUrl("https://hiring.startup.io/open-positions"), true);
  });

  it("accepts Google Jobs searches", () => {
    assert.equal(
      looksLikeJobUrl("https://www.google.com/search?q=software+engineer&ibp=htl;jobs"),
      true,
    );
  });

  it("rejects company homepages on known boards", () => {
    assert.equal(looksLikeJobUrl("https://www.linkedin.com/company/acme/"), false);
  });

  it("amazon.jobs — accepts /en/jobs/{id}/{slug}, rejects /content/ marketing pages", () => {
    assert.equal(
      looksLikeJobUrl("https://www.amazon.jobs/en/jobs/10407286/sr-solutions-architect-alexa"),
      true,
    );
    // /content/ landing pages are recruiter marketing, not actual job postings.
    assert.equal(
      looksLikeJobUrl("https://www.amazon.jobs/content/en/artificial-intelligence-ai"),
      false,
    );
    assert.equal(looksLikeJobUrl("https://www.amazon.jobs/en/teams"), false);
  });

  it("rejects garbage input", () => {
    assert.equal(looksLikeJobUrl(null), false);
    assert.equal(looksLikeJobUrl(""), false);
    assert.equal(looksLikeJobUrl("not a url"), false);
  });
});
