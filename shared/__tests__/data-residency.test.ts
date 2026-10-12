import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildJurisdiction,
  matchesJurisdiction,
  EEA_COUNTRIES,
  US_PRIVACY_STATES,
  JURISDICTION_OPTIONS,
  JURISDICTION_DISPLAY_LABELS,
} from "../jurisdictions.js";
import {
  marketStatus,
  isPromotableMarket,
  MARKET_STATUS,
  PROMOTABLE_MARKET_ISO2,
} from "../launch-markets.js";
import {
  getPostalPattern,
  isValidPostalCode,
  POSTAL_PATTERNS,
} from "../postal-codes.js";

/**
 * #1964 — data-residency lookups/resolvers: valid → expected region,
 * unknown → safe fallback, postal-code format validation per country.
 */

// ── jurisdictions.ts ───────────────────────────────────────────────────
describe("buildJurisdiction", () => {
  it("maps known countries to their region", () => {
    assert.equal(buildJurisdiction("US"), "US");
    assert.equal(buildJurisdiction("CA"), "CA");
    assert.equal(buildJurisdiction("MX"), "MX");
    assert.equal(buildJurisdiction("GB"), "UK");
    assert.equal(buildJurisdiction("DE"), "EEA");
    assert.equal(buildJurisdiction("FR"), "EEA");
  });

  it("is case-insensitive and trims input", () => {
    assert.equal(buildJurisdiction("  us  "), "US");
    assert.equal(buildJurisdiction("de"), "EEA");
  });

  it("appends subdivision only for US and CA", () => {
    assert.equal(buildJurisdiction("US", "CA"), "US-CA");
    assert.equal(buildJurisdiction("CA", "QC"), "CA-QC");
    assert.equal(buildJurisdiction("us", "va"), "US-VA");
  });

  it("uses country code as EEA subdivision", () => {
    assert.equal(buildJurisdiction("DE", "BY"), "EEA-DE");
  });

  it("ignores subdivision for MX / UK", () => {
    assert.equal(buildJurisdiction("MX", "JAL"), "MX");
    assert.equal(buildJurisdiction("GB", "ENG"), "UK");
  });

  it("falls back to ROW for unknown / empty (safe fallback)", () => {
    assert.equal(buildJurisdiction("ZZ"), "ROW");
    assert.equal(buildJurisdiction(null), "ROW");
    assert.equal(buildJurisdiction(undefined), "ROW");
    assert.equal(buildJurisdiction(""), "ROW");
    assert.equal(buildJurisdiction("BR", "SP"), "ROW");
  });
});

describe("matchesJurisdiction", () => {
  it("empty pattern list never matches (safe default)", () => {
    assert.equal(matchesJurisdiction("US-CA", []), false);
  });

  it("region-only pattern matches base region but not a subdivision", () => {
    assert.equal(matchesJurisdiction("US", ["US"]), true);
    assert.equal(matchesJurisdiction("US-CA", ["US"]), false);
  });

  it("exact subdivision pattern", () => {
    assert.equal(matchesJurisdiction("US-CA", ["US-CA"]), true);
    assert.equal(matchesJurisdiction("US-VA", ["US-CA"]), false);
  });

  it("wildcard subdivision matches any subdivision including none", () => {
    assert.equal(matchesJurisdiction("US-CA", ["US-*"]), true);
    assert.equal(matchesJurisdiction("US", ["US-*"]), true);
    assert.equal(matchesJurisdiction("CA-QC", ["US-*"]), false);
  });

  it("EEA wildcard matches member-country jurisdictions", () => {
    assert.equal(matchesJurisdiction("EEA-DE", ["EEA-*"]), true);
    assert.equal(matchesJurisdiction("EEA", ["EEA-*"]), true);
  });

  it("matches when at least one of several patterns hits", () => {
    assert.equal(matchesJurisdiction("CA-ON", ["US-*", "CA-*"]), true);
  });

  it("no false match across regions", () => {
    assert.equal(matchesJurisdiction("ROW", ["US-*", "EEA-*", "CA-*"]), false);
  });
});

describe("jurisdiction data integrity", () => {
  it("every selector option has a display label", () => {
    for (const opt of JURISDICTION_OPTIONS) {
      assert.ok(JURISDICTION_DISPLAY_LABELS[opt]?.trim().length > 0, `${opt} missing label`);
    }
  });

  it("selector options are unique", () => {
    assert.equal(new Set(JURISDICTION_OPTIONS).size, JURISDICTION_OPTIONS.length);
  });

  it("EEA + US privacy sets are non-empty and use 2-letter codes", () => {
    assert.ok(EEA_COUNTRIES.size > 20);
    for (const c of EEA_COUNTRIES) assert.match(c, /^[A-Z]{2}$/);
    assert.ok(US_PRIVACY_STATES.has("CA"));
    for (const s of US_PRIVACY_STATES) assert.match(s, /^[A-Z]{2}$/);
  });
});

