import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  GENERATED_BEGIN,
  GENERATED_END,
  interpolate,
  landingPrerenderRoutes,
  marketingSitemapEntries,
  renderGeneratedSection,
  renderUrlBlock,
  spliceGeneratedSection,
} from "../sitemap/marketing-sitemap";
import { loadMarketingRegistries } from "../sitemap/registries";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../../public");
const committedSitemap = readFileSync(resolve(PUBLIC, "sitemap.xml"), "utf8");
const committedManifest = JSON.parse(readFileSync(resolve(PUBLIC, "landing-manifest.json"), "utf8")) as {
  path: string;
}[];
const en = JSON.parse(readFileSync(resolve(PUBLIC, "locales/en.json"), "utf8")) as Record<string, string>;

const live = loadMarketingRegistries();

// A real-shaped sitemap: hand-maintained blocks around the generated markers,
// formatted exactly like public/sitemap.xml.
const HAND_BLOCK = `  <url>
    <loc>https://hired.video/privacy-policy</loc>
    <lastmod>2026-04-17</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`;
const fixture = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${HAND_BLOCK}\n\n  ${GENERATED_BEGIN}\n${inner}  ${GENERATED_END}\n\n${HAND_BLOCK}\n</urlset>\n`;

describe("marketingSitemapEntries — happy path (live registries)", () => {
  const entries = marketingSitemapEntries(live.registries);
  const paths = entries.map((e) => e.path);

  it("emits one /for/ URL per live profession + life-stage audience and one /templates/ URL per template", () => {
    expect(entries).toHaveLength(
      live.registries.professionIds.length + live.registries.lifeStageSlugs.length + live.registries.templateIds.length,
    );
    expect(paths).toContain("/for/athlete");
    expect(paths).toContain("/for/recent-graduates");
    expect(paths).toContain("/templates/self_tape");
  });

  it("leaves out the hiring audiences while their persona is off", () => {
    expect(paths).not.toContain("/for/recruiter");
    expect(paths).not.toContain("/for/employer");
  });

  it("renders every block with x-default + en + es + fr-CA alternates", () => {
    const block = renderUrlBlock({ path: "/for/actor", changefreq: "weekly", priority: "0.8" }, "2026-10-10");
    expect(block).toContain("<loc>https://hired.video/for/actor</loc><lastmod>2026-10-10</lastmod>");
    expect(block).toContain('hreflang="x-default" href="https://hired.video/for/actor"');
    expect(block).toContain('hreflang="en" href="https://hired.video/for/actor"');
    expect(block).toContain('hreflang="es" href="https://hired.video/for/actor?lang=es"');
    expect(block).toContain('hreflang="fr-CA" href="https://hired.video/for/actor?lang=fr-CA"');
  });

  it("the committed sitemap.xml is up to date with the registries (re-run generate-sitemap.mjs if not)", () => {
    const begin = committedSitemap.indexOf(GENERATED_BEGIN);
    const end = committedSitemap.indexOf(GENERATED_END);
    const committedPaths = [
      ...committedSitemap.slice(begin, end).matchAll(/<loc>https:\/\/hired\.video([^<]+)<\/loc>/g),
    ].map((m) => m[1]);
    expect(committedPaths).toEqual(paths);
  });

  it("the committed landing manifest covers every /for/ page (prerender reads it)", () => {
    expect(committedManifest.map((r) => r.path)).toEqual(paths.filter((p) => p.startsWith("/for/")));
  });
});

describe("spliceGeneratedSection", () => {
  it("replaces only the generated section and keeps hand-maintained blocks", () => {
    const section = renderGeneratedSection(
      marketingSitemapEntries({ professionIds: ["actor"], lifeStageSlugs: ["veterans"], templateIds: ["basic"] }),
      "2026-10-10",
    );
    const out = spliceGeneratedSection(fixture("  <!-- stale -->\n"), section);
    expect(out).not.toContain("stale");
    expect(out.match(/privacy-policy<\/loc>/g)).toHaveLength(2);
    expect(out).toContain("https://hired.video/for/veterans</loc>");
    // Idempotent: splicing the same section again changes nothing.
    expect(spliceGeneratedSection(out, section)).toBe(out);
  });

  it("handles an empty registry (boundary): markers stay, nothing between", () => {
    const section = renderGeneratedSection([], "2026-10-10");
    const out = spliceGeneratedSection(fixture(""), section);
    expect(out).toContain(`${GENERATED_BEGIN}\n  ${GENERATED_END}`);
  });
});

describe("errors", () => {
  it("fails when the markers are missing", () => {
    expect(() => spliceGeneratedSection(`<urlset>\n${HAND_BLOCK}\n</urlset>`, "")).toThrow(/markers/);
  });

  it("fails when a marketing URL is hand-listed outside the markers", () => {
    const stray = fixture("").replace(
      HAND_BLOCK,
      "  <url><loc>https://hired.video/for/athlete</loc></url>",
    );
    expect(() => spliceGeneratedSection(stray, renderGeneratedSection([], "2026-10-10"))).toThrow(/hand-written/);
  });

  it("rejects duplicate, malformed or cross-taxonomy slugs", () => {
    expect(() => marketingSitemapEntries({ professionIds: ["actor", "actor"], lifeStageSlugs: [], templateIds: [] })).toThrow(/duplicate/);
    expect(() => marketingSitemapEntries({ professionIds: ["Actor s"], lifeStageSlugs: [], templateIds: [] })).toThrow(/invalid/);
    expect(() => marketingSitemapEntries({ professionIds: ["veterans"], lifeStageSlugs: ["veterans"], templateIds: [] })).toThrow(/both/);
  });

  it("rejects a malformed lastmod", () => {
    expect(() => renderGeneratedSection([], "10/10/2026")).toThrow(/lastmod/);
  });
});

describe("landingPrerenderRoutes", () => {
  it("titles each /for/ page with the same English templates the page's useSEO uses", () => {
    const routes = landingPrerenderRoutes(live.professions, live.lifeStages, {
      profession: en["seoLanding.profession.seoTitle"],
      professionDescription: en["seoLanding.profession.seoDescription"],
      lifeStage: en["seoLanding.lifeStage.seoTitle"],
      eyebrow: en["audiences.forBadge"],
    });
    const actor = routes.find((r) => r.path === "/for/actor");
    expect(actor?.title).toBe(interpolate(en["seoLanding.profession.seoTitle"], { label: "Actors" }));
    expect(actor?.description.startsWith("Self-tapes")).toBe(true);
    const vets = routes.find((r) => r.path === "/for/veterans");
    expect(vets?.title).not.toContain("{{");
    expect(routes).toHaveLength(live.professions.length + live.lifeStages.length);
  });

  it("interpolates missing variables to empty strings rather than leaking braces", () => {
    expect(interpolate("{{label}} — {{nope}}", { label: "Actors" })).toBe("Actors — ");
  });
});
