import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ResumeContentSchema, type ResumeContent } from "../resume.js";
import { RESUME_TEMPLATE_LISTINGS } from "../marketplace-template-listings.js";
import {
  analyzeResume,
  detectResumeFlags,
  isOpenEndDate,
  isQuantified,
  parseResumeMonth,
  rankTemplates,
  yearsMentioned,
} from "../resume-insights.js";

// Fixed clock so "Present" resolves deterministically (Sep 2026 → Oct 1).
const NOW = new Date("2026-10-01T00:00:00Z");

/** Real parse output is sparse (missing fields, mixed date formats); run it
 *  through the canonical schema exactly like the server-side heal does. */
function resume(raw: Record<string, unknown>): ResumeContent {
  return ResumeContentSchema.parse(raw);
}

const STEADY_ENGINEER = resume({
  basics: {
    name: "Priya Raman",
    label: "Senior Software Engineer",
    email: "priya.raman@example.com",
    summary: "Backend engineer focused on payments reliability.",
    location: { city: "Toronto", region: "ON", countryCode: "CA" },
  },
  work: [
    {
      id: "7f3c2a10-4b1e-4c55-9a7e-0d1f2e3a4b5c",
      name: "Stripe",
      position: "Senior Software Engineer",
      startDate: "2021-03",
      endDate: "Present",
      highlights: ["Cut p95 API latency 38% by rewriting the ledger cache", "Mentored 4 engineers"],
    },
    {
      id: "seed-work-0002",
      name: "Shopify",
      position: "Software Engineer",
      startDate: "2017-06",
      endDate: "2021-02",
      highlights: ["Shipped checkout extensibility used by 10,000 merchants"],
    },
    {
      name: "Freshbooks",
      position: "Junior Developer",
      startDate: "2015",
      endDate: "2017-05",
    },
  ],
  education: [{ institution: "University of Waterloo", area: "Computer Science", studyType: "BMath", endDate: "2015" }],
  skills: [{ name: "TypeScript" }, { name: "Go" }, { name: "PostgreSQL" }],
});

const NURSE_TO_DESIGNER = resume({
  basics: { name: "Dana Okafor", label: "Product Designer", email: "dana@example.com", summary: "" },
  work: [
    {
      name: "Hinge Health",
      position: "Product Designer",
      startDate: "2022-01",
      endDate: "",
      highlights: ["Redesigned onboarding, lifting activation 22%"],
    },
    { name: "Beaumont Hospital", position: "Registered Nurse", startDate: "2014", endDate: "2021-12" },
    { name: "Henry Ford Health", position: "Nurse Intern", startDate: "2013-05", endDate: "2013-12" },
  ],
  skills: [{ name: "Figma" }, { name: "User research" }],
});

const HOSPITALITY_WITH_GAP = resume({
  basics: { name: "Luis Ortega", label: "", email: "", summary: "Guest-first hotel professional." },
  work: [
    { name: "Marriott", position: "Front Desk Supervisor", startDate: "2023-05", endDate: "Present" },
    { name: "The Grand Café", position: "Bartender", startDate: "2016", endDate: "2021-06" },
  ],
});

const NEW_GRAD = resume({
  basics: { name: "Sam Lee", label: "Computer Science Student", email: "sam.lee@umich.edu" },
  work: [
    {
      name: "Ford Motor Company",
      position: "Software Engineering Intern",
      startDate: "2025-05",
      endDate: "2025-08",
      highlights: ["Built an internal dashboard"],
    },
  ],
  education: [{ institution: "University of Michigan", area: "Computer Science", startDate: "2022", endDate: "2026" }],
});

const EXECUTIVE = resume({
  basics: { name: "Morgan Hale", label: "Chief Technology Officer", email: "m@example.com", summary: "25 years building teams." },
  work: [
    { name: "Acme Health", position: "Chief Technology Officer", startDate: "2019", endDate: "Present" },
    { name: "Acme Health", position: "VP Engineering", startDate: "2012", endDate: "2018" },
  ],
});

// A resume "described in a prompt" — the AI parse yields a sparse shape with
// no dated roles at all.
const PROMPT_ONLY = resume({
  basics: {
    name: "",
    label: "Product designer",
    summary: "Product designer, 8 years in health-tech. Led a design system used by 40 teams.",
  },
});

