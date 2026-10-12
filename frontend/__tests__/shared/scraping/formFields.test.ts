/**
 * DOM-based tests for @shared/scraping/formFields.ts.
 *
 * Runs under Vitest's jsdom environment. Builds a Document from HTML and
 * passes it (plus a URL) into the extractor — same contract the Chrome
 * extension uses against a live `document`.
 */

import { describe, it, expect } from "vitest";
import { extractFormFields, resolveLabel } from "@shared/scraping/formFields.ts";

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// ---------------------------------------------------------------------------
// Generic extractor — standard HTML forms
// ---------------------------------------------------------------------------

describe("extractFormFields — generic form", () => {
  it("extracts text, email, tel, textarea, select, radio with labels", () => {
    const html = `
      <html><body>
        <form action="/apply" method="post">
          <label for="first_name">First Name</label>
          <input id="first_name" name="first_name" type="text" required />

          <label for="email">Email</label>
          <input id="email" name="email" type="email" required />

          <label for="phone">Phone</label>
          <input id="phone" name="phone" type="tel" />

          <label for="cover">Cover letter</label>
          <textarea id="cover" name="cover"></textarea>

          <label for="loc">Location</label>
          <select id="loc" name="location">
            <option value="">Select…</option>
            <option value="sf">San Francisco</option>
            <option value="nyc">New York</option>
          </select>

          <fieldset>
            <legend>Are you authorized to work in the US?</legend>
            <label><input type="radio" name="work_auth" value="yes" /> Yes</label>
            <label><input type="radio" name="work_auth" value="no" /> No</label>
          </fieldset>

          <input type="submit" value="Submit" />
        </form>
      </body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");

    // submit button excluded; radio collapsed into single field w/ options
    const byId = new Map(fields.map((f) => [f.id, f]));
    expect(byId.get("first_name")?.type).toBe("text");
    expect(byId.get("first_name")?.required).toBe(true);
    expect(byId.get("first_name")?.label).toBe("First Name");

    expect(byId.get("email")?.type).toBe("email");
    expect(byId.get("phone")?.type).toBe("tel");
    expect(byId.get("cover")?.type).toBe("textarea");

    const loc = byId.get("location");
    expect(loc?.type).toBe("select");
    expect(loc?.options).toContain("San Francisco");
    expect(loc?.options).toContain("New York");
    expect(loc?.options).not.toContain("Select…"); // prompt stripped

    const wa = byId.get("work_auth");
    expect(wa?.type).toBe("radio");
    expect(wa?.options).toEqual(["yes", "no"]);
    expect(wa?.label).toMatch(/authorized/i);
  });

  it("picks the form with the MOST fields when multiple forms exist", () => {
    const html = `
      <html><body>
        <form id="newsletter"><input name="email" type="email" /></form>
        <form id="application">
          <input name="first_name" />
          <input name="last_name" />
          <input name="email" type="email" />
          <textarea name="cover"></textarea>
        </form>
      </body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    // Newsletter form's single email field should be excluded (application form has 4)
    const names = fields.map((f) => f.name);
    expect(names).toContain("first_name");
    expect(names).toContain("last_name");
    expect(names).toContain("cover");
    // Only one email field — the application form's — not the newsletter
    const emailFields = fields.filter((f) => f.name === "email");
    expect(emailFields.length).toBe(1);
  });

  it("ignores submit, button, reset, and search inputs", () => {
    const html = `
      <html><body>
        <form>
          <input name="search" type="search" />
          <input name="email" type="email" />
          <button type="submit">Submit</button>
          <input type="reset" value="Clear" />
        </form>
      </body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.map((f) => f.name)).toEqual(["email"]);
  });

  it("ignores CSRF, captcha, honeypot, and token fields", () => {
    const html = `
      <html><body>
        <form>
          <input name="authenticity_token" type="text" />
          <input name="csrf_token" type="text" />
          <input name="captcha_response" type="text" />
          <input name="honeypot_email" type="text" />
          <input name="real_email" type="email" />
        </form>
      </body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.map((f) => f.name)).toEqual(["real_email"]);
  });

  it("falls back to placeholder when there's no label or aria-label", () => {
    const html = `<html><body><form>
      <input name="city" type="text" placeholder="Your city" />
    </form></body></html>`;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields[0].label).toBe("Your city");
  });

  it("falls back to aria-label when present", () => {
    const html = `<html><body><form>
      <input name="nickname" type="text" aria-label="Preferred nickname" />
    </form></body></html>`;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields[0].label).toBe("Preferred nickname");
  });

  it("humanizes field name when nothing else is available", () => {
    const html = `<html><body><form>
      <input name="job_application[first_name]" type="text" />
    </form></body></html>`;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields[0].label).toBe("First Name");
  });

  it("returns empty fields array for a page with no forms", () => {
    const html = `<html><body><h1>About Us</h1></body></html>`;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/about");
    expect(fields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ATS-specific extractors
// ---------------------------------------------------------------------------

describe("extractFormFields — ATS-specific", () => {
  it("Greenhouse: finds #application_form and extracts ordered fields", () => {
    const html = `
      <html><body>
        <form id="application_form" action="https://boards.greenhouse.io/acme/jobs/123">
          <input name="authenticity_token" type="text" />
          <label for="first_name">First Name</label>
          <input id="first_name" name="first_name" type="text" required />
          <label for="last_name">Last Name</label>
          <input id="last_name" name="last_name" type="text" required />
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required />
        </form>
      </body></html>
    `;
    const got = extractFormFields(
      docFromHtml(html) as any,
      "https://boards.greenhouse.io/acme/jobs/123",
    );
    expect(got.atsProvider).toBe("greenhouse");
    expect(got.fields.map((f) => f.name)).toEqual(["first_name", "last_name", "email"]);
  });

  it("Lever: finds form.posting-apply", () => {
    const html = `
      <html><body>
        <form class="posting-apply">
          <label for="resume">Resume</label>
          <input id="resume" name="resume" type="file" />
          <label for="name">Full name</label>
          <input id="name" name="name" type="text" />
          <label for="email">Email</label>
          <input id="email" name="email" type="email" />
        </form>
      </body></html>
    `;
    const got = extractFormFields(docFromHtml(html) as any, "https://jobs.lever.co/acme/pm");
    expect(got.atsProvider).toBe("lever");
    expect(got.fields.map((f) => f.name).sort()).toEqual(["email", "name", "resume"]);
  });

  it("Workday: finds form[data-automation-id] and uses automation IDs", () => {
    const html = `
      <html><body>
        <form data-automation-id="jobApplicationForm">
          <label for="wd-name">Full name</label>
          <input id="wd-name" name="name" type="text" data-automation-id="legalName" />
          <label for="wd-email">Email</label>
          <input id="wd-email" name="email" type="email" data-automation-id="email" />
        </form>
      </body></html>
    `;
    const got = extractFormFields(
      docFromHtml(html) as any,
      "https://acme.wd5.myworkdayjobs.com/careers/job/123",
    );
    expect(got.atsProvider).toBe("workday");
    const nameField = got.fields.find((f) => f.id === "legalName");
    expect(nameField?.selector).toBe('[data-automation-id="legalName"]');
  });

  it("Ashby: falls through to generic extractor (no dedicated extractor)", () => {
    const html = `
      <html><body>
        <form class="ashby-application _form">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" />
          <label for="resume">Resume</label>
          <textarea id="resume" name="resume_text"></textarea>
          <label for="why">Why do you want to work here?</label>
          <textarea id="why" name="why_question"></textarea>
        </form>
      </body></html>
    `;
    const got = extractFormFields(
      docFromHtml(html) as any,
      "https://jobs.ashbyhq.com/acme/pm-role/apply",
    );
    // Generic path produced the fields (atsProvider still reports ashby
    // because the URL matches, but the extractor fell through).
    expect(got.atsProvider).toBe("ashby");
    expect(got.fields.length).toBeGreaterThanOrEqual(3);
    expect(got.fields.some((f) => f.label.toLowerCase().includes("why"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Screening questions — large, bad content, long forms
// ---------------------------------------------------------------------------

describe("extractFormFields — screening questions", () => {
  it("handles an application with 20+ open-ended questions", () => {
    const questionFields = Array.from({ length: 25 }, (_, i) => `
      <div class="form-field">
        <label for="q${i}">Question ${i + 1}: Tell us about X${i}?</label>
        <textarea id="q${i}" name="q${i}" required></textarea>
      </div>
    `).join("\n");
    const html = `<html><body><form>${questionFields}</form></body></html>`;

    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.length).toBe(25);
    expect(fields.every((f) => f.type === "textarea")).toBe(true);
    expect(fields.every((f) => f.required)).toBe(true);
    expect(fields[0].label).toMatch(/Question 1/);
    expect(fields[24].label).toMatch(/Question 25/);
  });

  it("extracts options from screening-question selects, preserving order", () => {
    const html = `
      <html><body><form>
        <label for="exp">Years of experience</label>
        <select id="exp" name="years_experience">
          <option value="">Choose one</option>
          <option>0-1</option>
          <option>2-4</option>
          <option>5-7</option>
          <option>8-10</option>
          <option>10+</option>
        </select>
      </form></body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields[0].options).toEqual(["0-1", "2-4", "5-7", "8-10", "10+"]);
  });

  it("tolerates a form with no labels at all (labels default to humanized name)", () => {
    const html = `
      <html><body><form>
        <input name="firstName" />
        <input name="lastName" />
        <input name="phoneNumber" type="tel" />
      </form></body></html>
    `;
    const { fields } = extractFormFields(docFromHtml(html) as any, "https://x.com/apply");
    expect(fields.map((f) => f.label).sort()).toEqual(["First Name", "Last Name", "Phone Number"]);
  });
});

// ---------------------------------------------------------------------------
// resolveLabel — focused tests for the label-resolution fallback chain
// ---------------------------------------------------------------------------

describe("resolveLabel — fallback chain", () => {
  it("explicit <label for> beats all", () => {
    const doc = docFromHtml(`
      <label for="foo">Explicit Label</label>
      <input id="foo" name="foo" aria-label="Aria Label" placeholder="Placeholder" />
    `);
    const el = doc.getElementById("foo")!;
    expect(resolveLabel(doc as any, el as any)).toBe("Explicit Label");
  });

  it("falls to aria-label when no <label> wraps or refers", () => {
    const doc = docFromHtml(`<input id="x" name="x" aria-label="Aria Label" placeholder="Placeholder" />`);
    const el = doc.getElementById("x")!;
    expect(resolveLabel(doc as any, el as any)).toBe("Aria Label");
  });

  it("falls to placeholder when no label or aria", () => {
    const doc = docFromHtml(`<input name="x" placeholder="Type here…" />`);
    const el = doc.querySelector('input[name="x"]')!;
    expect(resolveLabel(doc as any, el as any)).toBe("Type here\u2026");
  });

  it("returns 'Unknown Field' as last resort", () => {
    const doc = docFromHtml(`<input type="text" />`);
    const el = doc.querySelector("input")!;
    expect(resolveLabel(doc as any, el as any)).toBe("Unknown Field");
  });
});
