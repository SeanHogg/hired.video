/**
 * DOM-based tests for @shared/scraping/jobExtract.ts.
 *
 * Uses Vitest's jsdom environment — we construct a Document from raw
 * HTML via DOMParser and pass it to the detector. The detector takes
 * DOM + URL as explicit parameters (no `document`/`window` globals),
 * so it's testable in Node without the Chrome extension loaded.
 */

import { describe, it, expect } from "vitest";

import { detectJobInPage } from "@shared/scraping/jobExtract.ts";

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// ---------------------------------------------------------------------------
// JSON-LD path — the gold-standard first pass
// ---------------------------------------------------------------------------

describe("detectJobInPage — JSON-LD", () => {
  it("extracts a single JobPosting from an embedded script", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Senior Engineer",
        hiringOrganization: { name: "Acme Corp" },
        jobLocation: { address: { addressLocality: "SF", addressRegion: "CA" } },
      })}</script>
    </head><body></body></html>`;

    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://acme.com/careers/eng-1",
    );
    expect(got).toBeTruthy();
    expect(got!.title).toBe("Senior Engineer");
    expect(got!.company).toBe("Acme Corp");
    expect(got!.location).toBe("SF, CA");
    expect(got!.strategy).toBe("jsonLd");
  });

  it("canonicalizes LinkedIn collection URL → /jobs/view/ before returning sourceUrl", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Senior PM",
      hiringOrganization: { name: "LI" },
    })}</script></head><body></body></html>`;
    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=9876",
    );
    expect(got!.sourceUrl).toBe("https://www.linkedin.com/jobs/view/9876/");
  });

  it("prefers directApply over canonical url for applyUrl", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "x",
      hiringOrganization: { name: "C" },
      url: "https://acme.com/jobs/123",
      directApply: "https://acme.com/apply/123",
    })}</script></head><body></body></html>`;
    const got = detectJobInPage(docFromHtml(html) as any, "https://acme.com/jobs/123");
    expect(got!.applyUrl).toBe("https://acme.com/apply/123");
  });

  it("ignores malformed JSON-LD and keeps scanning", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not json }</script>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Resilient",
        hiringOrganization: { name: "R" },
      })}</script>
    </head><body></body></html>`;
    const got = detectJobInPage(docFromHtml(html) as any, "https://example.com/jobs/1");
    expect(got!.title).toBe("Resilient");
  });

  it("returns the FIRST JobPosting when multiple are on the page", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "First Job",
        hiringOrganization: { name: "A" },
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Second Job",
        hiringOrganization: { name: "B" },
      })}</script>
    </head><body></body></html>`;
    const got = detectJobInPage(docFromHtml(html) as any, "https://example.com/jobs/1");
    expect(got!.title).toBe("First Job");
  });
});

// ---------------------------------------------------------------------------
// Focused-pane path — LinkedIn search collection page
// ---------------------------------------------------------------------------

describe("detectJobInPage — focused pane (LinkedIn)", () => {
  it("extracts title from #job-details right-pane when the left rail has many cards", () => {
    const html = `
      <html><body>
        <div class="jobs-search-results-list">
          <div class="job-card-container"><h3 class="job-card-list__title">Left Rail Job A</h3></div>
          <div class="job-card-container"><h3 class="job-card-list__title">Left Rail Job B</h3></div>
          <div class="job-card-container job-card-container--clickable job-card-list--is-current-job">
            <h3 class="job-card-list__title">Selected Job</h3>
            <div class="job-card-container__company-name">Selected Co</div>
          </div>
        </div>
        <div class="jobs-search__job-details">
          <div class="job-details-jobs-unified-top-card__job-title">
            <h1>Senior Software Engineer</h1>
          </div>
          <div class="job-details-jobs-unified-top-card__company-name">
            <a>Right Pane Company</a>
          </div>
          <div class="job-details-jobs-unified-top-card__bullet">Remote, USA</div>
          <div id="job-details"><p>${"About the job. ".repeat(400)}</p></div>
        </div>
      </body></html>
    `;
    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=12345",
    );
    expect(got).toBeTruthy();
    expect(got!.title).toBe("Senior Software Engineer");
    expect(got!.company).toBe("Right Pane Company");
    expect(got!.location).toBe("Remote, USA");
    expect(got!.strategy).toBe("focusedPane");
    expect(got!.sourceUrl).toBe("https://www.linkedin.com/jobs/view/12345/");
    // The focused-pane HTML is captured so the backend can re-parse
    // ONLY this slice of the page.
    expect(got!.focusedPaneHtml).toBeDefined();
  });

  it("does NOT pick up section heading 'About the job' as the title", () => {
    const html = `
      <html><body>
        <div class="jobs-search__job-details">
          <h2>About the job</h2>
          <div class="job-details-jobs-unified-top-card__job-title">
            <h1>Real Job Title</h1>
          </div>
          <div id="job-details">${"filler ".repeat(400)}</div>
        </div>
      </body></html>
    `;
    const got = detectJobInPage(docFromHtml(html) as any, "https://www.linkedin.com/jobs/view/1/");
    expect(got!.title).toBe("Real Job Title");
  });
});

// ---------------------------------------------------------------------------
// Focused-pane path — Amazon Jobs (#main-content / #job-detail / .location-icon)
// ---------------------------------------------------------------------------

describe("detectJobInPage — focused pane (amazon.jobs)", () => {
  // Real amazon.jobs page shape: no JSON-LD JobPosting, SSR'd h1.title in
  // the apply-header, company sitting after the `|` in <p class="meta">,
  // and a multi-city location list in the sidebar.
  const buildAmazonHtml = () => `
    <html><head>
      <meta property="og:site_name" content="Amazon.jobs">
      <title>Sr Solutions Architect, Alexa+ - Job ID: 10407286 | Amazon.jobs</title>
    </head><body>
      <div id="main-content">
        <div id="job-detail">
          <div class="apply-header">
            <h1 class="title" title="Sr Solutions Architect, Alexa+">Sr Solutions Architect, Alexa+</h1>
            <p class="meta">Job ID: 10407286 | Amazon.com Services LLC</p>
            <a id="apply-button" class="btn btn-primary" href="https://www.amazon.jobs/applicant/jobs/10407286/apply">Apply now</a>
          </div>
        </div>
        <div class="association location-icon">
          <span aria-label="location" role="img"></span>
          <ul class="association-content">
            <li>USA, WA, Bellevue</li>
            <li>USA, WA, Seattle</li>
          </ul>
        </div>
        <h2>Description</h2>
        <p>${"Build the future of voice. ".repeat(40)}</p>
      </div>
    </body></html>`;

  it("extracts title, company (after the `|`) and joined multi-city location", () => {
    const got = detectJobInPage(
      docFromHtml(buildAmazonHtml()) as any,
      "https://www.amazon.jobs/en/jobs/10407286/sr-solutions-architect-alexa",
    );
    expect(got).toBeTruthy();
    expect(got!.title).toBe("Sr Solutions Architect, Alexa+");
    expect(got!.company).toBe("Amazon.com Services LLC");
    expect(got!.location).toBe("USA, WA, Bellevue | USA, WA, Seattle");
    expect(got!.strategy).toBe("focusedPane");
    expect(got!.applyUrl).toBe("https://www.amazon.jobs/applicant/jobs/10407286/apply");
    expect(got!.focusedPaneHtml).toBeDefined();
  });

  it("returns null on the /content/ marketing landing pages (no JSON-LD, h1 is 'Artificial Intelligence')", () => {
    // The recruiter-marketing landing has a generic h1 the old code would
    // false-positive as a fake job titled "Artificial Intelligence".
    const html = `<html><body>
      <h1>Artificial Intelligence</h1>
      <p>Breakthrough AI research meets real-world impact</p>
      <a href="/jobs/search?category=ai">View open roles</a>
    </body></html>`;
    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://www.amazon.jobs/content/en/artificial-intelligence-ai",
    );
    expect(got).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic fallback — for unknown job boards / employer career pages
// ---------------------------------------------------------------------------

describe("detectJobInPage — generic fallback", () => {
  it("reads a plain employer careers page via <h1>", () => {
    const html = `<html>
      <head><meta property="og:site_name" content="CoolStartup"></head>
      <body>
        <h1>Frontend Engineer</h1>
        <p>${"Build beautiful UIs. ".repeat(50)}</p>
      </body>
    </html>`;
    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://coolstartup.com/careers/frontend",
    );
    expect(got!.title).toBe("Frontend Engineer");
    expect(got!.company).toBe("CoolStartup");
    expect(got!.strategy).toBe("generic");
  });

  it("falls back to cleaned <title> when no h1 matches", () => {
    const html = `<html><head><title>Backend Engineer - Acme | Careers</title></head><body></body></html>`;
    const got = detectJobInPage(
      docFromHtml(html) as any,
      "https://careers.acme.com/open-positions",
    );
    expect(got!.title).toBe("Backend Engineer - Acme");
  });

  it("returns null on a clearly non-job page (no h1, generic title, no JSON-LD)", () => {
    const html = `<html><head><title>Home</title></head><body><h1>Menu</h1></body></html>`;
    const got = detectJobInPage(docFromHtml(html) as any, "https://example.com/home");
    expect(got).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bad content / edge cases
// ---------------------------------------------------------------------------

describe("detectJobInPage — bad content", () => {
  it("handles totally empty HTML", () => {
    expect(detectJobInPage(docFromHtml("") as any, "https://x.com/")).toBeNull();
  });

  it("handles pages with only navigation chrome", () => {
    const html = `<html><body><nav><a>Home</a><a>About</a></nav></body></html>`;
    expect(detectJobInPage(docFromHtml(html) as any, "https://x.com/")).toBeNull();
  });

  it("handles JobPosting with empty title (skips it)", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "",
      hiringOrganization: { name: "C" },
    })}</script></head><body></body></html>`;
    expect(detectJobInPage(docFromHtml(html) as any, "https://x.com/")).toBeNull();
  });
});