describe("parseResumeMonth / isOpenEndDate", () => {
  it("reads year-only, year-month, slash and month-name forms", () => {
    assert.equal(parseResumeMonth("2016"), 2016 * 12);
    assert.equal(parseResumeMonth("2016", "end"), 2016 * 12 + 11);
    assert.equal(parseResumeMonth("2021-03"), 2021 * 12 + 2);
    assert.equal(parseResumeMonth("2021-03-15"), 2021 * 12 + 2);
    assert.equal(parseResumeMonth("03/2021"), 2021 * 12 + 2);
    assert.equal(parseResumeMonth("Mar 2021"), 2021 * 12 + 2);
    assert.equal(parseResumeMonth("March 2021"), 2021 * 12 + 2);
  });

  it("returns null for blank or unparseable input", () => {
    assert.equal(parseResumeMonth(""), null);
    assert.equal(parseResumeMonth(undefined), null);
    assert.equal(parseResumeMonth("sometime"), null);
  });

  it("treats blank and Present-like words as open-ended", () => {
    assert.equal(isOpenEndDate("Present"), true);
    assert.equal(isOpenEndDate("current"), true);
    assert.equal(isOpenEndDate(""), true);
    assert.equal(isOpenEndDate("2020"), false);
  });
});

describe("isQuantified / yearsMentioned", () => {
  it("detects percentages, currency, multipliers and counts", () => {
    assert.equal(isQuantified("Grew revenue 40% year over year"), true);
    assert.equal(isQuantified("Closed $2M in new ARR"), true);
    assert.equal(isQuantified("Delivered a 3x faster build"), true);
    assert.equal(isQuantified("Managed 120 client accounts"), true);
  });

  it("ignores bare calendar years and unquantified bullets", () => {
    assert.equal(isQuantified("Team lead since 2019"), false);
    assert.equal(isQuantified("Led the platform team"), false);
  });

  it("reads a stated years-of-experience figure", () => {
    assert.equal(yearsMentioned("Product designer, 8 years in health-tech"), 8);
    assert.equal(yearsMentioned("10+ years leading teams, 3 years as VP"), 10);
    assert.equal(yearsMentioned("No numbers here"), null);
  });
});

describe("analyzeResume", () => {
  it("steady engineer → Software, senior, chronological", () => {
    const i = analyzeResume(STEADY_ENGINEER, { now: NOW });
    assert.equal(i.industry, "Software / Engineering");
    assert.equal(i.roleFamily, "Senior Software Engineer");
    assert.equal(i.seniority, "senior");
    assert.equal(i.pattern, "steady");
    assert.equal(i.recommendedStructure, "chronological");
    assert.equal(i.educationFirst, false);
    // Jan 2015 → Sep 2026, contiguous roles ≈ 11.75 years.
    assert.ok(i.yearsExperience >= 11.5 && i.yearsExperience <= 12, String(i.yearsExperience));
    assert.ok(i.reasons.includes("build.reason.steady"));
    assert.ok(i.reasons.includes("build.reason.industryMatch"));
    assert.ok(i.reasons.every((r) => r.startsWith("build.reason.")));
    assert.deepEqual(i.flags, []);
  });

  it("nurse → product designer is a pivot → hybrid", () => {
    const i = analyzeResume(NURSE_TO_DESIGNER, { now: NOW });
    assert.equal(i.industry, "Creative / Product");
    assert.equal(i.pattern, "pivot");
    assert.equal(i.recommendedStructure, "hybrid");
    assert.ok(i.reasons.includes("build.reason.pivot"));
  });

  it("a career break longer than 9 months → gaps → functional", () => {
    const i = analyzeResume(HOSPITALITY_WITH_GAP, { now: NOW });
    assert.equal(i.industry, "Hospitality / Retail");
    assert.equal(i.pattern, "gaps");
    assert.deepEqual(i.longestGap, { from: "2021-07", to: "2023-04", months: 22 });
    assert.equal(i.undatedRoles, 0);
    assert.equal(i.recommendedStructure, "functional");
  });

  it("a role whose dates can't be read may fill the gap → no career break claimed", () => {
    const i = analyzeResume(
      resume({
        ...HOSPITALITY_WITH_GAP,
        work: [
          ...(HOSPITALITY_WITH_GAP.work ?? []),
          { name: "Hilton", position: "Night Auditor", startDate: "Summer 2021", endDate: "Spring 2023" },
        ],
      }),
      { now: NOW },
    );
    assert.equal(i.undatedRoles, 1);
    assert.equal(i.longestGap?.months, 22);
    assert.notEqual(i.pattern, "gaps");
  });

  it("back-to-back roles are not a gap", () => {
    const i = analyzeResume(STEADY_ENGINEER, { now: NOW });
    assert.equal(i.longestGap, null);
  });

  it("student / intern → early-career, education first, New Grad", () => {
    const i = analyzeResume(NEW_GRAD, { now: NOW });
    assert.equal(i.pattern, "early-career");
    assert.equal(i.seniority, "entry");
    assert.equal(i.industry, "Intern / New Grad");
    assert.equal(i.recommendedStructure, "hybrid");
    assert.equal(i.educationFirst, true);
    assert.ok(i.reasons.includes("build.reason.earlyCareer"));
  });

  it("C-suite title → executive industry and seniority", () => {
    const i = analyzeResume(EXECUTIVE, { now: NOW });
    assert.equal(i.industry, "Executive / C-Suite");
    assert.equal(i.seniority, "executive");
    assert.ok(i.reasons.includes("build.reason.executive"));
  });

  it("prompt-only resume uses the stated years and the label", () => {
    const i = analyzeResume(PROMPT_ONLY, { now: NOW });
    assert.equal(i.yearsExperience, 8);
    assert.equal(i.roleFamily, "Product designer");
    assert.equal(i.industry, "Creative / Product");
    assert.equal(i.pattern, "steady");
  });

  it("an empty resume degrades without throwing", () => {
    const i = analyzeResume(resume({}), { now: NOW });
    assert.equal(i.industry, null);
    assert.equal(i.roleFamily, null);
    assert.equal(i.yearsExperience, 0);
    assert.equal(i.seniority, "mid");
  });
});

