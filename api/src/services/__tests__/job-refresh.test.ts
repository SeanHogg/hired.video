/**
 * Tests for the `/api/jobs/:id/refresh` backfill pipeline.
 *
 * Covers two layers:
 *
 *   1. `computeRefreshBackfill` — the pure merge policy that turns
 *      `(stored row, parsed page, missingFields allow-list)` into
 *      `{ updates, updatedFields }`. No DB, no AI — just the rules.
 *
 *   2. `extractAndClassifyJob` against real-world job-board HTML —
 *      confirms that when a user lands on a Home Depot / SpotOn /
 *      Workday posting and hits the refresh icon, the backend's AI
 *      extractor pulls structured responsibilities / requirements /
 *      qualifications / benefits out of the JSON-LD + description body
 *      instead of leaving them null.
 *
 * These tests DO NOT require an OpenRouter API key — the pipeline
 * falls through to JSON-LD + heuristic section-splitting when no key
 * is configured. The AI-only branch (LLM classifier for pages without
 * JSON-LD) is out of scope here because it's non-deterministic.
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  computeRefreshBackfill,
  deriveApplyUrl,
  extractAndClassifyJob,
  findApplyLinkInHtml,
  isApplyUrlFallback,
} from "../job.js";

// =====================================================================
// Sample data — real-world JSON-LD payloads captured from the live
// extension. Change these only when you've verified the new HTML
// against the site the user reported regressions on.
// =====================================================================

/** Home Depot — the exact payload from the regression the user filed.
 *  JSON-LD has title/description/company/location but NO salary,
 *  jobType, experienceLevel, or structured sections. The description
 *  body carries the sections as `<strong>Section:</strong><ul>` blocks
 *  that `splitDescriptionSections` must recognise and extract. */
const HOME_DEPOT_JSON_LD = JSON.stringify({
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  title: "Software Engineer Manager (Remote)",
  description:
    "<div data-field=\"description\" class=\"jd-description\">" +
    "<p><b>Position Purpose:</b></p><p>This Software Engineer Manager will be on the Galaxy Team.</p>" +
    "<p><b>Key Responsibilities:</b></p><ul>" +
    "<li>30% Delivery &amp; Execution:</li>" +
    "<li>Collaborates and pairs with product team members to create secure, reliable, scalable software solutions</li>" +
    "<li>Documents, reviews and ensures that all quality and change control standards are met</li>" +
    "<li>Writes custom code or scripts to automate infrastructure, monitoring services, and test cases</li>" +
    "</ul>" +
    "<p><b>Minimum Qualifications:</b></p><ul>" +
    "<li>Must be eighteen years of age or older.</li>" +
    "<li>Must be legally permitted to work in the United States.</li>" +
    "<li>Mastery of an object oriented programming language (preferably Java)</li>" +
    "</ul>" +
    "<p><b>Preferred Qualifications:</b></p><ul>" +
    "<li>5-7 years of relevant work experience</li>" +
    "<li>Software programming skills (ideally React or Golang)</li>" +
    "<li>Mastery of writing SQL queries against a relational database</li>" +
    "</ul>" +
    "</div>",
  hiringOrganization: {
    "@type": "Organization",
    name: "The Home Depot",
  },
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Atlanta",
      addressRegion: "GA",
      addressCountry: "US",
    },
  },
  jobLocationType: "TELECOMMUTE",
});

const HOME_DEPOT_HTML = `<html><head><script type="application/ld+json">${HOME_DEPOT_JSON_LD}</script></head><body></body></html>`;

const HOME_DEPOT_URL =
  "https://careers.homedepot.com/job/23192592/software-engineer-manager-remote-remote/";

