/**
 * Tests for the community-resources submission validator + shared helpers.
 *
 * Covers (gap #1836):
 *   • SubmitSchema       — happy path, boundary (min lengths), and the
 *                          "must have a link OR phone" refine (exception).
 *   • resourceHasContact — link-only, phone-only, both, neither.
 *
 * Fixtures mirror the real seeded TX/MI directory shape (migration 0191)
 * rather than synthetic blanks, per the real-fixtures testing rule.
 *
 * Run: node --import tsx --test src/routes/__tests__/community-resources-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SubmitSchema } from "../community-resources.js";
import { resourceHasContact } from "../../../../shared/community-resources.js";

// A realistic submission shaped like the seeded TWC entry.
const BASE = {
  title: "Texas Workforce Commission — Unemployment Benefits",
  description: "Apply for and manage unemployment benefit claims in Texas.",
  category: "unemployment" as const,
  audience: "job_seeker" as const,
  countryCode: "us",
  stateCode: "tx",
};

describe("SubmitSchema", () => {
  it("accepts a link-only submission (job board shape)", () => {
    const r = SubmitSchema.safeParse({
      ...BASE,
      title: "WorkInTexas.com",
      url: "https://www.workintexas.com",
    });
    assert.equal(r.success, true);
  });

  it("accepts a phone-only submission (claimant help-line shape)", () => {
    const r = SubmitSchema.safeParse({ ...BASE, phone: "800-939-6631" });
    assert.equal(r.success, true);
  });

  it("accepts both a link and a phone", () => {
    const r = SubmitSchema.safeParse({
      ...BASE,
      url: "https://www.twc.texas.gov/programs/unemployment-benefits",
      phone: "800-939-6631",
    });
    assert.equal(r.success, true);
  });

  it("rejects a submission with neither link nor phone", () => {
    const r = SubmitSchema.safeParse({ ...BASE });
    assert.equal(r.success, false);
  });

  it("treats empty-string url + phone as no contact", () => {
    const r = SubmitSchema.safeParse({ ...BASE, url: "", phone: "" });
    assert.equal(r.success, false);
  });

  it("rejects a too-short title (boundary)", () => {
    const r = SubmitSchema.safeParse({ ...BASE, title: "ab", phone: "211" });
    assert.equal(r.success, false);
  });

  it("rejects a too-short description (boundary)", () => {
    const r = SubmitSchema.safeParse({ ...BASE, description: "short", phone: "211" });
    assert.equal(r.success, false);
  });

  it("rejects an unknown category", () => {
    const r = SubmitSchema.safeParse({ ...BASE, category: "not_a_category", phone: "211" });
    assert.equal(r.success, false);
  });

  it("rejects a malformed url", () => {
    const r = SubmitSchema.safeParse({ ...BASE, url: "not-a-url" });
    assert.equal(r.success, false);
  });
});

describe("resourceHasContact", () => {
  it("is true when only a url is present", () => {
    assert.equal(resourceHasContact({ url: "https://x.gov", phone: null }), true);
  });
  it("is true when only a phone is present", () => {
    assert.equal(resourceHasContact({ url: null, phone: "211" }), true);
  });
  it("is false when both are blank/whitespace", () => {
    assert.equal(resourceHasContact({ url: "  ", phone: "" }), false);
  });
});