describe("detectResumeFlags", () => {
  it("flags an older role with no end date, a missing summary and email", () => {
    const flags = detectResumeFlags(
      resume({
        basics: { name: "Ari", summary: "" },
        work: [
          { name: "Lyft", position: "Account Executive", startDate: "Mar 2021", endDate: "Present", highlights: ["Ran the West region book"] },
          { name: "Uber", position: "SDR", startDate: "03/2018", endDate: "" },
        ],
      }),
    );
    const ids = flags.map((f) => f.id);
    assert.deepEqual(ids, ["missing-end-date", "missing-summary", "no-metrics", "missing-email"]);
    assert.equal(flags[0].count, 1);
    assert.ok(flags.every((f) => f.labelKey.startsWith("build.flag.")));
  });
});

describe("rankTemplates", () => {
  const slugs = (r: string[]) => r.slice(0, 3);

  it("puts the industry match first and hired-default near the top", () => {
    const ranked = rankTemplates(analyzeResume(STEADY_ENGINEER, { now: NOW }), RESUME_TEMPLATE_LISTINGS);
    assert.equal(ranked.length, RESUME_TEMPLATE_LISTINGS.length);
    assert.deepEqual(slugs(ranked).slice(0, 2), ["software-engineer-graphite", "hired-default"]);
  });

  it("executives get the Executive template first", () => {
    const ranked = rankTemplates(analyzeResume(EXECUTIVE, { now: NOW }), RESUME_TEMPLATE_LISTINGS);
    assert.equal(ranked[0], "executive-taupe");
    assert.equal(ranked[1], "hired-default");
  });

  it("early-career engineers see their industry, then New Grad, then default", () => {
    const ranked = rankTemplates(
      { industry: "Software / Engineering", seniority: "entry", pattern: "early-career" },
      RESUME_TEMPLATE_LISTINGS,
    );
    assert.deepEqual(slugs(ranked), ["software-engineer-graphite", "intern-education-first", "hired-default"]);
  });

  it("no industry → hired-default first, rest in authored order", () => {
    const ranked = rankTemplates({ industry: null, seniority: "mid", pattern: "steady" }, RESUME_TEMPLATE_LISTINGS);
    assert.equal(ranked[0], "hired-default");
    assert.equal(ranked[1], RESUME_TEMPLATE_LISTINGS[1].slug);
  });
});
