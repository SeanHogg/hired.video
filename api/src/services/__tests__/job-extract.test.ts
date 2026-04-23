import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  htmlToMarkdown,
  parseJobFromPage,
  splitDescriptionSections,
  extractAndClassifyJob,
  type ParsedJob,
} from "../job/JobService.js";

// =====================================================================
// htmlToMarkdown
// =====================================================================
describe("htmlToMarkdown", () => {
  it("returns empty string for non-string input", () => {
    assert.equal(htmlToMarkdown(undefined), "");
    assert.equal(htmlToMarkdown(null), "");
    assert.equal(htmlToMarkdown(42), "");
    assert.equal(htmlToMarkdown(""), "");
  });

  it("strips script, style, noscript, and comment blocks entirely", () => {
    const md = htmlToMarkdown(
      '<p>Hello</p><script>alert("x")</script><style>.a{}</style><noscript>nope</noscript><!-- secret -->',
    );
    assert.equal(md, "Hello");
  });

  it("converts h1-h6 into markdown headers with blank-line separators", () => {
    const md = htmlToMarkdown("<h1>A</h1><h2>B</h2><h3>C</h3>");
    assert.match(md, /# A/);
    assert.match(md, /## B/);
    assert.match(md, /### C/);
  });

  it("converts <strong> with inline content to **bold**", () => {
    const md = htmlToMarkdown("<p>Hello <strong>world</strong>!</p>");
    assert.equal(md, "Hello **world**!");
  });

  it("promotes <strong> with newlines inside to a block-level heading", () => {
    // LinkedIn pattern: <strong>Qualifications\n\n</strong><ul>...
    const md = htmlToMarkdown(
      "<strong>Qualifications\n\n</strong><ul><li>3+ years</li></ul>",
    );
    // Block-level bold must be on its own paragraph
    assert.match(md, /\n?\*\*Qualifications\*\*\n\n/);
    assert.match(md, /^- 3\+ years$/m);
  });

  it("preserves <ul><li> as dash-prefixed bullet lines", () => {
    const md = htmlToMarkdown("<ul><li>one</li><li>two</li><li>three</li></ul>");
    const bullets = md.match(/^- .+/gm) ?? [];
    assert.equal(bullets.length, 3);
    assert.equal(bullets[0], "- one");
    assert.equal(bullets[1], "- two");
    assert.equal(bullets[2], "- three");
  });

  it("converts <br> to a newline and </p> to a paragraph break", () => {
    const md = htmlToMarkdown("<p>First line<br>Second line</p><p>Second para</p>");
    assert.match(md, /First line\nSecond line/);
    assert.match(md, /Second line\n\nSecond para/);
  });

  it("decodes common HTML entities", () => {
    const md = htmlToMarkdown(
      "<p>R&amp;D &mdash; &quot;quoted&quot; &#39;apostrophe&#39; &lt;tag&gt;</p>",
    );
    assert.equal(md, `R&D — "quoted" 'apostrophe' <tag>`);
  });

  it("decodes numeric and hex entities", () => {
    const md = htmlToMarkdown("<p>&#8212; and &#x2014;</p>");
    assert.equal(md, "— and —");
  });

  it("unwraps <a> tags — keeps anchor text, drops href", () => {
    const md = htmlToMarkdown(
      '<p>See <a href="https://spoton.com" class="foo">spoton.com</a> for more.</p>',
    );
    assert.equal(md, "See spoton.com for more.");
  });

  it("normalizes runs of blank lines to exactly two", () => {
    const md = htmlToMarkdown("<p>One</p><p></p><p></p><p></p><p>Two</p>");
    // Should be "One\n\nTwo" — never more than two newlines
    assert.doesNotMatch(md, /\n{3,}/);
    assert.equal(md, "One\n\nTwo");
  });

  it("does NOT collapse newlines when normalizing inline whitespace", () => {
    // This is the big regression we're fixing: stripHtml used to do /\s+/ → " "
    // which destroyed all paragraph structure.
    const md = htmlToMarkdown("<p>Alpha</p><p>Beta</p><p>Gamma</p>");
    assert.equal(md, "Alpha\n\nBeta\n\nGamma");
  });

  it("handles the real LinkedIn 'About the job' payload", () => {
    const html = [
      '<div class="_2423fbc6">',
      '<div><h2>About the job</h2></div>',
      "<p><span>",
      "<strong>About SpotOn\n\n</strong>",
      "We're not just building restaurant tech.<br><br>",
      '<ul><li>Named #1 POS by G2</li><li>Top-rated by Capterra</li></ul>',
      "We move fast.<br><br>",
      "<strong>Qualifications\n\n</strong>",
      "<ul><li>6+ years PM experience</li><li>AI workflow experience</li></ul>",
      "<strong>Benefits\n\n</strong>",
      "<ul><li>Medical, Dental, Vision</li><li>401k match</li></ul>",
      "</span></p></div>",
    ].join("");

    const md = htmlToMarkdown(html);

    // Block-level headings were pulled out of inline strong
    assert.match(md, /\*\*About SpotOn\*\*/);
    assert.match(md, /\*\*Qualifications\*\*/);
    assert.match(md, /\*\*Benefits\*\*/);

    // Bullets survive
    assert.match(md, /^- Named #1 POS by G2$/m);
    assert.match(md, /^- 6\+ years PM experience$/m);
    assert.match(md, /^- Medical, Dental, Vision$/m);

    // h2 → ## About the job
    assert.match(md, /## About the job/);

    // Structure check: the Qualifications heading must be followed by
    // a blank line, then bullets.
    assert.match(md, /\*\*Qualifications\*\*\n\n- 6\+ years PM experience/);
  });
});

// =====================================================================
// parseJobFromPage
// =====================================================================
describe("parseJobFromPage", () => {
  it("extracts high-confidence fields from JSON-LD JobPosting", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        ${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Senior Product Manager",
          description: "<p>Lead the roadmap</p><ul><li>Drive strategy</li></ul>",
          hiringOrganization: { "@type": "Organization", name: "SpotOn" },
          jobLocation: {
            "@type": "Place",
            address: {
              addressLocality: "San Francisco",
              addressRegion: "CA",
              addressCountry: "US",
            },
          },
          employmentType: "FULL_TIME",
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: { minValue: 180000, maxValue: 220000 },
          },
          skills: "TypeScript, AWS, Postgres",
        })}
        </script>
      </head></html>
    `;

    const parsed = parseJobFromPage({ url: "https://example.com/jobs/1", html });

    assert.equal(parsed.confidence, "high");
    assert.equal(parsed.title, "Senior Product Manager");
    assert.equal(parsed.company, "SpotOn");
    assert.equal(parsed.city, "San Francisco");
    assert.equal(parsed.state, "CA");
    assert.equal(parsed.country, "US");
    assert.equal(parsed.location, "San Francisco, CA, US");
    assert.equal(parsed.jobType, "full_time");
    assert.equal(parsed.salaryMin, 180000);
    assert.equal(parsed.salaryMax, 220000);
    assert.equal(parsed.salaryCurrency, "USD");
    assert.deepEqual(parsed.skills, ["TypeScript", "AWS", "Postgres"]);
    // The description should be Markdown (preserves the <ul><li>) not flat text
    assert.match(parsed.description, /Lead the roadmap/);
    assert.match(parsed.description, /- Drive strategy/);
  });

  it("handles @graph-wrapped JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "Example" },
          {
            "@type": "JobPosting",
            title: "Data Scientist",
            hiringOrganization: { name: "Acme" },
          },
        ],
      })}
      </script>
    `;
    const parsed = parseJobFromPage({ url: "https://example.com/j/2", html });
    assert.equal(parsed.title, "Data Scientist");
    assert.equal(parsed.company, "Acme");
    assert.equal(parsed.confidence, "high");
  });

  it("falls back to low confidence + markdown description when no JSON-LD", () => {
    const html = `
      <html><head>
        <title>Senior Engineer - Acme</title>
        <meta property="og:title" content="Senior Engineer at Acme">
        <meta property="og:site_name" content="Acme">
      </head><body>
        <p>About the role</p>
        <ul><li>Write code</li><li>Ship features</li></ul>
      </body></html>
    `;
    const parsed = parseJobFromPage({ url: "https://acme.com/careers/42", html });
    assert.equal(parsed.confidence, "low");
    assert.equal(parsed.title, "Senior Engineer at Acme");
    assert.equal(parsed.company, "Acme");
    // Description is now Markdown — bullets preserved, paragraph break present
    assert.match(parsed.description, /About the role/);
    assert.match(parsed.description, /- Write code/);
    assert.match(parsed.description, /- Ship features/);
  });

  it("uses fallbackTitle('Job from <host>') only when all title sources are empty", () => {
    const parsed = parseJobFromPage({
      url: "https://www.linkedin.com/jobs/view/4394686149/",
      html: "<div>just a div</div>",
    });
    assert.equal(parsed.confidence, "low");
    assert.equal(parsed.title, "Job from linkedin.com");
  });

  it("ignores malformed JSON-LD blocks and falls through", () => {
    const html = `
      <script type="application/ld+json">{ broken json </script>
      <title>Backup Title</title>
    `;
    const parsed = parseJobFromPage({ url: "https://x.com/j", html });
    assert.equal(parsed.confidence, "low");
    assert.equal(parsed.title, "Backup Title");
  });

  it("ignores non-JobPosting JSON-LD types", () => {
    const html = `
      <script type="application/ld+json">
      ${JSON.stringify({ "@type": "Article", headline: "Not a job" })}
      </script>
      <title>Fallback</title>
    `;
    const parsed = parseJobFromPage({ url: "https://x.com/j", html });
    assert.equal(parsed.confidence, "low");
    assert.equal(parsed.title, "Fallback");
  });
});

// =====================================================================
// splitDescriptionSections
// =====================================================================
describe("splitDescriptionSections", () => {
  const base = (description: string): ParsedJob => ({
    title: "t",
    description,
    confidence: "low",
  });

  it("is a no-op when structured fields already exist", () => {
    const input: ParsedJob = {
      ...base("Responsibilities\n- old"),
      responsibilities: ["already here"],
    };
    const out = splitDescriptionSections(input);
    assert.deepEqual(out.responsibilities, ["already here"]);
    // Description unchanged because we bailed early
    assert.equal(out.description, input.description);
  });

  it("is a no-op for very short descriptions (<200 chars)", () => {
    const input = base("Too short to bother with");
    const out = splitDescriptionSections(input);
    assert.equal(out.description, input.description);
    assert.equal(out.responsibilities, undefined);
  });

  it("splits 'What You'll Do' and 'Qualifications' sections from plain-text description", () => {
    const desc = [
      "We are looking for a talented engineer to join our team and help build great software for our customers.",
      "",
      "What You'll Do",
      "- Write high-quality code every day",
      "- Review pull requests and mentor junior engineers on the team",
      "- Collaborate closely with product managers on roadmap",
      "",
      "Qualifications",
      "- 5+ years of professional software engineering experience",
      "- Strong communication and collaboration skills across teams",
      "- Bachelor's degree in Computer Science or equivalent experience",
    ].join("\n");

    const out = splitDescriptionSections(base(desc));
    assert.ok((out.responsibilities?.length ?? 0) >= 2);
    assert.ok((out.qualifications?.length ?? 0) >= 2);
    assert.match(out.responsibilities![0], /Write high-quality code/);
    assert.match(out.qualifications![0], /5\+ years/);
    // The pre-section intro should remain in description
    assert.match(out.description, /looking for a talented engineer/);
    // Bucketed content should be removed from the description body
    assert.doesNotMatch(out.description, /Write high-quality code/);
  });

  it("pulls 'Benefits' + 'What We Offer' lines into the benefits bucket", () => {
    const desc = [
      "Join our growing team of passionate engineers building the next generation of developer tools for remote teams.",
      "",
      "Benefits",
      "- Medical, dental, and vision insurance from day one",
      "- Generous paid time off plus company-wide shutdown days",
      "- 401(k) match up to six percent of salary",
    ].join("\n");
    const out = splitDescriptionSections(base(desc));
    assert.ok((out.benefits?.length ?? 0) >= 3);
    assert.match(out.benefits![0], /Medical, dental, and vision/);
  });
});

// =====================================================================
// extractAndClassifyJob — integration-lite (no LLM)
// =====================================================================
describe("extractAndClassifyJob", () => {
  it("returns high confidence + parsed data when JSON-LD is present", async () => {
    const html = `
      <script type="application/ld+json">
      ${JSON.stringify({
        "@type": "JobPosting",
        title: "Staff Engineer",
        description: "<p>Build things</p>",
        hiringOrganization: { name: "Acme" },
      })}
      </script>
    `;
    const result = await extractAndClassifyJob({ url: "https://x.com/j", html });
    assert.equal(result.ok, true);
    assert.equal(result.confidence, 1);
    assert.equal(result.parsed?.title, "Staff Engineer");
    assert.equal(result.parsed?.company, "Acme");
  });

  it("falls open to heuristic parse when no API key is configured", async () => {
    // No JSON-LD → no high-confidence path. No apiKey → LLM is skipped.
    // Should still return ok=true with the MD description (for the UX) rather than erroring out.
    const html = `
      <html><head><title>Senior Engineer - Acme</title></head>
      <body>
        <p>We are hiring a senior engineer who can own the whole stack end to end and collaborate across teams for many years.</p>
        <ul><li>Write code that matters</li><li>Ship features quickly</li></ul>
      </body></html>
    `;
    const result = await extractAndClassifyJob({
      url: "https://acme.com/jobs/42",
      html,
      // no apiKey
    });
    assert.equal(result.ok, true);
    assert.equal(result.confidence, 0.5);
    assert.ok(result.parsed);
    assert.match(result.parsed!.description, /We are hiring/);
    // Bullets from the body come through as markdown
    assert.match(result.parsed!.description, /- Write code that matters/);
  });

  it("rejects pages with <200 chars of extracted content when an API key is configured", async () => {
    const result = await extractAndClassifyJob({
      url: "https://x.com/j",
      html: "<div>too short</div>",
      apiKey: "sk-fake-key-does-not-matter",
    });
    assert.equal(result.ok, false);
    assert.equal(result.confidence, 0);
    assert.match(result.reason!, /couldn't read enough/i);
  });
});
