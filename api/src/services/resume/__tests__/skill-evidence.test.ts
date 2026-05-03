/**
 * Unit tests for the shared skill-evidence helpers and the
 * preserveSkillEvidence content-service helper. The shared helpers
 * are pure JS — they don't need a DB harness — but they're consumed
 * by both the API write path and the frontend visualizer, so a
 * regression here breaks the "where did they use Python?" answer
 * everywhere at once. Worth a tight unit suite.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/skill-evidence.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeMonthsForSkill,
  computeYearsForSkill,
  dedupeAndOptimizeSkills,
  deriveEvidenceFromText,
  enrichSkillsWithEvidence,
  groupEvidenceByItem,
  groupEvidenceBySkill,
  indexResolvedItems,
  inferLevelFromYears,
  listResolvableItems,
  monthsBetween,
  resolveItemByLabel,
} from "../../../../../shared/skill-evidence.js";
import { preserveSkillEvidence } from "../content.js";
import { mergeExtractedSkillsIntoResume } from "../skills.js";
import type { ResumeContent, SkillEvidence } from "../../../../../shared/resume.js";

const NOW = new Date("2026-05-02T00:00:00Z");

describe("monthsBetween", () => {
  it("counts whole months across a multi-year range", () => {
    assert.equal(monthsBetween("2020-01-01", "2024-01-01", NOW), 48);
  });
  it("returns 0 for unparseable start date", () => {
    // V8's Date parser is tolerant of strings like "Spring 2019" (it pulls
    // out the year and treats it as Jan 1) — we test against a string V8
    // genuinely rejects to verify the NaN guard.
    assert.equal(monthsBetween("not a date", "2024-01-01", NOW), 0);
  });
  it("treats empty endDate as present", () => {
    // 2024-05-02 to NOW (2026-05-02) is exactly 24 months.
    assert.equal(monthsBetween("2024-05-02", "", NOW), 24);
  });
  it("treats 'present' (case-insensitive) as now", () => {
    assert.equal(monthsBetween("2025-05-02", "Present", NOW), 12);
  });
  it("returns 0 when end precedes start", () => {
    assert.equal(monthsBetween("2024-01-01", "2020-01-01", NOW), 0);
  });
});

describe("inferLevelFromYears", () => {
  it("buckets 0–<1 → Beginner", () => {
    assert.equal(inferLevelFromYears(0), "Beginner");
    assert.equal(inferLevelFromYears(0.9), "Beginner");
  });
  it("buckets 1–<3 → Intermediate", () => {
    assert.equal(inferLevelFromYears(1), "Intermediate");
    assert.equal(inferLevelFromYears(2.5), "Intermediate");
  });
  it("buckets 3–<7 → Advanced", () => {
    assert.equal(inferLevelFromYears(3), "Advanced");
    assert.equal(inferLevelFromYears(6.99), "Advanced");
  });
  it("buckets 7+ → Expert", () => {
    assert.equal(inferLevelFromYears(7), "Expert");
    assert.equal(inferLevelFromYears(20), "Expert");
  });
});

const sampleContent: ResumeContent = {
  work: [
    {
      id: "w1",
      name: "Stripe",
      position: "Senior Engineer",
      url: "",
      summary: "",
      startDate: "2020-01-01",
      endDate: "2024-01-01",
      highlights: [],
    },
    {
      id: "w2",
      name: "Acme",
      position: "Junior Engineer",
      url: "",
      summary: "",
      startDate: "2018-01-01",
      endDate: "2019-12-31",
      highlights: [],
    },
  ],
  volunteer: [],
  education: [],
  awards: [],
  certificates: [],
  publications: [],
  skills: [
    { id: "sk1", name: "Python", level: "", keywords: [] },
    { id: "sk2", name: "TypeScript", level: "", keywords: [] },
    { id: "sk3", name: "Soft Spoken", level: "", keywords: [] },
  ],
  languages: [],
  interests: [],
  references: [],
  projects: [
    {
      id: "p1",
      name: "Payments Migration",
      description: "",
      url: "",
      entity: "Stripe",
      type: "",
      startDate: "2022-01-01",
      endDate: "2023-01-01",
      highlights: [],
      keywords: [],
      roles: [],
    },
  ],
  skillEvidence: [
    {
      id: "ev1",
      skillName: "Python",
      itemType: "work",
      referenceId: "w1",
      source: "extracted",
    },
    {
      id: "ev2",
      skillName: "Python",
      itemType: "project",
      referenceId: "p1",
      source: "extracted",
    },
    {
      id: "ev3",
      skillName: "TypeScript",
      itemType: "work",
      referenceId: "w2",
      source: "extracted",
    },
  ],
};

describe("listResolvableItems + indexResolvedItems", () => {
  it("emits one row per id'd section item across all evidence-bindable sections", () => {
    const items = listResolvableItems(sampleContent);
    assert.equal(items.length, 3); // 2 work + 1 project
    const idx = indexResolvedItems(items);
    assert.equal(idx.get("w1")?.title, "Senior Engineer");
    assert.equal(idx.get("p1")?.title, "Payments Migration");
  });
  it("skips items missing an id", () => {
    const items = listResolvableItems({
      ...sampleContent,
      work: [...sampleContent.work, { ...sampleContent.work[0], id: undefined } as any],
    });
    assert.equal(items.length, 3);
  });
});

describe("computeYearsForSkill", () => {
  const items = listResolvableItems(sampleContent);
  const idx = indexResolvedItems(items);
  it("sums months across multiple evidence rows for the same skill", () => {
    // Python: w1 (48mo) + p1 (12mo) = 60mo = 5y
    assert.equal(computeMonthsForSkill("Python", sampleContent.skillEvidence!, idx, NOW), 60);
    assert.equal(computeYearsForSkill("Python", sampleContent.skillEvidence!, idx, NOW), 5);
  });
  it("matches case-insensitively on the skill name", () => {
    assert.equal(
      computeYearsForSkill("python", sampleContent.skillEvidence!, idx, NOW),
      5,
    );
  });
  it("returns 0 for a skill with no evidence", () => {
    assert.equal(computeYearsForSkill("Soft Spoken", sampleContent.skillEvidence!, idx, NOW), 0);
  });
  it("honours an explicit monthsUsed override", () => {
    const ev: SkillEvidence[] = [
      {
        id: "x",
        skillName: "Rust",
        itemType: "work",
        referenceId: "w1",
        monthsUsed: 6,
        source: "manual",
      },
    ];
    assert.equal(computeMonthsForSkill("Rust", ev, idx, NOW), 6);
  });
});

describe("enrichSkillsWithEvidence", () => {
  it("fills yearsOfExperience and inferred level from evidence", () => {
    const enriched = enrichSkillsWithEvidence(sampleContent);
    const py = enriched.find((s) => s.name === "Python")!;
    assert.equal(py.yearsOfExperience, 5);
    assert.equal(py.level, "Advanced");
    const ts = enriched.find((s) => s.name === "TypeScript")!;
    assert.equal(ts.yearsOfExperience, 2);
    assert.equal(ts.level, "Intermediate");
  });
  it("does not overwrite an explicit level", () => {
    const enriched = enrichSkillsWithEvidence({
      ...sampleContent,
      skills: [
        { id: "sk1", name: "Python", level: "Expert", keywords: [] },
        ...sampleContent.skills.slice(1),
      ],
    });
    assert.equal(enriched.find((s) => s.name === "Python")!.level, "Expert");
  });
  it("returns the input unchanged when there is no evidence", () => {
    const result = enrichSkillsWithEvidence({ ...sampleContent, skillEvidence: [] });
    assert.deepEqual(result, sampleContent.skills);
  });
});

describe("groupEvidence helpers", () => {
  it("groupEvidenceBySkill keys by lowercase name", () => {
    const g = groupEvidenceBySkill(sampleContent.skillEvidence!);
    assert.equal(g.get("python")?.length, 2);
    assert.equal(g.get("typescript")?.length, 1);
  });
  it("groupEvidenceByItem drops evidence with unresolvable referenceId", () => {
    const items = listResolvableItems(sampleContent);
    const idx = indexResolvedItems(items);
    const orphan: SkillEvidence = {
      id: "ghost",
      skillName: "Python",
      itemType: "work",
      referenceId: "missing",
      source: "extracted",
    };
    const g = groupEvidenceByItem([...sampleContent.skillEvidence!, orphan], idx);
    assert.equal(g.size, 3);
    assert.ok(!g.has("missing"));
  });
});

describe("resolveItemByLabel", () => {
  const items = listResolvableItems(sampleContent);
  it("matches on exact title", () => {
    assert.equal(resolveItemByLabel("Senior Engineer", items)?.id, "w1");
  });
  it("matches on exact organization", () => {
    assert.equal(resolveItemByLabel("Stripe", items)?.id, "w1");
  });
  it("matches on 'Position at Org' form", () => {
    assert.equal(resolveItemByLabel("Senior Engineer at Stripe", items)?.id, "w1");
  });
  it("returns undefined when ambiguous", () => {
    // Two items reference Stripe (work + project): substring containment
    // collapses to two candidates → resolver bails to avoid a wrong bind.
    assert.equal(resolveItemByLabel("Stripe project", items), undefined);
  });
});

describe("preserveSkillEvidence", () => {
  const existing = [
    {
      id: "ev1",
      skillName: "Python",
      itemType: "work",
      referenceId: "w1",
      source: "extracted",
    },
  ];
  it("carries existing skillEvidence forward when caller omits it", () => {
    const next = { basics: { summary: "x" } };
    const merged = preserveSkillEvidence(next, existing) as Record<string, unknown>;
    assert.deepEqual(merged.skillEvidence, existing);
  });
  it("respects an explicit override array", () => {
    const next = { skillEvidence: [{ id: "ev9" }] };
    const merged = preserveSkillEvidence(next, existing) as Record<string, unknown>;
    assert.deepEqual(merged.skillEvidence, [{ id: "ev9" }]);
  });
  it("respects an explicit empty array (intentional clear)", () => {
    const next = { skillEvidence: [] };
    const merged = preserveSkillEvidence(next, existing) as Record<string, unknown>;
    assert.deepEqual(merged.skillEvidence, []);
  });
  it("passes non-object content through verbatim", () => {
    assert.equal(preserveSkillEvidence(null, existing), null);
    assert.equal(preserveSkillEvidence("text", existing), "text");
  });
});

describe("deriveEvidenceFromText", () => {
  // Distinct fixture from sampleContent — exercises the heuristic
  // binder against real-shaped highlights and project descriptions.
  const heuristicContent = {
    work: [
      {
        id: "w_stripe",
        name: "Stripe",
        position: "Senior Engineer",
        url: "",
        summary: "Migrated payments infra to Python and Kubernetes.",
        startDate: "2020-01-01",
        endDate: "2024-01-01",
        highlights: ["Owned Python migration", "Led the Terraform rollout"],
      },
      {
        id: "w_acme",
        name: "Acme",
        position: "Junior Engineer",
        url: "",
        summary: "Wrote internal Java tooling.",
        startDate: "2018-01-01",
        endDate: "2019-12-31",
        highlights: [],
      },
    ],
    volunteer: [],
    education: [],
    awards: [],
    certificates: [],
    publications: [],
    skills: [
      { id: "s1", name: "Python", level: "", keywords: [] },
      { id: "s2", name: "Java", level: "", keywords: [] },
      { id: "s3", name: "Cloud", level: "", keywords: ["Kubernetes", "Terraform"] },
      { id: "s4", name: "C#", level: "", keywords: [] },
    ],
    languages: [],
    interests: [],
    references: [],
    projects: [
      {
        id: "p_payments",
        name: "Payments Migration",
        description: "Rewrote core in Python with C# bindings for legacy callers.",
        url: "",
        entity: "Stripe",
        type: "",
        startDate: "2022-01-01",
        endDate: "2023-01-01",
        highlights: [],
        keywords: [],
        roles: [],
      },
    ],
    skillEvidence: [],
  } as const;

  let counter = 0;
  const newId = () => `gen_${++counter}`;

  it("binds skills mentioned in work summaries + highlights", () => {
    counter = 0;
    const out = deriveEvidenceFromText(heuristicContent as any, [], newId, NOW);
    const stripeRows = out.filter((e) => e.referenceId === "w_stripe");
    const skillNames = stripeRows.map((e) => e.skillName).sort();
    // Python is in summary + highlight, Kubernetes in summary, Terraform in highlight.
    assert.deepEqual(skillNames, ["Kubernetes", "Python", "Terraform"]);
  });
  it("binds skills mentioned in project descriptions", () => {
    counter = 0;
    const out = deriveEvidenceFromText(heuristicContent as any, [], newId, NOW);
    const projRows = out.filter((e) => e.referenceId === "p_payments");
    assert.ok(projRows.find((e) => e.skillName === "Python"));
    // C# uses the symbol-aware boundary check (the regex \b doesn't
    // catch "C#" because # isn't a word char) — confirm it still binds.
    assert.ok(projRows.find((e) => e.skillName === "C#"));
  });
  it("does not duplicate evidence already present", () => {
    counter = 0;
    const existing = [
      {
        id: "preexisting",
        skillName: "Python",
        itemType: "work" as const,
        referenceId: "w_stripe",
        source: "extracted" as const,
      },
    ];
    const out = deriveEvidenceFromText(heuristicContent as any, existing, newId, NOW);
    const stripePython = out.filter(
      (e) => e.referenceId === "w_stripe" && e.skillName === "Python",
    );
    assert.equal(stripePython.length, 0);
  });
  it("requires whole-word match (doesn't bind 'Java' to 'JavaScript')", () => {
    counter = 0;
    const content = {
      ...heuristicContent,
      work: [
        {
          ...heuristicContent.work[0],
          summary: "Wrote JavaScript front-end.",
          highlights: [],
        },
      ],
      skills: [{ id: "s1", name: "Java", level: "", keywords: [] }],
    };
    const out = deriveEvidenceFromText(content as any, [], newId, NOW);
    assert.equal(out.length, 0);
  });
  it("emits source: 'derived' so callers can distinguish heuristic from LLM", () => {
    counter = 0;
    const out = deriveEvidenceFromText(heuristicContent as any, [], newId, NOW);
    assert.ok(out.length > 0);
    assert.ok(out.every((e) => e.source === "derived"));
  });
});

describe("dedupeAndOptimizeSkills", () => {
  it("drops a bare top-level skill whose name is a keyword under a category", () => {
    // Real shape from a 2026-05-03 user resume: AWS appears as both a
    // keyword under "Cloud Architecture" and as its own top-level skill.
    const out = dedupeAndOptimizeSkills([
      {
        name: "Cloud Architecture",
        level: "Expert",
        keywords: ["AWS", "Azure", "Kubernetes"],
      },
      { name: "AWS", level: "", keywords: [] },
      { name: "Azure", level: "", keywords: [] },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Cloud Architecture");
    assert.deepEqual(out[0].keywords, ["AWS", "Azure", "Kubernetes"]);
  });
  it("keeps a top-level row that itself has keywords (it's a category, not a duplicate)", () => {
    const out = dedupeAndOptimizeSkills([
      { name: "Tools", level: "", keywords: ["Docker"] },
      { name: "Docker", level: "", keywords: ["Compose"] },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out.find((s) => s.name === "Docker")?.keywords?.[0], "Compose");
  });
  it("merges case-insensitive name duplicates and takes the highest level", () => {
    const out = dedupeAndOptimizeSkills([
      { name: "python", level: "Intermediate", keywords: ["pandas"] },
      { name: "Python", level: "Expert", keywords: ["numpy"] },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].level, "Expert");
    assert.deepEqual(out[0].keywords?.sort(), ["numpy", "pandas"]);
  });
  it("takes the highest yearsOfExperience across duplicates", () => {
    const out = dedupeAndOptimizeSkills([
      { name: "Python", level: "", keywords: [], yearsOfExperience: 2 },
      { name: "Python", level: "", keywords: [], yearsOfExperience: 7 },
    ]);
    assert.equal(out[0].yearsOfExperience, 7);
  });
  it("dedupes keywords within a row case-insensitively", () => {
    const out = dedupeAndOptimizeSkills([
      { name: "Frameworks", level: "", keywords: ["React", "react", "REACT", "Vue"] },
    ]);
    assert.deepEqual(out[0].keywords, ["React", "Vue"]);
  });
  it("returns [] for empty / non-array input", () => {
    assert.deepEqual(dedupeAndOptimizeSkills([]), []);
    assert.deepEqual(dedupeAndOptimizeSkills(undefined), []);
  });
  it("preserves the row id of the first occurrence", () => {
    const out = dedupeAndOptimizeSkills([
      { id: "first", name: "Python", level: "", keywords: [] },
      { id: "second", name: "Python", level: "", keywords: [] },
    ]);
    assert.equal(out[0].id, "first");
  });
});

describe("mergeExtractedSkillsIntoResume — evidence overload", () => {
  it("emits new evidence rows from LLM evidenceLabels", () => {
    const result = mergeExtractedSkillsIntoResume(
      sampleContent.skills,
      [
        {
          name: "Python",
          category: "language",
          evidenceLabels: ["Senior Engineer at Stripe"],
        },
      ],
      { content: sampleContent, newId: () => "new1", now: NOW },
    );
    assert.ok("evidence" in result);
    assert.equal(result.evidence.length, sampleContent.skillEvidence!.length); // python+w1 already exists, deduped
  });
  it("does not duplicate evidence that already exists", () => {
    const existingCount = sampleContent.skillEvidence!.length;
    const result = mergeExtractedSkillsIntoResume(
      sampleContent.skills,
      [
        {
          name: "Python",
          category: "language",
          evidenceLabels: ["Senior Engineer at Stripe"],
        },
      ],
      { content: sampleContent, newId: () => "new1", now: NOW },
    );
    assert.equal(result.evidence.length, existingCount);
  });
  it("adds a fresh evidence row for a new skill+item pair", () => {
    const result = mergeExtractedSkillsIntoResume(
      sampleContent.skills,
      [
        {
          name: "Rust",
          category: "language",
          evidenceLabels: ["Junior Engineer at Acme"],
        },
      ],
      { content: sampleContent, newId: () => "new1", now: NOW },
    );
    const fresh = result.evidence.find((e) => e.id === "new1");
    assert.ok(fresh);
    assert.equal(fresh!.skillName, "Rust");
    assert.equal(fresh!.referenceId, "w2");
  });
  it("backwards-compatible 2-arg form returns a plain skills array", () => {
    const result = mergeExtractedSkillsIntoResume(
      sampleContent.skills,
      [{ name: "Rust", category: "language" }],
    );
    assert.ok(Array.isArray(result));
    assert.ok(result.find((g) => g.name === "Languages"));
  });
});
