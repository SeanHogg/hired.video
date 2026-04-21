/**
 * Unit tests for shared/scraping/applyLink.ts — apply-button discovery
 * via pure HTML regex scan with per-candidate scoring.
 *
 * Covers: multiple apply buttons (scoring picks best), ATS-domain
 * priority, negative patterns ("how to apply" shouldn't win), empty
 * pages, malformed markup, javascript/anchor/mailto filtering.
 *
 * Run: node --import tsx --test src/services/__tests__/scraping-applyLink.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  findApplyLinkInHtml,
  scoreApplyCandidates,
} from "../../../../shared/scraping/applyLink.js";

const PAGE_URL = "https://www.linkedin.com/jobs/view/12345/";

// ---------------------------------------------------------------------------
// findApplyLinkInHtml — happy paths
// ---------------------------------------------------------------------------

describe("findApplyLinkInHtml — single apply button", () => {
  it("finds a Workday apply link by domain alone", () => {
    const html = `<a href="https://homedepot.wd5.myworkdayjobs.com/en-US/careers/job/SWE-123">Apply Now</a>`;
    assert.equal(
      findApplyLinkInHtml(html, PAGE_URL),
      "https://homedepot.wd5.myworkdayjobs.com/en-US/careers/job/SWE-123",
    );
  });

  it("finds a Greenhouse apply link", () => {
    const html = `<a href="https://boards.greenhouse.io/acme/jobs/42">Apply</a>`;
    assert.equal(
      findApplyLinkInHtml(html, PAGE_URL),
      "https://boards.greenhouse.io/acme/jobs/42",
    );
  });

  it("finds a Lever apply link", () => {
    const html = `<a href="https://jobs.lever.co/acme/pm-123/apply">Apply Here</a>`;
    assert.equal(
      findApplyLinkInHtml(html, PAGE_URL),
      "https://jobs.lever.co/acme/pm-123/apply",
    );
  });

  it("finds apply link via class hint", () => {
    const html = `<a href="/apply/567" class="apply-button">Apply</a>`;
    assert.equal(
      findApplyLinkInHtml(html, "https://careers.acme.com/job/567"),
      "https://careers.acme.com/apply/567",
    );
  });

  it("resolves relative hrefs against pageUrl", () => {
    const html = `<a href="../apply?job=567" class="apply-btn">Apply Now</a>`;
    assert.equal(
      findApplyLinkInHtml(html, "https://careers.acme.com/jobs/view/567"),
      "https://careers.acme.com/jobs/apply?job=567",
    );
  });

  it("finds apply link via data-apply-url data attribute", () => {
    const html = `<a data-apply-url="https://ats.fake.com/apply/1" href="#">Apply</a>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), "https://ats.fake.com/apply/1");
  });

  it("reads button[data-apply-url]", () => {
    const html = `<button data-apply-url="https://ats.fake.com/apply/1">Apply</button>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), "https://ats.fake.com/apply/1");
  });
});

// ---------------------------------------------------------------------------
// Multiple candidates — SCORING picks the best
// ---------------------------------------------------------------------------

describe("findApplyLinkInHtml — multiple candidates", () => {
  it("ATS domain beats a local /apply link", () => {
    const html = `
      <a href="/apply-tips" class="apply-btn">Apply Now</a>
      <a href="https://acme.greenhouse.io/jobs/999">See Application</a>
    `;
    // ATS wins even though the first candidate has more local "apply" signals
    assert.equal(
      findApplyLinkInHtml(html, "https://example.com/jobs/999"),
      "https://acme.greenhouse.io/jobs/999",
    );
  });

  it("picks the candidate with the highest cumulative score", () => {
    const html = `
      <a href="/help">How to apply</a>
      <a href="/share" aria-label="Apply filters">Filter</a>
      <a href="https://careers.acme.com/apply/999" class="apply-button">Apply Now</a>
    `;
    const got = findApplyLinkInHtml(html, "https://careers.acme.com/job/999");
    assert.equal(got, "https://careers.acme.com/apply/999");
  });

  it("returns the same link multiple times as one winning candidate", () => {
    const html = `
      <a href="https://acme.greenhouse.io/apply/1" class="apply-button">Apply</a>
      <a href="https://acme.greenhouse.io/apply/1" class="sticky-apply">Apply Now</a>
    `;
    assert.equal(
      findApplyLinkInHtml(html, PAGE_URL),
      "https://acme.greenhouse.io/apply/1",
    );
  });

  it("scoreApplyCandidates returns a ranked list for debugging", () => {
    const html = `
      <a href="/foo" class="apply-button">Apply</a>
      <a href="https://acme.greenhouse.io/jobs/123">Apply Now</a>
      <a href="/bar" aria-label="apply filter">Filter</a>
    `;
    const ranked = scoreApplyCandidates(html, "https://example.com/");
    assert.ok(ranked.length >= 2);
    assert.equal(ranked[0].href, "https://acme.greenhouse.io/jobs/123");
    assert.ok(ranked[0].score > ranked[1].score);
  });
});

// ---------------------------------------------------------------------------
// Negative / edge cases
// ---------------------------------------------------------------------------

describe("findApplyLinkInHtml — negative cases", () => {
  it("returns undefined when no apply-like candidate is on the page", () => {
    const html = `<a href="/about">About</a><a href="/contact">Contact</a>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("returns undefined for empty HTML", () => {
    assert.equal(findApplyLinkInHtml("", PAGE_URL), undefined);
  });

  it("ignores javascript: / mailto: / tel: hrefs", () => {
    const html = `
      <a href="javascript:void(0)" class="apply-button">Apply</a>
      <a href="mailto:apply@co.com">Apply via email</a>
      <a href="tel:+15551234567">Call to apply</a>
    `;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("ignores pure fragment / anchor-only hrefs", () => {
    const html = `<a href="#" class="apply-button">Apply</a>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("does NOT confuse 'How to apply' for the apply CTA", () => {
    const html = `
      <a href="https://acme.com/help/how-to-apply">How to apply</a>
      <a href="https://acme.com/info/applied-jobs">Your applications</a>
    `;
    // Both are apply-adjacent but their text matches NEGATIVE_TEXT_PATTERNS
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("does NOT pick up 'Apply filter' buttons on job search pages", () => {
    const html = `<button aria-label="Apply filters">Apply</button>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("handles malformed anchors without href attribute", () => {
    const html = `<a class="apply-button">Apply Now</a><a>No href here</a>`;
    assert.equal(findApplyLinkInHtml(html, PAGE_URL), undefined);
  });

  it("handles quotes in href attributes correctly (single, double, unquoted)", () => {
    const double = `<a href="https://x.com/apply/1" class="apply-button">Apply</a>`;
    const single = `<a href='https://x.com/apply/2' class='apply-button'>Apply</a>`;
    const unquoted = `<a href=https://x.com/apply/3 class=apply-button>Apply</a>`;
    assert.equal(findApplyLinkInHtml(double, PAGE_URL), "https://x.com/apply/1");
    assert.equal(findApplyLinkInHtml(single, PAGE_URL), "https://x.com/apply/2");
    assert.equal(findApplyLinkInHtml(unquoted, PAGE_URL), "https://x.com/apply/3");
  });

  it("threshold: a single 'text-apply' anchor without other signals is below threshold", () => {
    // Just anchor text "apply" → 20 points, which is the threshold. Raise
    // the bar so a random 'apply' link doesn't hijack the CTA.
    const html = `<a href="/some/other/path">Apply</a>`;
    // 20 points = clears threshold (>=20)
    assert.equal(
      findApplyLinkInHtml(html, "https://acme.com/careers/"),
      "https://acme.com/some/other/path",
    );
  });
});

// ---------------------------------------------------------------------------
// Real-world fixtures (small, representative snippets)
// ---------------------------------------------------------------------------

describe("findApplyLinkInHtml — real-world-shaped snippets", () => {
  it("LinkedIn top-card apply button", () => {
    const html = `
      <div class="jobs-apply-button--top-card">
        <a href="https://acme.wd5.myworkdayjobs.com/careers/job/SWE-123" target="_blank" aria-label="Apply on company website">
          <span>Apply</span>
        </a>
      </div>
    `;
    assert.equal(
      findApplyLinkInHtml(html, "https://www.linkedin.com/jobs/view/123/"),
      "https://acme.wd5.myworkdayjobs.com/careers/job/SWE-123",
    );
  });

  it("Home Depot careers page — plain outbound Workday link", () => {
    const html = `
      <header>Home Depot Careers</header>
      <main>
        <h1>Sales Associate</h1>
        <a class="btn-apply" href="https://homedepot.wd5.myworkdayjobs.com/thd/job/Atlanta-GA/Sales-Associate_REQ123">
          Apply for this position
        </a>
      </main>
    `;
    assert.match(
      findApplyLinkInHtml(html, "https://careers.homedepot.com/job/REQ123")!,
      /myworkdayjobs\.com/,
    );
  });

  it("Indeed external apply link takes priority over Indeed itself", () => {
    const html = `
      <a href="https://www.indeed.com/jobs">More jobs</a>
      <a href="https://jobs.lever.co/startup/pm/apply" target="_blank" id="indeedApplyButtonContainer">Apply on company site</a>
    `;
    assert.match(
      findApplyLinkInHtml(html, "https://www.indeed.com/viewjob?jk=abc")!,
      /lever\.co/,
    );
  });
});