// ── launch-markets.ts ──────────────────────────────────────────────────
describe("launch markets", () => {
  it("resolves declared market statuses", () => {
    assert.equal(marketStatus("US"), "live");
    assert.equal(marketStatus("CA"), "building");
    assert.equal(marketStatus("MX"), "building");
  });

  it("is case-insensitive", () => {
    assert.equal(marketStatus("us"), "live");
  });

  it("unknown / nullish defaults to planned (hidden)", () => {
    assert.equal(marketStatus("AU"), "planned");
    assert.equal(marketStatus(null), "planned");
    assert.equal(marketStatus(undefined), "planned");
    assert.equal(marketStatus(""), "planned");
  });

  it("isPromotableMarket only true for live + building", () => {
    assert.equal(isPromotableMarket("US"), true);
    assert.equal(isPromotableMarket("CA"), true);
    assert.equal(isPromotableMarket("AU"), false);
    assert.equal(isPromotableMarket(null), false);
  });

  it("PROMOTABLE_MARKET_ISO2 matches the live+building set", () => {
    const expected = Object.entries(MARKET_STATUS)
      .filter(([, s]) => s !== "planned")
      .map(([k]) => k)
      .sort();
    assert.deepEqual([...PROMOTABLE_MARKET_ISO2].sort(), expected);
  });
});

// ── postal-codes.ts ────────────────────────────────────────────────────
describe("postal codes", () => {
  it("getPostalPattern is case-insensitive and undefined for unsupported", () => {
    assert.ok(getPostalPattern("us"));
    assert.ok(getPostalPattern("US"));
    assert.equal(getPostalPattern("ZZ"), undefined);
    assert.equal(getPostalPattern(null), undefined);
    assert.equal(getPostalPattern(undefined), undefined);
  });

  it("validates US ZIP (5 and ZIP+4) and rejects malformed", () => {
    assert.ok(isValidPostalCode("US", "12345"));
    assert.ok(isValidPostalCode("US", "12345-6789"));
    assert.ok(!isValidPostalCode("US", "1234"));
    assert.ok(!isValidPostalCode("US", "ABCDE"));
    assert.ok(!isValidPostalCode("US", "12345-678"));
  });

  it("validates Canadian postal codes (space optional, banned letters)", () => {
    assert.ok(isValidPostalCode("CA", "K1A 0B1"));
    assert.ok(isValidPostalCode("CA", "K1A0B1"));
    assert.ok(isValidPostalCode("CA", "k1a 0b1")); // case-insensitive
    assert.ok(!isValidPostalCode("CA", "D1A 0B1")); // D not allowed at start
    assert.ok(!isValidPostalCode("CA", "12345"));
  });

  it("validates 5-digit MX / DE / FR", () => {
    assert.ok(isValidPostalCode("MX", "01000"));
    assert.ok(isValidPostalCode("DE", "10115"));
    assert.ok(isValidPostalCode("FR", "75001"));
    assert.ok(!isValidPostalCode("MX", "1000"));
    assert.ok(!isValidPostalCode("DE", "ABCDE"));
  });

  it("validates UK postcodes of varying lengths", () => {
    assert.ok(isValidPostalCode("GB", "SW1A 1AA"));
    assert.ok(isValidPostalCode("GB", "M1 1AA"));
    assert.ok(isValidPostalCode("GB", "B33 8TH"));
    assert.ok(!isValidPostalCode("GB", "123"));
  });

  it("accepts any non-empty value for unsupported countries (free-form fallback)", () => {
    assert.ok(isValidPostalCode("ZZ", "anything-goes"));
    assert.ok(isValidPostalCode(null, "x"));
  });

  it("rejects blank/whitespace value regardless of country (boundary)", () => {
    assert.ok(!isValidPostalCode("US", ""));
    assert.ok(!isValidPostalCode("US", "   "));
    assert.ok(!isValidPostalCode("ZZ", "   "));
  });

  it("every registered pattern has a non-empty placeholder", () => {
    for (const [cc, p] of Object.entries(POSTAL_PATTERNS)) {
      assert.ok(p.placeholder.trim().length > 0, `${cc} empty placeholder`);
      assert.ok(p.pattern instanceof RegExp, `${cc} pattern not a RegExp`);
    }
  });
});
