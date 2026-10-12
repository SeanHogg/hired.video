/**
 * #689 — every one of the twelve intake templates has a slot binder, every
 * binder placeholder is pinned to its seed's actual copy (so a seed copy edit
 * can't silently unbind a slot), and hydration fills the canvas from a
 * production-shaped user-content snapshot.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import type { CanvasState, Widget } from "../canvas-state";
import { seedCanvasFromTemplate } from "../template-seeds";
import { hydrateCanvasState } from "../hydrate-canvas-state";
import { SLOT_TEMPLATES, TEMPLATE_BINDERS, templateBinder } from "../template-content-slots";
import type { UserContentSnapshot } from "../resolve-user-content";

/** Every substitutable string field on a widget. */
function widgetStrings(w: Widget): string[] {
  const p = w.params;
  if (p.kind === "text" || p.kind === "heading") return [p.data.text];
  if (p.kind === "cta") return [p.data.headline, p.data.subheadline ?? "", p.data.ctaText, p.data.ctaUrl];
  if (p.kind === "chips") return [...p.data.chips];
  return [];
}

function canvasStrings(state: CanvasState): string[] {
  return state.scenes.flatMap((s) => s.widgets.flatMap(widgetStrings));
}

// A production-shaped snapshot: a mid-career PM with a master résumé (JSON
// Resume content as the parser stores it), one posted job, one company.
const SNAPSHOT = {
  profile: {
    name: "Gordon Okafor",
    email: "gordon.okafor@example.com",
    headline: "I turn messy roadmaps into shipped products.",
    currentRole: "Senior Product Manager",
    location: "Toronto, ON",
    publicProfileUrl: "https://hired.video/profile/gordon-okafor",
  },
  resume: {
    id: "8b6f2c1e-0d6a-4b8e-9f3a-2c7d5e1a9b40",
    basics: {
      name: "Gordon Okafor",
      label: "Senior Product Manager",
      email: "gordon.okafor@example.com",
      summary: "Nine years shipping B2B SaaS from zero to scale.",
      url: "https://gordon.example.com",
    },
    work: [
      {
        name: "Shopify",
        position: "Senior Product Manager",
        highlights: ["Grew checkout conversion 11% across 1.8M merchants", "Led a 14-person payments squad"],
      },
      { name: "Wealthsimple", position: "Product Manager", highlights: ["Launched tax filing for 400k users"] },
    ],
    skills: [
      { name: "Roadmapping" },
      { name: "SQL" },
      { name: "Experimentation" },
      { name: "Figma" },
      { name: "Stakeholder management" },
      { name: "Pricing" },
    ],
    projects: [
      {
        name: "Checkout Insights",
        description: "Self-serve funnel analytics for 1.8M merchants.",
        url: "https://github.com/gokafor/checkout-insights",
        highlights: ["Cut time-to-insight from 3 days to 10 minutes", "Adopted by 42 product teams"],
      },
      { name: "Tax Flow", description: "Guided tax filing in 12 minutes." },
    ],
  },
  project: {
    name: "Checkout Insights",
    description: "Self-serve funnel analytics for 1.8M merchants.",
    url: "https://github.com/gokafor/checkout-insights",
    highlights: ["Cut time-to-insight from 3 days to 10 minutes", "Adopted by 42 product teams"],
  },
  job: {
    id: "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d",
    title: "Staff Product Manager",
    location: "Remote (Canada)",
    responsibilities: ["Own the merchant onboarding funnel", "Partner with design and data weekly"],
    benefits: ["Equity", "Four-day weeks"],
    salaryMin: 170000,
    salaryMax: 210000,
    currency: "CAD",
    applyUrl: "https://careers.example.com/staff-pm",
  },
  company: {
    id: "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e",
    name: "Northwind Labs",
    industry: "Fintech",
    size: "51-200",
    culture: ["Write it down", "Ship small, ship often"],
    perks: ["Learning budget", "Home-office stipend"],
    url: "https://northwind.example.com/careers",
  },
  clips: [
    { id: "p1", title: "Payments launch keynote" },
    { id: "p2", title: "Merchant story: Maple & Co." },
  ],
  tool: { label: "Resume Roast", description: "Brutally honest résumé feedback in 60 seconds.", url: "https://hired.video/tools/resume-roast" },
  // JSON-Resume entries as the parser stores them; the optional fields the
  // binders don't read are omitted, hence the cast.
} as unknown as UserContentSnapshot;