// Minimal stored row shape — matches `jobItems.$inferSelect` closely
// enough for computeRefreshBackfill (it only reads the columns it
// knows about). Casting via `as any` keeps the test free of the full
// 30-column Drizzle type.
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e4bb7132-e486-430a-a396-eb9fd12448e9",
    postedByUserId: "9f14dee7-0fd2-4862-82d1-8d5e087945d5",
    title: "Software Engineer Manager (Remote)",
    description: "Seed description",
    company: "The Home Depot",
    location: "Atlanta, GA, US",
    jobType: null,
    experienceLevel: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "USD",
    skillsRequired: [],
    details: {},
    isRemote: true,
    isActive: true,
    expiresAt: null,
    sponsored: false,
    sponsoredUntil: null,
    sponsoredRankBoost: 0,
    sourceUrl: HOME_DEPOT_URL,
    applyUrl: null,
    createdAt: new Date("2026-04-12T16:40:17.085Z"),
    updatedAt: new Date("2026-04-12T16:40:17.085Z"),
    ...overrides,
  } as any;
}

// =====================================================================
// computeRefreshBackfill — pure merge policy tests
// =====================================================================
describe("computeRefreshBackfill", () => {
  it("fills a null scalar column when parsed provides a value AND the column is in missingFields", () => {
    const row = makeRow({ jobType: null });
    const parsed = { title: "t", description: "d", jobType: "full_time", confidence: "high" } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["jobType"],
    });
    assert.equal(updates.jobType, "full_time");
    assert.deepEqual(updatedFields, ["jobType"]);
  });

  it("NEVER overwrites a stored non-null value — even when parsed differs", () => {
    const row = makeRow({ jobType: "part_time" });
    const parsed = { title: "t", description: "d", jobType: "full_time", confidence: "high" } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["jobType"],
    });
    assert.equal(updates.jobType, undefined);
    assert.deepEqual(updatedFields, []);
  });

  it("skips columns not in the missingFields allow-list even when empty", () => {
    const row = makeRow({ jobType: null, experienceLevel: null });
    const parsed = {
      title: "t",
      description: "d",
      jobType: "full_time",
      experienceLevel: "senior",
      confidence: "high",
    } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["jobType"], // experienceLevel intentionally omitted
    });
    assert.equal(updates.jobType, "full_time");
    assert.equal(updates.experienceLevel, undefined);
    assert.deepEqual(updatedFields, ["jobType"]);
  });

  it("treats missingFields=null as 'fill any empty field' (legacy caller fallback)", () => {
    const row = makeRow({ jobType: null, experienceLevel: null });
    const parsed = {
      title: "t",
      description: "d",
      jobType: "full_time",
      experienceLevel: "senior",
      confidence: "high",
    } as any;
    const { updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: null,
    });
    assert.deepEqual(updatedFields.sort(), ["experienceLevel", "jobType"]);
  });

  it("seeds empty skillsRequired arrays when parsed.skills has content", () => {
    const row = makeRow({ skillsRequired: [] });
    const parsed = {
      title: "t",
      description: "d",
      skills: ["Go", "React", "SQL"],
      confidence: "high",
    } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["skillsRequired"],
    });
    assert.deepEqual(updates.skillsRequired, ["Go", "React", "SQL"]);
    assert.deepEqual(updatedFields, ["skillsRequired"]);
  });

  it("leaves a non-empty skillsRequired untouched", () => {
    const row = makeRow({ skillsRequired: ["Python"] });
    const parsed = { title: "t", description: "d", skills: ["Go"], confidence: "high" } as any;
    const { updates } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["skillsRequired"],
    });
    assert.equal(updates.skillsRequired, undefined);
  });

  it("merges details.* subfields per-key — fills empties without touching populated keys", () => {
    const row = makeRow({
      details: {
        responsibilities: ["do the thing"], // already populated
        requirements: [],                   // empty, should fill
        qualifications: null,               // null, should fill
        // benefits absent, should fill
      },
    });
    const parsed = {
      title: "t",
      description: "d",
      responsibilities: ["NEW"],
      requirements: ["req1", "req2"],
      qualifications: ["qual1"],
      benefits: ["401k"],
      confidence: "high",
    } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: [
        "details.responsibilities",
        "details.requirements",
        "details.qualifications",
        "details.benefits",
      ],
    });
    const detailsOut = updates.details as Record<string, unknown>;
    assert.deepEqual(detailsOut.responsibilities, ["do the thing"], "must not overwrite populated key");
    assert.deepEqual(detailsOut.requirements, ["req1", "req2"]);
    assert.deepEqual(detailsOut.qualifications, ["qual1"]);
    assert.deepEqual(detailsOut.benefits, ["401k"]);
    assert.deepEqual(updatedFields.sort(), [
      "details.benefits",
      "details.qualifications",
      "details.requirements",
    ]);
  });

  it("honors broad 'details' allow-list key (covers all subfields)", () => {
    const row = makeRow({ details: {} });
    const parsed = {
      title: "t",
      description: "d",
      responsibilities: ["a"],
      requirements: ["b"],
      confidence: "high",
    } as any;
    const { updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["details"],
    });
    assert.deepEqual(updatedFields.sort(), [
      "details.requirements",
      "details.responsibilities",
    ]);
  });

  it("falls back to url when neither stored sourceUrl nor parsed.applyUrl is set", () => {
    const row = makeRow({ sourceUrl: null });
    const parsed = { title: "t", description: "d", applyUrl: undefined, confidence: "high" } as any;
    const { updates } = computeRefreshBackfill({
      row,
      parsed,
      url: HOME_DEPOT_URL,
      missingFields: ["sourceUrl"],
    });
    assert.equal(updates.sourceUrl, HOME_DEPOT_URL);
  });

  it("returns an empty update set when nothing changed (triggers the no-op response path in the route)", () => {
    const row = makeRow({ jobType: "full_time" });
    const parsed = { title: "t", description: "d", jobType: "full_time", confidence: "high" } as any;
    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      missingFields: ["jobType"],
    });
    assert.deepEqual(updates, {});
    assert.deepEqual(updatedFields, []);
  });

  // ---- applyUrl backfill (the fallback-detection feature) -----------
  describe("applyUrl backfill", () => {
    const SOURCE = "https://careers.homedepot.com/job/23192592/software-engineer-manager-remote-remote/";
    const WORKDAY = "https://homedepot.wd5.myworkdayjobs.com/CareerDepot/job/GEORGIA---VIRTUAL---GA01/Software-Engineer-Manager--Remote-_Req174442/apply";

    it("fills applyUrl when stored is null and parsed.applyUrl carries a distinct link", () => {
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: null });
      const parsed = {
        title: "t",
        description: "d",
        applyUrl: WORKDAY,
        confidence: "high",
      } as any;
      const { updates, updatedFields } = computeRefreshBackfill({
        row,
        parsed,
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, WORKDAY);
      assert.deepEqual(updatedFields, ["applyUrl"]);
    });

    it("replaces a sourceUrl-fallback applyUrl with a fresh direct-apply link on refresh", () => {
      // The regression case: initial /extract stored applyUrl=null so
      // the DTO fell back to sourceUrl; later refresh on the same page
      // lifts a Workday apply link out of the DOM.
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: SOURCE });
      const parsed = {
        title: "t",
        description: "d",
        applyUrl: WORKDAY,
        confidence: "high",
      } as any;
      const { updates, updatedFields } = computeRefreshBackfill({
        row,
        parsed,
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, WORKDAY);
      assert.deepEqual(updatedFields, ["applyUrl"]);
    });

    it("uses the current request URL as applyUrl when the user is on a different page than sourceUrl", () => {
      // Scenario: user navigated from careers.homedepot.com to the
      // Workday apply form and then hit refresh. parsed.applyUrl is
      // empty (Workday pages rarely have JSON-LD JobPosting) but the
      // request URL is the apply form itself.
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: null });
      const parsed = { title: "t", description: "d", confidence: "high" } as any;
      const { updates } = computeRefreshBackfill({
        row,
        parsed,
        url: WORKDAY,
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, WORKDAY);
    });

    it("overwrites a stored applyUrl when a fresh distinct candidate arrives", () => {
      // Apply links drift — each rescan is a signal that the stored
      // value might be stale, so the newer distinct candidate wins.
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: WORKDAY });
      const parsed = {
        title: "t",
        description: "d",
        applyUrl: "https://some-other-site.example/apply/42",
        confidence: "high",
      } as any;
      const { updates, updatedFields } = computeRefreshBackfill({
        row,
        parsed,
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, "https://some-other-site.example/apply/42");
      assert.deepEqual(updatedFields, ["applyUrl"]);
    });

    it("does NOT overwrite a stored applyUrl with the sourceUrl itself (no downgrade)", () => {
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: WORKDAY });
      const parsed = {
        title: "t",
        description: "d",
        applyUrl: SOURCE, // same as sourceUrl — not a real apply link
        confidence: "high",
      } as any;
      const { updates } = computeRefreshBackfill({
        row,
        parsed,
        url: SOURCE,
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, undefined);
    });

    it("leaves applyUrl untouched when the only candidate equals sourceUrl (no real improvement)", () => {
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: null });
      const parsed = { title: "t", description: "d", confidence: "high" } as any;
      const { updates } = computeRefreshBackfill({
        row,
        parsed,
        url: SOURCE,   // current URL is sourceUrl — not an upgrade
        missingFields: ["applyUrl"],
      });
      assert.equal(updates.applyUrl, undefined);
    });

    it("skips applyUrl when it's not in the missingFields allow-list", () => {
      const row = makeRow({ sourceUrl: SOURCE, applyUrl: null });
      const parsed = {
        title: "t",
        description: "d",
        applyUrl: WORKDAY,
        confidence: "high",
      } as any;
      const { updates } = computeRefreshBackfill({
        row,
        parsed,
        missingFields: ["description"], // applyUrl omitted
      });
      assert.equal(updates.applyUrl, undefined);
    });
  });

  // ---- isApplyUrlFallback predicate ---------------------------------
  describe("isApplyUrlFallback", () => {
    it("returns true when applyUrl is null/undefined/empty", () => {
      assert.equal(isApplyUrlFallback({ sourceUrl: "https://x/" }), true);
      assert.equal(isApplyUrlFallback({ applyUrl: null, sourceUrl: "https://x/" }), true);
      assert.equal(isApplyUrlFallback({ applyUrl: "", sourceUrl: "https://x/" }), true);
    });
    it("returns true when applyUrl equals sourceUrl", () => {
      assert.equal(
        isApplyUrlFallback({ applyUrl: "https://x/", sourceUrl: "https://x/" }),
        true,
      );
    });
    it("returns false when applyUrl is distinct from sourceUrl", () => {
      assert.equal(
        isApplyUrlFallback({ applyUrl: "https://x/apply", sourceUrl: "https://x/" }),
        false,
      );
    });
  });

  // ---- deriveApplyUrl priority with new applyUrl column -------------
  describe("deriveApplyUrl (with persisted applyUrl column)", () => {
    it("prefers persisted job.applyUrl above parsed.applyUrl", () => {
      assert.equal(
        deriveApplyUrl({
          parsed: { applyUrl: "https://stale-candidate.example/apply" },
          job: { applyUrl: "https://persisted.example/apply", sourceUrl: "https://posting.example/" },
        }),
        "https://persisted.example/apply",
      );
    });
    it("falls through to parsed.applyUrl when job.applyUrl is null", () => {
      assert.equal(
        deriveApplyUrl({
          parsed: { applyUrl: "https://fresh.example/apply" },
          job: { applyUrl: null, sourceUrl: "https://posting.example/" },
        }),
        "https://fresh.example/apply",
      );
    });
  });
});

