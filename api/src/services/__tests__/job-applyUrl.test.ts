import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJobFromPage } from "../job/job-page-parse.js";

/**
 * Tests that the job extraction pipeline populates `applyUrl` from
 * structured data (JSON-LD) and from the source page URL when no
 * structured apply link is available.
 *
 * Run: node --import tsx --test src/services/__tests__/job-applyUrl.test.ts
 */

// ---------------------------------------------------------------------------
// Helper: wrap a JSON-LD JobPosting in a minimal HTML page
// ---------------------------------------------------------------------------
function htmlWithJsonLd(jobPosting: Record<string, unknown>): string {
  return `<html><head>
    <title>Test Job</title>
    <script type="application/ld+json">${JSON.stringify(jobPosting)}</script>
  </head><body><h1>Test</h1></body></html>`;
}

// ---------------------------------------------------------------------------
// 1. JSON-LD with an explicit `url` field → applyUrl populated
// ---------------------------------------------------------------------------
describe("parseJobFromPage — applyUrl extraction", () => {
  it("extracts applyUrl from JSON-LD JobPosting `url` field", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Senior Engineer",
      description: "Build things.",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      url: "https://acme.com/careers/senior-engineer/apply",
    });

    const result = parseJobFromPage({ url: "https://acme.com/careers/senior-engineer", html });

    assert.equal(result.title, "Senior Engineer");
    assert.equal(result.company, "Acme Corp");
    assert.equal(result.applyUrl, "https://acme.com/careers/senior-engineer/apply");
    assert.equal(result.confidence, "high");
  });

  it("extracts applyUrl from JSON-LD `directApply` URL string", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Product Manager",
      description: "Manage products.",
      hiringOrganization: { "@type": "Organization", name: "BigCo" },
      directApply: "https://bigco.com/apply/pm-123",
    });

    const result = parseJobFromPage({ url: "https://bigco.com/jobs/pm-123", html });

    assert.equal(result.applyUrl, "https://bigco.com/apply/pm-123");
  });

  it("prefers directApply over url when both are present", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Designer",
      description: "Design things.",
      hiringOrganization: { "@type": "Organization", name: "Studio" },
      url: "https://studio.com/jobs/designer",
      directApply: "https://studio.com/apply/designer",
    });

    const result = parseJobFromPage({ url: "https://studio.com/jobs/designer", html });

    // directApply is more specific — should win
    assert.equal(result.applyUrl, "https://studio.com/apply/designer");
  });

  it("falls back to input url when JSON-LD has no url/directApply", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Backend Dev",
      description: "Write APIs.",
      hiringOrganization: { "@type": "Organization", name: "StartupX" },
    });

    const result = parseJobFromPage({
      url: "https://www.linkedin.com/jobs/view/12345/",
      html,
    });

    // No JSON-LD url → should fall back to the page URL
    assert.equal(result.applyUrl, "https://www.linkedin.com/jobs/view/12345/");
  });

  it("falls back to input url for non-JSON-LD pages (OG meta only)", () => {
    const html = `<html><head>
      <title>Frontend Engineer - CoolStartup</title>
      <meta property="og:title" content="Frontend Engineer" />
      <meta property="og:site_name" content="CoolStartup" />
    </head><body><h1>Frontend Engineer</h1><p>Build UIs.</p></body></html>`;

    const result = parseJobFromPage({
      url: "https://coolstartup.com/careers/frontend",
      html,
    });

    assert.equal(result.applyUrl, "https://coolstartup.com/careers/frontend");
    assert.equal(result.confidence, "low");
  });

  it("handles @graph wrapper with applyUrl", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Careers" },
        {
          "@type": "JobPosting",
          title: "Data Scientist",
          description: "Analyze data.",
          hiringOrganization: { "@type": "Organization", name: "DataCo" },
          url: "https://dataco.com/jobs/data-scientist/apply",
        },
      ],
    });

    const result = parseJobFromPage({ url: "https://dataco.com/jobs/data-scientist", html });

    assert.equal(result.title, "Data Scientist");
    assert.equal(result.applyUrl, "https://dataco.com/jobs/data-scientist/apply");
  });

  it("returns undefined applyUrl when no url is provided and no JSON-LD url", () => {
    const html = htmlWithJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "QA Engineer",
      description: "Test things.",
      hiringOrganization: { "@type": "Organization", name: "TestCo" },
    });

    // No input URL and no JSON-LD url
    const result = parseJobFromPage({ html });

    // applyUrl should still be undefined when there's truly no URL available
    assert.equal(result.applyUrl, undefined);
  });
});
