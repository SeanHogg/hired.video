import { describe, it, expect } from "vitest";
import {
  applyBrowseFilters,
  parseBrowseParams,
  resumeIndustries,
  toBrowseParams,
  DEFAULT_BROWSE_STATE,
} from "@/lib/templates/browse";
import type { TemplateMeta } from "@/lib/templates/types";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";

// Minimal metas shaped like registry output. `origin` is irrelevant to these
// pure helpers, so it's cast through unknown. Résumé presets carry their
// descriptor (what makes a template a résumé template), as the registry does.
function meta(p: Partial<TemplateMeta> & Pick<TemplateMeta, "slug" | "kind" | "name">): TemplateMeta {
  return {
    blurb: "",
    priceCents: 0,
    tags: [],
    ...(p.kind === "resume" ? { resumeDescriptor: DEFAULT_DESCRIPTOR } : {}),
    origin: { kind: p.kind } as unknown as TemplateMeta["origin"],
    ...p,
  };
}

const catalog: TemplateMeta[] = [
  meta({ slug: "default", kind: "resume", name: "Hired Default", industry: "All" }),
  meta({ slug: "payroll-iron-gray", kind: "resume", name: "Payroll Iron Gray", industry: "Finance / Payroll" }),
  meta({ slug: "software-engineer-graphite", kind: "resume", name: "Software Engineer Graphite", industry: "Software / Engineering" }),
  meta({ slug: "risk-asphalt", kind: "resume", name: "Asphalt Risk", industry: "Risk / Consulting" }),
  meta({ slug: "no-industry", kind: "resume", name: "Bare" }),
  meta({ slug: "personal-brand", kind: "studio-builtin", name: "Personal Brand" }),
  meta({ slug: "c8f0a7e2-1b3d-4c5e-9f60-2a7b8c9d0e1f", kind: "studio-creator", name: "Actor Reel", priceCents: 499 }),
  meta({ slug: "fin-2", kind: "resume", name: "Another Finance", industry: "Finance / Payroll" }),
];

describe("parseBrowseParams / toBrowseParams", () => {
  it("defaults for empty params and round-trips to an empty query string", () => {
    const s = parseBrowseParams(new URLSearchParams(""));
    expect(s).toEqual(DEFAULT_BROWSE_STATE);
    expect(toBrowseParams(s).toString()).toBe("");
  });
  it("reads tab, industry, q and sort", () => {
    const s = parseBrowseParams(new URLSearchParams("industry=Finance+%2F+Payroll&q=+analyst+&sort=name"));
    expect(s).toEqual({ tab: "resume", industry: "Finance / Payroll", q: "analyst", sort: "name" });
    expect(parseBrowseParams(toBrowseParams(s))).toEqual(s);
  });
  it("ignores industry on the video tab and unknown values", () => {
    const s = parseBrowseParams(new URLSearchParams("tab=video&industry=Finance&sort=popular"));
    expect(s).toEqual({ tab: "video", industry: "", q: "", sort: "recommended" });
    expect(parseBrowseParams(new URLSearchParams("tab=bogus")).tab).toBe("resume");
    expect(toBrowseParams({ ...s, industry: "Finance" }).toString()).toBe("tab=video");
  });
});

describe("resumeIndustries", () => {
  it("returns distinct non-generic resume industries in catalog order", () => {
    expect(resumeIndustries(catalog)).toEqual([
      "Finance / Payroll",
      "Software / Engineering",
      "Risk / Consulting",
    ]);
  });
  it("is empty for no resume templates", () => {
    expect(resumeIndustries([])).toEqual([]);
    expect(resumeIndustries(catalog.filter((t) => t.kind !== "resume"))).toEqual([]);
  });
});

describe("applyBrowseFilters", () => {
  it("splits resume vs video tabs", () => {
    const resume = applyBrowseFilters(catalog, { tab: "resume", industry: "", sort: "recommended" });
    expect(resume.every((t) => t.kind === "resume")).toBe(true);
    expect(resume).toHaveLength(6);
    const video = applyBrowseFilters(catalog, { tab: "video", industry: "", sort: "recommended" });
    expect(video.map((t) => t.name)).toEqual(["Personal Brand", "Actor Reel"]);
  });
  it("puts a creator résumé template on the Resume tab, by what it makes", () => {
    const creatorResume = meta({
      slug: "clinical-blue-two-column-3fa9c1d2",
      kind: "studio-creator",
      name: "Clinical Blue, two column",
      priceCents: 299,
      resumeDescriptor: DEFAULT_DESCRIPTOR,
    });
    const all = [...catalog, creatorResume];
    expect(applyBrowseFilters(all, { tab: "resume", industry: "", sort: "recommended" })).toContain(creatorResume);
    expect(applyBrowseFilters(all, { tab: "video", industry: "", sort: "recommended" })).not.toContain(creatorResume);
  });
  it("industry filter keeps exact matches plus generic templates", () => {
    const r = applyBrowseFilters(catalog, { tab: "resume", industry: "Finance / Payroll", sort: "recommended" });
    expect(r.map((t) => t.slug)).toEqual(["default", "payroll-iron-gray", "fin-2"]);
  });
  it("an unknown industry still shows the generic templates", () => {
    expect(applyBrowseFilters(catalog, { tab: "resume", industry: "Aerospace", sort: "name" })).toEqual(
      [catalog[0]],
    );
  });
  it("sorts by name without mutating the input", () => {
    const before = catalog.map((t) => t.slug);
    const r = applyBrowseFilters(catalog, { tab: "resume", industry: "", sort: "name" });
    expect(r.map((t) => t.name)).toEqual([
      "Another Finance",
      "Asphalt Risk",
      "Bare",
      "Hired Default",
      "Payroll Iron Gray",
      "Software Engineer Graphite",
    ]);
    expect(catalog.map((t) => t.slug)).toEqual(before);
  });
});
