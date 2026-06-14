/**
 * Help content catalog tests — pins the locale-fallback contract and the
 * bundled-file parsing (the behaviors the whole v2 architecture rests on).
 */

import { describe, it, expect } from "vitest";
import {
  getHelpItem,
  listHelpItems,
  helpItemsForSlugs,
  searchHelpLocal,
  helpIndexItems,
  helpSlugs,
} from "../content";

describe("getHelpItem locale resolution", () => {
  it("returns the requested locale when present", () => {
    expect(getHelpItem("getting-started", "fr-CA")?.title).toBe("Premiers pas avec hired.video");
    expect(getHelpItem("getting-started", "es")?.title).toBe("Primeros pasos con hired.video");
    expect(getHelpItem("getting-started", "en")?.title).toBe("Getting Started with hired.video");
  });

  it("falls back to EN for an unsupported / missing locale", () => {
    // 'de' isn't supported → EN base.
    expect(getHelpItem("getting-started", "de")?.title).toBe("Getting Started with hired.video");
    expect(getHelpItem("getting-started", "de")?.locale).toBe("en");
  });

  it("returns null for an unknown slug", () => {
    expect(getHelpItem("does-not-exist", "en")).toBeNull();
  });
});

describe("listHelpItems", () => {
  it("lists guides and faqs by kind", () => {
    expect(listHelpItems("en", { kind: "guide" }).length).toBe(6);
    expect(listHelpItems("en", { kind: "faq" }).length).toBe(15);
  });

  it("localizes the listing (fr-CA titles)", () => {
    const guides = listHelpItems("fr-CA", { kind: "guide" });
    expect(guides.find((g) => g.slug === "networking")?.title).toBe("Conseils de réseautage");
  });

  it("sorts by order", () => {
    const faqs = listHelpItems("en", { kind: "faq" });
    expect(faqs[0].order).toBeLessThanOrEqual(faqs[faqs.length - 1].order);
  });
});

describe("helpItemsForSlugs", () => {
  it("preserves order and drops missing slugs", () => {
    const items = helpItemsForSlugs(["good-video-resume", "nope", "private-video-resume"], "en");
    expect(items.map((i) => i.slug)).toEqual(["good-video-resume", "private-video-resume"]);
  });
});

describe("searchHelpLocal", () => {
  it("matches title/summary/body case-insensitively", () => {
    const hits = searchHelpLocal("video resume", "en");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("ignores queries under 2 chars", () => {
    expect(searchHelpLocal("a", "en")).toEqual([]);
  });
});

describe("helpIndexItems / helpSlugs", () => {
  it("emits one EN index item per slug with text", () => {
    const idx = helpIndexItems();
    expect(idx.length).toBe(helpSlugs().length);
    expect(idx.every((i) => i.text.length > 0)).toBe(true);
  });
});
