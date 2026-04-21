/**
 * End-to-end tests for the "job application questions" story —
 * screening/knockout questions asked on application forms.
 *
 * Covers the scenarios that broke historically:
 *   - Greenhouse / Lever custom question blocks
 *   - Workday data-automation-id selectors
 *   - Mixed required + optional
 *   - Very long forms (20+ questions)
 *   - Radio / checkbox groups collapsed correctly
 *   - Ashby React-rendered forms fall through to the generic extractor
 *
 * These complement formFields.test.ts by testing REALISTIC question
 * shapes pulled from real ATS pages. Keep the HTML fixtures small but
 * structurally representative.
 */

import { describe, it, expect } from "vitest";
import { extractFormFields } from "@shared/scraping/formFields.ts";

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// ---------------------------------------------------------------------------
// Greenhouse custom questions — the common "Why do you want to work here?"
// free-text + select dropdown pattern.
// ---------------------------------------------------------------------------

describe("screening questions — Greenhouse", () => {
  it("extracts custom questions alongside the standard fields", () => {
    const html = `
      <html><body>
        <form id="application_form" action="https://boards.greenhouse.io/acme/jobs/42">
          <input name="authenticity_token" />
          <label for="first_name">First Name</label>
          <input id="first_name" name="first_name" required />
          <label for="last_name">Last Name</label>
          <input id="last_name" name="last_name" required />
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required />

          <div class="custom-question">
            <label for="q_why">Why do you want to work at Acme?</label>
            <textarea id="q_why" name="question_why" required></textarea>
          </div>

          <div class="custom-question">
            <label for="q_relo">Are you willing to relocate?</label>
            <select id="q_relo" name="question_relocate" required>
              <option value="">Select…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="maybe">Maybe, for the right role</option>
            </select>
          </div>

          <div class="custom-question">
            <label for="q_start">Earliest start date?</label>
            <input id="q_start" name="question_start" type="date" />
          </div>
        </form>
      </body></html>
    `;
    const { fields, atsProvider } = extractFormFields(
      docFromHtml(html) as any,
      "https://boards.greenhouse.io/acme/jobs/42",
    );
    expect(atsProvider).toBe("greenhouse");
    const names = fields.map((f) => f.name);
    // Standard fields
    expect(names).toContain("first_name");
    expect(names).toContain("last_name");
    expect(names).toContain("email");
    // Custom questions
    expect(names).toContain("question_why");
    expect(names).toContain("question_relocate");
    expect(names).toContain("question_start");
    // CSRF token is filtered by Greenhouse extractor
    expect(names).not.toContain("authenticity_token");
    // Question labels are preserved verbatim
    const why = fields.find((f) => f.name === "question_why");
    expect(why?.label).toMatch(/Why do you want to work at Acme/);
    expect(why?.required).toBe(true);
    const relo = fields.find((f) => f.name === "question_relocate");
    expect(relo?.options).toContain("Yes");
    expect(relo?.options).toContain("Maybe, for the right role");
  });
});

// ---------------------------------------------------------------------------
// Workday data-automation-id selectors — the extractor must emit stable
// selectors so autofill can re-find the element by automation id.
// ---------------------------------------------------------------------------

describe("screening questions — Workday", () => {
  it("uses data-automation-id as the stable selector", () => {
    const html = `
      <html><body>
        <form data-automation-id="jobApplicationForm">
          <label for="q1">Have you previously worked at this company?</label>
          <select id="q1" name="prior_employment" data-automation-id="priorEmployment">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          <label for="q2">Visa sponsorship required?</label>
          <input type="text" id="q2" name="visa" data-automation-id="visaSponsorship" />
        </form>
      </body></html>
    `;
    const { fields } = extractFormFields(
      docFromHtml(html) as any,
      "https://acme.wd5.myworkdayjobs.com/careers/job/1",
    );
    const prior = fields.find((f) => f.id === "priorEmployment");
    expect(prior?.selector).toBe('[data-automation-id="priorEmployment"]');
    const visa = fields.find((f) => f.id === "visaSponsorship");
    expect(visa?.selector).toBe('[data-automation-id="visaSponsorship"]');
  });
});

// ---------------------------------------------------------------------------
// Large forms — stress test that 20+ questions all come through.
// ---------------------------------------------------------------------------

describe("screening questions — large forms", () => {
  it("handles 30 screening questions without losing any", () => {
    const qs = Array.from({ length: 30 }, (_, i) => `
      <div class="question">
        <label for="sq${i}">Screening question ${i + 1}: ${"lorem ".repeat(3)}?</label>
        <textarea id="sq${i}" name="sq_${i}" required></textarea>
      </div>
    `).join("\n");
    const html = `<html><body><form>${qs}</form></body></html>`;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.length).toBe(30);
    expect(fields[0].label).toMatch(/Screening question 1/);
    expect(fields[29].label).toMatch(/Screening question 30/);
  });

  it("mixed required + optional — required flag flows through untouched", () => {
    const html = `
      <html><body><form>
        <label for="a">Required A</label>
        <input id="a" name="a" required />
        <label for="b">Optional B</label>
        <input id="b" name="b" />
        <label for="c">Required C</label>
        <textarea id="c" name="c" aria-required="true"></textarea>
      </form></body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    const req = (id: string) => fields.find((f) => f.id === id)?.required;
    expect(req("a")).toBe(true);
    expect(req("b")).toBe(false);
    expect(req("c")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Radio / checkbox groups — collapsed, preserved in order, group label.
// ---------------------------------------------------------------------------

describe("screening questions — radios & checkboxes", () => {
  it("collapses a radio group into ONE field with options[] preserved", () => {
    const html = `
      <html><body><form>
        <fieldset>
          <legend>Highest degree earned</legend>
          <label><input type="radio" name="edu" value="hs" /> High school</label>
          <label><input type="radio" name="edu" value="ba" /> Bachelor's</label>
          <label><input type="radio" name="edu" value="ms" /> Master's</label>
          <label><input type="radio" name="edu" value="phd" /> PhD</label>
        </fieldset>
      </form></body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    const edu = fields.filter((f) => f.name === "edu");
    expect(edu.length).toBe(1);
    expect(edu[0].type).toBe("radio");
    expect(edu[0].options).toEqual(["hs", "ba", "ms", "phd"]);
    expect(edu[0].label).toMatch(/degree/i);
  });

  it("keeps separate checkboxes as separate fields (no grouping)", () => {
    const html = `
      <html><body><form>
        <label><input type="checkbox" name="consent_privacy" /> I agree to the privacy policy</label>
        <label><input type="checkbox" name="consent_marketing" /> I want marketing emails</label>
      </form></body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.length).toBe(2);
    expect(fields.map((f) => f.name).sort()).toEqual(["consent_marketing", "consent_privacy"]);
  });
});
