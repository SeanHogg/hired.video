/**
 * Tests for the partner-domain registry.
 *
 * These guard against the silent-drift failure mode that prompted
 * extracting this list in the first place: a new partner DNS record
 * pointing at hired.video, no corresponding CORS allow, every browser
 * call gets 403'd. If a partner is removed from PARTNER_DOMAINS, the
 * test will fail and the reviewer has to consciously confirm.
 *
 * Run: node --import tsx --test src/services/__tests__/partner-domains.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PARTNER_DOMAINS,
  expandPartnerOrigins,
} from "../../../../shared/security/partnerDomains.js";

const REQUIRED_DOMAINS = [
  "hired.video",
  "connecttalent.today",
  "fixfasterllc.com",
  "freemiummedia.com",
  "hirefractionaltalent.com",
  "hireus.video",
  "incuprise.com",
  "mymetaresu.me",
  "mymetaresume.com",
  "myvideoresu.me",
  "reelresu.me",
];

describe("PARTNER_DOMAINS registry", () => {
  it("contains every domain currently pointed at the API", () => {
    for (const d of REQUIRED_DOMAINS) {
      assert.ok(
        PARTNER_DOMAINS.includes(d as (typeof PARTNER_DOMAINS)[number]),
        `${d} must be in the registry`,
      );
    }
  });

  it("has no duplicates", () => {
    assert.equal(new Set(PARTNER_DOMAINS).size, PARTNER_DOMAINS.length);
  });
});

describe("expandPartnerOrigins", () => {
  it("emits two origins per domain (https + www variant)", () => {
    const origins = expandPartnerOrigins();
    assert.equal(origins.length, PARTNER_DOMAINS.length * 2);
  });

  it("includes both https and www variants for every domain", () => {
    const origins = expandPartnerOrigins();
    for (const d of PARTNER_DOMAINS) {
      assert.ok(origins.includes(`https://${d}`), `https://${d} missing`);
      assert.ok(origins.includes(`https://www.${d}`), `https://www.${d} missing`);
    }
  });

  it("never emits http:// origins (https-only in production)", () => {
    const origins = expandPartnerOrigins();
    for (const o of origins) {
      assert.ok(o.startsWith("https://"), `non-https origin leaked: ${o}`);
    }
  });
});
