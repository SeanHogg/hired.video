/**
 * #2230 — who a résumé vision-OCR call is recorded against in ai_usage_records.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ocrBillingOpts } from "../ocrBilling.js";

const USER = "6f1c2a0e-4b7d-4c1a-9a51-0d6e2b8f3c11";
const HOUSE = "00000000-0000-4000-8000-00000000c0de";

describe("ocrBillingOpts", () => {
  it("bills a signed-in uploader normally (no override)", () => {
    assert.deepEqual(ocrBillingOpts(USER, HOUSE), {});
  });

  it("records an anonymous upload against the house account as exempt", () => {
    assert.deepEqual(ocrBillingOpts(undefined, HOUSE), { billedUserId: HOUSE, exempt: true });
    assert.deepEqual(ocrBillingOpts(null, `  ${HOUSE}\n`), { billedUserId: HOUSE, exempt: true });
  });

  it("records nothing for an anonymous upload when no house account is configured", () => {
    assert.deepEqual(ocrBillingOpts(undefined, undefined), {});
    assert.deepEqual(ocrBillingOpts("", "   "), {});
  });
});