// =====================================================================
// deriveApplyUrl — DRY helper used by /extract, /refresh, and dedup paths
// =====================================================================
describe("deriveApplyUrl", () => {
  it("prefers parsed.applyUrl above all other signals", () => {
    assert.equal(
      deriveApplyUrl({
        parsed: { applyUrl: "https://workday.example.com/apply/42" },
        job: { sourceUrl: "https://careers.example.com/jobs/42" },
        fallbackUrl: "https://example.com/",
      }),
      "https://workday.example.com/apply/42",
    );
  });

  it("falls back to job.sourceUrl when parsed.applyUrl is missing", () => {
    assert.equal(
      deriveApplyUrl({
        parsed: { applyUrl: undefined },
        job: { sourceUrl: "https://careers.example.com/jobs/42" },
        fallbackUrl: "https://example.com/",
      }),
      "https://careers.example.com/jobs/42",
    );
  });

  it("falls back to fallbackUrl when both parsed.applyUrl and job.sourceUrl are missing", () => {
    assert.equal(
      deriveApplyUrl({
        parsed: { applyUrl: undefined },
        job: { sourceUrl: null },
        fallbackUrl: "https://example.com/current-page",
      }),
      "https://example.com/current-page",
    );
  });

  it("returns undefined when every signal is empty", () => {
    assert.equal(deriveApplyUrl({}), undefined);
    assert.equal(
      deriveApplyUrl({ parsed: {}, job: { sourceUrl: "" }, fallbackUrl: "" }),
      undefined,
    );
  });

  it("treats null and empty-string stored sourceUrl as absent (keeps falling through)", () => {
    assert.equal(
      deriveApplyUrl({
        job: { sourceUrl: null },
        fallbackUrl: "https://fb.example.com/",
      }),
      "https://fb.example.com/",
    );
    assert.equal(
      deriveApplyUrl({
        job: { sourceUrl: "" },
        fallbackUrl: "https://fb.example.com/",
      }),
      "https://fb.example.com/",
    );
  });
});

