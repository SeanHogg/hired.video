/**
 * Reserved vanity slugs (#2312): a profile slug equal to a static route
 * under /people/ or /articles/ would be shadowed by it. The list must cover
 * every such static segment the route table (routes/*.tsx) defines.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_VANITY_SLUGS, isReservedVanitySlug } from "@shared/reserved-slugs";

// vitest runs from frontend/; under jsdom `import.meta.url` is not a file: URL.
// The route table lives in routes/*.tsx (composed by routes/index.tsx).
const ROUTES_DIR = resolve(process.cwd(), "routes");
const APP = readdirSync(ROUTES_DIR)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => readFileSync(resolve(ROUTES_DIR, name), "utf-8"))
  .join("\n");

/** Every static first segment the route table routes under /people/ and /articles/. */
function staticSegments(): string[] {
  const out = new Set<string>();
  for (const m of APP.matchAll(/path="\/(?:people|articles)\/([^":/]+)/g)) out.add(m[1]);
  return [...out];
}

describe("reserved vanity slugs", () => {
  it("covers every static /people/* and /articles/* route segment", () => {
    const segments = staticSegments();
    expect(segments).toContain("by-id");
    for (const segment of segments) expect(RESERVED_VANITY_SLUGS.has(segment), segment).toBe(true);
  });

  it("rejects reserved slugs in any case and allows ordinary ones", () => {
    expect(isReservedVanitySlug("by-id")).toBe(true);
    expect(isReservedVanitySlug(" Team-Health ")).toBe(true);
    expect(isReservedVanitySlug("me")).toBe(true);
    expect(isReservedVanitySlug("maria-alvarez")).toBe(false);
    expect(isReservedVanitySlug("by-id-2")).toBe(false);
  });
});
