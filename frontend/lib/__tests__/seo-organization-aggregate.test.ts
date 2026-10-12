/**
 * Tests for the extension of `generateStructuredData.organization` that
 * folds review aggregate (count + avg) into the schema.org Organization
 * blob as `aggregateRating`. This is the bit Google can render as stars
 * in SERPs when present, so it has to be both consistent (always 1
 * decimal place, integer count) and safely omitted when no reviews exist.
 */

import { describe, it, expect } from "vitest";
import { generateStructuredData } from "../seo";

describe("generateStructuredData.organization", () => {
  it("emits a plain Organization when no review aggregate is provided", () => {
    const out: any = generateStructuredData.organization({
      name: "Acme Inc",
      description: "Things",
      website: "https://acme.test",
      logo: "https://acme.test/logo.png",
      address: "SF",
    });
    expect(out["@type"]).toBe("Organization");
    expect(out.name).toBe("Acme Inc");
    expect(out.url).toBe("https://acme.test");
    expect(out.aggregateRating).toBeUndefined();
  });

  it("attaches an aggregateRating block when review fields are present", () => {
    const out: any = generateStructuredData.organization({
      name: "Acme Inc",
      reviewCount: 42,
      reviewAvgOverall: 4.27,
    });
    expect(out.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.3", // toFixed(1)
      reviewCount: "42",
      bestRating: "5",
      worstRating: "1",
    });
  });

  it("omits aggregateRating when reviewCount is 0", () => {
    const out: any = generateStructuredData.organization({
      name: "Empty",
      reviewCount: 0,
      reviewAvgOverall: 4.5,
    });
    expect(out.aggregateRating).toBeUndefined();
  });

  it("omits aggregateRating when only one of the two fields is present", () => {
    const o1: any = generateStructuredData.organization({
      name: "Half",
      reviewCount: 5,
    });
    const o2: any = generateStructuredData.organization({
      name: "Half",
      reviewAvgOverall: 3.2,
    });
    expect(o1.aggregateRating).toBeUndefined();
    expect(o2.aggregateRating).toBeUndefined();
  });

  it("treats negative or non-number values as missing", () => {
    const out: any = generateStructuredData.organization({
      name: "Bad",
      reviewCount: -1,
      reviewAvgOverall: 4,
    });
    // The implementation only requires count > 0 to emit; ensure that's
    // the contract callers rely on.
    expect(out.aggregateRating).toBeUndefined();
  });
});