// =====================================================================
// findApplyLinkInHtml — DOM-scan fallback for listings where JSON-LD
// doesn't expose a directApply URL (Home Depot's careers site is the
// canonical example)
// =====================================================================
describe("findApplyLinkInHtml", () => {
  it("prefers an absolute ATS-domain link over everything else on the page", () => {
    const html = `
      <nav><a href="/careers/home">Careers</a></nav>
      <a href="#content">Skip</a>
      <a href="https://twitter.com/share" class="share-link">Share</a>
      <a href="https://homedepot.wd5.myworkdayjobs.com/CareerDepot/job/apply/1234" class="primary-cta">Apply Now</a>
      <a href="mailto:recruiter@homedepot.com">Contact</a>
    `;
    assert.equal(
      findApplyLinkInHtml(html),
      "https://homedepot.wd5.myworkdayjobs.com/CareerDepot/job/apply/1234",
    );
  });

  it("falls back to text heuristic when no ATS domain link is present", () => {
    const html = `
      <a href="/about">About</a>
      <a href="https://example.com/apply/engineer-42" class="btn">Apply Today</a>
    `;
    assert.equal(
      findApplyLinkInHtml(html),
      "https://example.com/apply/engineer-42",
    );
  });

  it("uses class/id/aria attributes as apply signals", () => {
    const html = `<a href="https://foo.com/x" class="apply-button">Click</a>`;
    assert.equal(findApplyLinkInHtml(html), "https://foo.com/x");
    const html2 = `<a href="https://foo.com/y" aria-label="Apply for this job">›</a>`;
    assert.equal(findApplyLinkInHtml(html2), "https://foo.com/y");
  });

  it("resolves relative hrefs against the page URL when provided", () => {
    const html = `<a href="/jobs/42/apply" class="apply-btn">Apply</a>`;
    assert.equal(
      findApplyLinkInHtml(html, "https://example.com/jobs/42"),
      "https://example.com/jobs/42/apply",
    );
  });

  it("ignores relative hrefs when no base URL is provided", () => {
    const html = `<a href="/jobs/42/apply" class="apply-btn">Apply</a>`;
    assert.equal(findApplyLinkInHtml(html), undefined);
  });

  it("ignores javascript:, mailto:, and anchor-only hrefs even when text matches", () => {
    const html = `
      <a href="javascript:void(0)" class="apply">Apply</a>
      <a href="#apply">Apply</a>
      <a href="mailto:x@y.com">Apply via email</a>
    `;
    assert.equal(findApplyLinkInHtml(html), undefined);
  });

  it("returns undefined when the page has no apply signals at all", () => {
    const html = `<nav><a href="/home">Home</a></nav><footer><a href="/privacy">Privacy</a></footer>`;
    assert.equal(findApplyLinkInHtml(html), undefined);
  });
});

