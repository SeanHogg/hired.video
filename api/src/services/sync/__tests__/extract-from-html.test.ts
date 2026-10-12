/**
 * Vendor Sync — extract-from-html schema tests.
 *
 * The LLM call itself is not exercised (would require a real provider
 * key + network). We test the schema-validation surface around it,
 * which is what catches drift between the prompt and the merge engine.
 *
 * Run: node --import tsx --test src/services/sync/__tests__/extract-from-html.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ExtractedJsonResumeSchema } from "../extract-from-html.js";

describe("ExtractedJsonResumeSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = ExtractedJsonResumeSchema.safeParse({});
    assert.strictEqual(result.success, true);
  });

  it("accepts a fully populated JSON Resume blob", () => {
    const blob = {
      basics: {
        name: "Ada Lovelace",
        label: "Senior Analyst",
        email: "ada@example.com",
        summary: "Pioneering computer scientist.",
        location: { city: "London", region: "", countryCode: "GB" },
      },
      work: [
        {
          name: "Babbage & Co",
          position: "Lead Analyst",
          startDate: "1843",
          endDate: "1852",
          summary: "Wrote the first algorithm.",
          highlights: ["Note G"],
        },
      ],
      education: [
        { institution: "Private Tutor", area: "Mathematics", studyType: "Private", startDate: "1830", endDate: "1840", courses: [] },
      ],
      skills: [{ name: "Algorithm design", level: "expert", keywords: ["analysis"] }],
      projects: [{ name: "Analytical Engine notes", description: "Translation + notes", highlights: [] }],
    };
    const result = ExtractedJsonResumeSchema.safeParse(blob);
    assert.strictEqual(result.success, true);
  });

  it("rejects a skill entry missing the required name", () => {
    const blob = { skills: [{ level: "expert" }] };
    const result = ExtractedJsonResumeSchema.safeParse(blob);
    assert.strictEqual(result.success, false);
  });

  it("defaults work[].highlights to an empty array when omitted", () => {
    const blob = { work: [{ name: "Acme", position: "Engineer" }] };
    const result = ExtractedJsonResumeSchema.safeParse(blob);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.deepStrictEqual(result.data.work?.[0].highlights, []);
    }
  });

  it("tolerates extra keys without dropping known ones", () => {
    const blob = { basics: { name: "Ada", extra: "ignored" } };
    const result = ExtractedJsonResumeSchema.safeParse(blob);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.basics?.name, "Ada");
    }
  });
});
