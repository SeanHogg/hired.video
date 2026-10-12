/**
 * Anonymous form submission (#1586): `POST /api/studio/forms/:id/submit` is
 * optional-auth, so the body it accepts from a signed-out viewer must stay
 * bounded. Pins the accepted shape (what EngagementFormDialog actually
 * posts) and the caps. Who may submit is pinned in
 * services/studio/__tests__/public-engagement.test.ts.
 *
 * Run: node --import tsx --test src/routes/__tests__/studio-form-submit.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FormSubmitSchema } from "../studio-features/forms.js";

/** What the playback overlay's form dialog posts for a lead-capture form. */
const ANONYMOUS_SUBMISSION = {
  answers: { email: "sam@acme.com", role: "Recruiter" },
  timestampSec: 2.4,
};

describe("FormSubmitSchema", () => {
  it("accepts an anonymous viewer's submission from the playback overlay", () => {
    const parsed = FormSubmitSchema.safeParse(ANONYMOUS_SUBMISSION);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data, ANONYMOUS_SUBMISSION);
  });

  it("accepts the embed player's optional video + referrer context", () => {
    const parsed = FormSubmitSchema.safeParse({
      ...ANONYMOUS_SUBMISSION,
      videoId: "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55",
      referrer: "https://acme.com/careers",
    });
    assert.ok(parsed.success);
  });

  it("accepts exactly 50 answers (boundary) and refuses 51", () => {
    const answers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`field_${i}`, "x"]));
    assert.ok(FormSubmitSchema.safeParse({ answers: answers(50) }).success);
    assert.equal(FormSubmitSchema.safeParse({ answers: answers(51) }).success, false);
  });

  it("accepts a 2000-char answer and refuses 2001", () => {
    assert.ok(FormSubmitSchema.safeParse({ answers: { note: "a".repeat(2000) } }).success);
    assert.equal(FormSubmitSchema.safeParse({ answers: { note: "a".repeat(2001) } }).success, false);
  });

  it("refuses oversized keys, referrers and missing answers", () => {
    assert.equal(FormSubmitSchema.safeParse({ answers: { ["k".repeat(65)]: "x" } }).success, false);
    assert.equal(FormSubmitSchema.safeParse({ answers: {}, referrer: "r".repeat(2049) }).success, false);
    assert.equal(FormSubmitSchema.safeParse({ timestampSec: 1 }).success, false);
    assert.equal(FormSubmitSchema.safeParse(null).success, false);
  });
});