// =====================================================================
// End-to-end: extract + backfill on the real Home Depot fixture
// =====================================================================
describe("refresh pipeline end-to-end (no AI key)", () => {
  it("pulls structured sections out of the Home Depot JSON-LD description body", async () => {
    const result = await extractAndClassifyJob({
      url: HOME_DEPOT_URL,
      html: HOME_DEPOT_HTML,
      // apiKey intentionally omitted — we test the deterministic
      // JSON-LD + heuristic-split path. The AI fallback is covered
      // separately by integration tests (if/when we run them).
    });

    assert.equal(result.ok, true);
    assert.ok(result.parsed, "parsed must be present");
    const parsed = result.parsed!;
    assert.equal(parsed.confidence, "high", "JSON-LD JobPosting should yield high confidence");
    assert.equal(parsed.title, "Software Engineer Manager (Remote)");
    assert.equal(parsed.company, "The Home Depot");
    assert.equal(parsed.location, "Atlanta, GA, US");

    // The regression: these were null even though the description body
    // contains the sections. `splitDescriptionSections` must populate
    // them before the route's backfill runs.
    assert.ok(
      (parsed.responsibilities?.length ?? 0) > 0,
      "responsibilities should be extracted from description body",
    );
    assert.ok(
      (parsed.qualifications?.length ?? 0) > 0,
      "qualifications should be extracted from description body",
    );
  });

  it("the backfill fills exactly the client-reported missing details when the row has no sections stored", async () => {
    const result = await extractAndClassifyJob({
      url: HOME_DEPOT_URL,
      html: HOME_DEPOT_HTML,
    });
    assert.ok(result.parsed);
    const parsed = result.parsed!;

    const row = makeRow({
      details: {}, // fresh extract never populated the structured sections
    });

    // Mirrors what the jobseeker extension's detectMissingFields sends
    // for a tracked job whose DTO has empty responsibilities/requirements/
    // qualifications/benefits. The DTO keys are translated to the DB
    // column paths by the client before the request goes out.
    const missingFields = [
      "details.responsibilities",
      "details.requirements",
      "details.qualifications",
      "details.benefits",
    ];

    const { updates, updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      url: HOME_DEPOT_URL,
      missingFields,
    });

    // At minimum responsibilities and qualifications come through from
    // the Home Depot body. Benefits and requirements are optional
    // since the source page doesn't always have those sections.
    assert.ok(
      updatedFields.includes("details.responsibilities"),
      "responsibilities should have been backfilled",
    );
    assert.ok(
      updatedFields.includes("details.qualifications"),
      "qualifications should have been backfilled",
    );
    assert.ok(updates.details, "details must be present in updates");
  });

  it("re-running against an already-populated row is a no-op (idempotent)", async () => {
    const result = await extractAndClassifyJob({
      url: HOME_DEPOT_URL,
      html: HOME_DEPOT_HTML,
    });
    const parsed = result.parsed!;

    // Pretend the first refresh already filled everything.
    const row = makeRow({
      details: {
        responsibilities: parsed.responsibilities ?? ["prefilled"],
        requirements: parsed.requirements ?? ["prefilled"],
        qualifications: parsed.qualifications ?? ["prefilled"],
        benefits: parsed.benefits ?? ["prefilled"],
      },
    });

    const { updatedFields } = computeRefreshBackfill({
      row,
      parsed,
      url: HOME_DEPOT_URL,
      missingFields: [
        "details.responsibilities",
        "details.requirements",
        "details.qualifications",
        "details.benefits",
      ],
    });

    assert.deepEqual(updatedFields, [], "no column should change on the second refresh");
  });
});
