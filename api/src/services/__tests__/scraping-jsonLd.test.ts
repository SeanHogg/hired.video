/**
 * Unit tests for shared/scraping/jsonLd.ts — JSON-LD JobPosting extraction.
 *
 * Run: node --import tsx --test src/services/__tests__/scraping-jsonLd.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractJobPostingFromHtml,
  extractJobPostingsFromHtml,
  normalizeJsonLdEmploymentType,
} from "../../../../shared/scraping/jsonLd.js";

function wrap(jobPosting: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jobPosting)}</script></head><body></body></html>`;
}

describe("extractJobPostingFromHtml — valid JobPosting", () => {
  it("extracts title, company, location, description", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Senior Engineer",
      description: "Build things.",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "San Francisco",
          addressRegion: "CA",
          addressCountry: "US",
        },
      },
    });
    const parsed = extractJobPostingFromHtml(html);
    assert.ok(parsed);
    assert.equal(parsed!.title, "Senior Engineer");
    assert.equal(parsed!.company, "Acme Corp");
    assert.equal(parsed!.location, "San Francisco, CA, US");
    assert.equal(parsed!.city, "San Francisco");
    assert.equal(parsed!.state, "CA");
    assert.equal(parsed!.country, "US");
  });

  it("extracts salary range from baseSalary.value", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Engineer",
      hiringOrganization: { name: "Co" },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 120000,
          maxValue: 180000,
          unitText: "YEAR",
        },
      },
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.salaryMin, 120000);
    assert.equal(parsed.salaryMax, 180000);
    assert.equal(parsed.salaryCurrency, "USD");
  });

  it("handles salary values as strings (some ATSes ship them that way)", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "PM",
      hiringOrganization: { name: "Co" },
      baseSalary: { currency: "USD", value: { minValue: "100000", maxValue: "150000" } },
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.salaryMin, 100000);
    assert.equal(parsed.salaryMax, 150000);
  });

  it("detects remote via jobLocationType", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "Remote SRE",
      hiringOrganization: { name: "Co" },
      jobLocationType: "TELECOMMUTE",
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.isRemote, true);
  });

  it("detects remote via 'Remote' in title", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "Senior Engineer (Remote)",
      hiringOrganization: { name: "Co" },
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.isRemote, true);
  });

  it("normalizes employment type FULL_TIME → full_time", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      employmentType: "FULL_TIME",
    });
    assert.equal(extractJobPostingFromHtml(html)!.jobType, "full_time");
  });

  it("handles employmentType as array (takes first)", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      employmentType: ["CONTRACT", "FULL_TIME"],
    });
    assert.equal(extractJobPostingFromHtml(html)!.jobType, "contract");
  });

  it("parses skills from comma-separated string", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      skills: "TypeScript, React, PostgreSQL, AWS",
    });
    assert.deepEqual(extractJobPostingFromHtml(html)!.skills, [
      "TypeScript",
      "React",
      "PostgreSQL",
      "AWS",
    ]);
  });

  it("parses skills from array", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      skills: ["Go", "Kubernetes"],
    });
    assert.deepEqual(extractJobPostingFromHtml(html)!.skills, ["Go", "Kubernetes"]);
  });

  it("exposes directApplyUrl and canonicalUrl separately + applyUrl combined", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      url: "https://acme.com/jobs/123",
      directApply: "https://acme.com/apply/123",
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.canonicalUrl, "https://acme.com/jobs/123");
    assert.equal(parsed.directApplyUrl, "https://acme.com/apply/123");
    assert.equal(parsed.applyUrl, "https://acme.com/apply/123"); // directApply wins
  });

  it("falls back to canonical URL when no directApply", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      url: "https://acme.com/jobs/123",
    });
    assert.equal(extractJobPostingFromHtml(html)!.applyUrl, "https://acme.com/jobs/123");
  });
});

// ---------------------------------------------------------------------------
// @graph wrapper
// ---------------------------------------------------------------------------

describe("extractJobPostingFromHtml — @graph wrappers", () => {
  it("finds JobPosting inside @graph", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Careers" },
        {
          "@type": "JobPosting",
          title: "Data Eng",
          hiringOrganization: { name: "DataCo" },
        },
      ],
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.title, "Data Eng");
  });

  it("finds JobPosting inside a top-level array", () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      { "@type": "BreadcrumbList" },
      { "@type": "JobPosting", title: "ML Eng", hiringOrganization: { name: "X" } },
    ])}</script>`;
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.title, "ML Eng");
  });
});

// ---------------------------------------------------------------------------
// Edge cases / bad content
// ---------------------------------------------------------------------------

describe("extractJobPostingFromHtml — edge cases", () => {
  it("returns undefined for empty HTML", () => {
    assert.equal(extractJobPostingFromHtml(""), undefined);
  });

  it("returns undefined when no JSON-LD block present", () => {
    assert.equal(extractJobPostingFromHtml("<html><body><h1>Hi</h1></body></html>"), undefined);
  });

  it("returns undefined when JSON-LD present but no JobPosting", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "BlogPosting",
      headline: "How to apply",
    })}</script>`;
    assert.equal(extractJobPostingFromHtml(html), undefined);
  });

  it("skips malformed JSON-LD and keeps scanning", () => {
    const html = [
      `<script type="application/ld+json">{ this is not json }</script>`,
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Saved By The Scanner",
        hiringOrganization: { name: "Resilient Inc" },
      })}</script>`,
    ].join("\n");
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.title, "Saved By The Scanner");
  });

  it("skips JobPosting with empty title", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "",
      hiringOrganization: { name: "C" },
    });
    assert.equal(extractJobPostingFromHtml(html), undefined);
  });

  it("strips HTML from title and company", () => {
    // Real pages escape `</script>` inside JSON-LD as `<\/script>`. We
    // use `<b>` here to make the point without sabotaging the outer
    // <script> block the regex scanner looks for.
    const html = wrap({
      "@type": "JobPosting",
      title: "Senior <b>Engineer</b>",
      hiringOrganization: { name: "Acme <em>Corp</em>" },
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.title, "Senior Engineer");
    assert.equal(parsed.company, "Acme Corp");
  });

  it("truncates very long titles to 250 chars", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "A".repeat(500),
      hiringOrganization: { name: "C" },
    });
    const parsed = extractJobPostingFromHtml(html)!;
    assert.equal(parsed.title.length, 250);
  });

  it("handles jobLocation as array (takes first)", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      jobLocation: [
        { address: { addressLocality: "SF", addressRegion: "CA" } },
        { address: { addressLocality: "NYC", addressRegion: "NY" } },
      ],
    });
    assert.equal(extractJobPostingFromHtml(html)!.city, "SF");
  });

  it("handles legalName as company fallback", () => {
    const html = wrap({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { legalName: "Acme Legal Corp" },
    });
    assert.equal(extractJobPostingFromHtml(html)!.company, "Acme Legal Corp");
  });
});

// ---------------------------------------------------------------------------
// extractJobPostingsFromHtml — MULTIPLE jobs
// ---------------------------------------------------------------------------

describe("extractJobPostingsFromHtml — multiple jobs on page", () => {
  it("returns every JobPosting on a LinkedIn search results page", () => {
    const html = [
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Frontend Engineer",
        hiringOrganization: { name: "Co A" },
      })}</script>`,
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Backend Engineer",
        hiringOrganization: { name: "Co B" },
      })}</script>`,
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Data Engineer",
        hiringOrganization: { name: "Co C" },
      })}</script>`,
    ].join("\n");
    const parsed = extractJobPostingsFromHtml(html);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].title, "Frontend Engineer");
    assert.equal(parsed[1].title, "Backend Engineer");
    assert.equal(parsed[2].title, "Data Engineer");
  });

  it("returns empty array when no JobPostings present", () => {
    assert.deepEqual(extractJobPostingsFromHtml("<html></html>"), []);
  });

  it("@graph with multiple JobPostings — returns all", () => {
    const html = wrap({
      "@graph": [
        { "@type": "JobPosting", title: "A", hiringOrganization: { name: "X" } },
        { "@type": "JobPosting", title: "B", hiringOrganization: { name: "Y" } },
      ],
    });
    const parsed = extractJobPostingsFromHtml(html);
    assert.equal(parsed.length, 2);
  });
});

// ---------------------------------------------------------------------------
// normalizeJsonLdEmploymentType
// ---------------------------------------------------------------------------

describe("normalizeJsonLdEmploymentType", () => {
  it("maps all known schema.org employment types", () => {
    assert.equal(normalizeJsonLdEmploymentType("FULL_TIME"), "full_time");
    assert.equal(normalizeJsonLdEmploymentType("PART_TIME"), "part_time");
    assert.equal(normalizeJsonLdEmploymentType("CONTRACTOR"), "contract");
    assert.equal(normalizeJsonLdEmploymentType("CONTRACT"), "contract");
    assert.equal(normalizeJsonLdEmploymentType("TEMPORARY"), "temporary");
    assert.equal(normalizeJsonLdEmploymentType("INTERNSHIP"), "internship");
    assert.equal(normalizeJsonLdEmploymentType("INTERN"), "internship");
    assert.equal(normalizeJsonLdEmploymentType("VOLUNTEER"), "volunteer");
  });

  it("tolerates whitespace / hyphens", () => {
    assert.equal(normalizeJsonLdEmploymentType("full-time"), "full_time");
    assert.equal(normalizeJsonLdEmploymentType("Full Time"), "full_time");
  });

  it("returns undefined for unknown / non-string", () => {
    assert.equal(normalizeJsonLdEmploymentType("ABOVE_MINIMUM_WAGE"), undefined);
    assert.equal(normalizeJsonLdEmploymentType(123), undefined);
    assert.equal(normalizeJsonLdEmploymentType(null), undefined);
  });
});
