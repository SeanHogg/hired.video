import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupAgainst,
  extractApplyUrls,
  guessCompanyAndTitle,
} from "../email-integration/dedup.js";
import type { NormalisedEmail } from "../email-integration/providers/types.js";

/** Run: node --import tsx --test src/services/__tests__/email-dedup.test.ts */

function mkEmail(overrides: Partial<NormalisedEmail> = {}): NormalisedEmail {
  return {
    providerMessageId: "m-1",
    providerThreadId: null,
    fromEmail: "recruiter@acme.com",
    fromName: "Acme Recruiter",
    subject: "Senior Engineer at Acme",
    snippet: "",
    bodyHtml: null,
    bodyText: "",
    receivedAt: new Date(),
    rawMetadata: {},
    ...overrides,
  };
}

describe("extractApplyUrls", () => {
  it("pulls greenhouse / lever / ashby URLs out of body text", () => {
    const urls = extractApplyUrls(
      mkEmail({
        bodyText:
          "Apply here: https://boards.greenhouse.io/acme/jobs/1234?utm=email or via lever https://jobs.lever.co/acme/abcd-uuid",
      }),
    );
    assert.ok(urls.some((u) => u.includes("greenhouse.io/acme/jobs/1234")));
    assert.ok(urls.some((u) => u.includes("jobs.lever.co/acme")));
  });

  it("strips trailing punctuation glued to URLs", () => {
    const urls = extractApplyUrls(
      mkEmail({ bodyText: "(see https://jobs.workday.com/acme/posting/job-1234)." }),
    );
    assert.ok(urls.some((u) => u.endsWith("job-1234")));
  });
});

describe("guessCompanyAndTitle", () => {
  it("parses 'Title at Company' subjects", () => {
    const g = guessCompanyAndTitle(mkEmail({ subject: "Senior Engineer at Acme — interview prep" }));
    assert.equal(g.title, "Senior Engineer");
    assert.equal(g.company, "Acme");
  });

  it("parses 'Application for Title — Company' subjects", () => {
    const g = guessCompanyAndTitle(
      mkEmail({ subject: "Application for: Staff Software Engineer – Globex" }),
    );
    assert.equal(g.title, "Staff Software Engineer");
    assert.equal(g.company, "Globex");
  });

  it("falls back to sender domain for company", () => {
    const g = guessCompanyAndTitle(
      mkEmail({ fromEmail: "recruiter@stripe.com", subject: "Quick intro" }),
    );
    assert.equal(g.company, "stripe");
    assert.equal(g.title, null);
  });
});

describe("dedupAgainst", () => {
  it("matches by apply URL exactly", () => {
    const email = mkEmail({
      bodyText: "Apply here: https://boards.greenhouse.io/acme/jobs/123",
    });
    const result = dedupAgainst(email, {
      applications: [],
      savedJobs: [],
      jobs: [
        {
          id: "job-1",
          title: "Different Title",
          company: "Acme",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
        } as any,
      ],
      threadLinkedJobId: null,
    });
    assert.equal(result.jobId, "job-1");
    assert.equal(result.method, "apply_url");
    assert.ok(result.score >= 0.9);
  });

  it("falls back to company+title fuzzy match when no URL match", () => {
    const email = mkEmail({ subject: "Senior Engineer at Acme" });
    const result = dedupAgainst(email, {
      applications: [],
      savedJobs: [],
      jobs: [
        { id: "job-1", title: "Senior Engineer", company: "Acme", applyUrl: null } as any,
        { id: "job-2", title: "Junior Engineer", company: "Globex", applyUrl: null } as any,
      ],
      threadLinkedJobId: null,
    });
    assert.equal(result.jobId, "job-1");
    assert.equal(result.method, "company_title");
    assert.ok(result.score >= 0.6);
  });

  it("returns null link when company+title score below threshold", () => {
    const email = mkEmail({ subject: "Lunch tomorrow" });
    const result = dedupAgainst(email, {
      applications: [],
      savedJobs: [],
      jobs: [
        { id: "job-1", title: "Senior Engineer", company: "Acme", applyUrl: null } as any,
      ],
      threadLinkedJobId: null,
    });
    assert.equal(result.jobId, null);
    assert.equal(result.method, null);
  });

  it("thread carry takes precedence", () => {
    const email = mkEmail();
    const result = dedupAgainst(email, {
      applications: [],
      savedJobs: [],
      jobs: [],
      threadLinkedJobId: "job-prior",
    });
    assert.equal(result.jobId, "job-prior");
    assert.equal(result.method, "thread_id");
  });
});