describe("template slot binders — coverage", () => {
  it("covers all twelve intake templates, each a real catalog template", () => {
    const catalogIds = new Set(TEMPLATE_CATALOG.map((t) => t.id));
    expect(SLOT_TEMPLATES).toHaveLength(12);
    for (const id of SLOT_TEMPLATES) {
      expect(catalogIds.has(id), id).toBe(true);
      expect(TEMPLATE_BINDERS[id].slots.length, id).toBeGreaterThan(0);
      expect(templateBinder(id)).toBe(TEMPLATE_BINDERS[id]);
    }
  });

  it("every intake template in the catalog (bar comics) has a binder", () => {
    const intakeTemplates = TEMPLATE_CATALOG.filter((t) => t.intake !== "comic" && t.id === t.intake).map((t) => t.id);
    for (const id of intakeTemplates) expect(templateBinder(id), id).not.toBeNull();
  });

  it.each(SLOT_TEMPLATES)("%s — every placeholder is the seed's actual copy", (id) => {
    const strings = canvasStrings(seedCanvasFromTemplate(id));
    for (const slot of TEMPLATE_BINDERS[id].slots) {
      const found = slot.whole
        ? strings.includes(slot.placeholder)
        : strings.some((s) => s.includes(slot.placeholder));
      expect(found, `${id}: "${slot.placeholder}"`).toBe(true);
    }
  });

  it("a template without a binder (a comic) returns null", () => {
    expect(templateBinder("comic_noir")).toBeNull();
  });
});

describe("hydrateCanvasState", () => {
  it("fills the résumé video from the résumé + profile", () => {
    const out = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("resume"), "resume", SNAPSHOT));
    expect(out).toContain("Gordon Okafor");
    expect(out).toContain("Senior Product Manager");
    expect(out).toContain("Nine years shipping B2B SaaS from zero to scale.");
    expect(out).toContain(
      "• Grew checkout conversion 11% across 1.8M merchants\n• Led a 14-person payments squad\n• Launched tax filing for 400k users",
    );
    expect(out).toEqual(expect.arrayContaining(["Roadmapping", "SQL", "Experimentation", "Figma"]));
  });

  it("never re-matches a value it just wrote (the 'Go' chip vs the name 'Gordon')", () => {
    const out = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("resume"), "resume", SNAPSHOT));
    expect(out).toContain("Gordon Okafor");
    expect(out.some((s) => s.includes("Roadmappingrdon"))).toBe(false);
  });

  it("fills a job ad from the owned posting (title, range, benefits, apply link)", () => {
    const out = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("job_ad"), "job_ad", SNAPSHOT));
    expect(out).toContain("Staff Product Manager · Remote (Canada)");
    expect(out).toContain("• Own the merchant onboarding funnel\n• Partner with design and data weekly");
    expect(out).toEqual(expect.arrayContaining(["Equity", "Four-day weeks"]));
    expect(out).toContain("https://careers.example.com/staff-pm");
    expect(out).toContain("careers.example.com/staff-pm");
    expect(out.some((s) => s.includes("170") && s.includes("210"))).toBe(true);
    // Benefits the posting doesn't list keep the seed copy.
    expect(out).toContain("Unlimited PTO");
  });

  it("fills a company promo from the owned company", () => {
    const out = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("company_promo"), "company_promo", SNAPSHOT));
    expect(out).toContain("Build with Northwind Labs.");
    expect(out).toContain("Northwind Labs · Fintech · 51-200");
    expect(out).toContain("• Write it down\n• Ship small, ship often");
    expect(out).toContain("northwind.example.com/careers");
  });

  it("fills project, clip and tool templates from their pickers", () => {
    const code = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("code_walkthrough"), "code_walkthrough", SNAPSHOT));
    expect(code).toContain("How Checkout Insights works.");
    expect(code).toContain("github.com/gokafor/checkout-insights");
    const portfolio = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("design_portfolio"), "design_portfolio", SNAPSHOT));
    expect(portfolio).toEqual(expect.arrayContaining(["Checkout Insights", "Tax Flow", "Guided tax filing in 12 minutes."]));
    const data = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("data_analysis"), "data_analysis", SNAPSHOT));
    expect(data).toContain("Checkout Insights — what the numbers said.");
    const reel = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("sizzle_reel"), "sizzle_reel", SNAPSHOT));
    expect(reel).toContain("Payments launch keynote · Merchant story: Maple & Co.");
    const tool = canvasStrings(hydrateCanvasState(seedCanvasFromTemplate("tool_promo"), "tool_promo", SNAPSHOT));
    expect(tool).toEqual(expect.arrayContaining(["Resume Roast", "hired.video/tools/resume-roast"]));
  });

  it("leaves the seed untouched when there's no content (signed out / empty account)", () => {
    for (const id of SLOT_TEMPLATES) {
      const seed = seedCanvasFromTemplate(id);
      expect(hydrateCanvasState(seed, id, {}), id).toBe(seed);
    }
  });

  it("a job ad with no owned job keeps the sample posting", () => {
    const seed = seedCanvasFromTemplate("job_ad");
    const { job: _job, ...noJob } = SNAPSHOT;
    const out = canvasStrings(hydrateCanvasState(seed, "job_ad", noJob));
    expect(out).toContain("Senior Full-Stack Engineer · Remote");
    expect(out).toContain("$160k–$210k");
  });
});
