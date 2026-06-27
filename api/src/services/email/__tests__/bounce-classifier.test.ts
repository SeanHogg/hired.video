/**
 * #1975 — provider bounce/complaint → hard-suppression classifier.
 *
 * Pins the event taxonomy (which kinds suppress vs which are ignored), the
 * field-name tolerance (event/type/status/category × email/to/recipient), the
 * envelope shapes (object / array / {data}/{events}), dedup, and the malformed-
 * input safety (never throws, returns []).
 *
 * Run: node --import tsx --test src/services/email/__tests__/bounce-classifier.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { extractHardSuppressions } from "../bounce-classifier.js";

describe("extractHardSuppressions", () => {
  it("suppresses hard bounces, spam complaints, blocks, unsubscribes", () => {
    const body = [
      { event: "hard_bounce", email: "a@x.com" },
      { event: "spam_complaint", email: "b@x.com" },
      { type: "block", email: "c@x.com" },
      { status: "unsubscribe", email: "d@x.com" },
      { event: "mark_as_spam", recipient: "e@x.com" },
    ];
    const out = extractHardSuppressions(body);
    assert.deepEqual(
      out.map((s) => s.email).sort(),
      ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"],
    );
  });

  it("ignores soft bounces, delivered, opens, clicks", () => {
    const body = [
      { event: "soft_bounce", email: "a@x.com" },
      { event: "delivered", email: "b@x.com" },
      { event: "open", email: "c@x.com" },
      { event: "click", email: "d@x.com" },
    ];
    assert.deepEqual(extractHardSuppressions(body), []);
  });

  it("normalizes casing + punctuation in the event kind and the email", () => {
    const out = extractHardSuppressions([{ event: "Hard-Bounce", email: "USER@X.COM" }]);
    assert.deepEqual(out, [{ email: "user@x.com", reason: "hard_bounce" }]);
  });

  it("accepts a single object, a {data:[]} and {events:[]} envelope", () => {
    assert.equal(extractHardSuppressions({ event: "spam", email: "a@x.com" }).length, 1);
    assert.equal(extractHardSuppressions({ data: [{ event: "spam", email: "b@x.com" }] }).length, 1);
    assert.equal(extractHardSuppressions({ events: [{ event: "spam", email: "c@x.com" }] }).length, 1);
  });

  it("dedupes by address (first reason wins)", () => {
    const out = extractHardSuppressions([
      { event: "hard_bounce", email: "a@x.com" },
      { event: "spam", email: "a@x.com" },
    ]);
    assert.deepEqual(out, [{ email: "a@x.com", reason: "hard_bounce" }]);
  });

  it("drops rows with a missing / malformed address", () => {
    const out = extractHardSuppressions([
      { event: "hard_bounce" },
      { event: "hard_bounce", email: "not-an-email" },
      { event: "hard_bounce", email: "ok@x.com" },
    ]);
    assert.deepEqual(out, [{ email: "ok@x.com", reason: "hard_bounce" }]);
  });

  it("never throws on garbage input — returns []", () => {
    assert.deepEqual(extractHardSuppressions(null), []);
    assert.deepEqual(extractHardSuppressions("nonsense"), []);
    assert.deepEqual(extractHardSuppressions(42), []);
    assert.deepEqual(extractHardSuppressions([null, 1, "x", {}]), []);
  });
});
