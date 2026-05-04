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
  buildSkillGraphModel,
  computeMonthsForSkill,
  computeYearsForSkill,
  dedupeAndOptimizeSkills,
  dedupeSkillEvidence,
  deriveEvidenceFromText,
  enrichSkillsWithEvidence,
  flattenSkillsForView,
  groupEvidenceByItem,
  groupEvidenceBySkill,
  indexResolvedItems,
  inferLevelFromYears,
  listResolvableItems,
  mergeCertificates,
  mergeSkills,
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

describe("buildSkillGraphModel", () => {
  it("emits parent + keyword nodes when the parent has a level", () => {
    const out = buildSkillGraphModel([
      { name: "Leadership", level: "Advanced", keywords: ["Budget Management", "OKRs"] },
    ]);
    const names = out.nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["Budget Management", "Leadership", "OKRs"]);
    assert.equal(out.lineage.length, 2);
    assert.ok(out.lineage.find((e) => e.parent === "Leadership" && e.child === "Budget Management"));
    assert.ok(out.lineage.find((e) => e.parent === "Leadership" && e.child === "OKRs"));
  });
  it("treats keyword nodes as children with parent pointer + inherited level", () => {
    const out = buildSkillGraphModel([
      { name: "Leadership", level: "Advanced", keywords: ["Budget Management"] },
    ]);
    const child = out.nodes.find((n) => n.name === "Budget Management")!;
    assert.equal(child.parent, "Leadership");
    assert.equal(child.level, "Advanced");
  });
  it("drops the parent row when it has no level (pure category)", () => {
    const out = buildSkillGraphModel([
      { name: "Languages", level: "", keywords: ["Python", "Go"] },
    ]);
    const names = out.nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["Go", "Python"]);
    assert.equal(out.lineage.length, 0);
    assert.equal(out.nodes.find((n) => n.name === "Python")?.parent, undefined);
  });
  it("emits a single node for a bare leveled skill (no keywords)", () => {
    const out = buildSkillGraphModel([
      { name: "Strategic Planning", level: "Advanced", keywords: [] },
    ]);
    assert.equal(out.nodes.length, 1);
    assert.equal(out.nodes[0].name, "Strategic Planning");
    assert.equal(out.lineage.length, 0);
  });
  it("dedupes nodes case-insensitively (first occurrence wins)", () => {
    const out = buildSkillGraphModel([
      { name: "Leadership", level: "Advanced", keywords: ["OKRs"] },
      { name: "leadership", level: "Expert", keywords: ["okrs"] },
    ]);
    // Two rows but only two distinct nodes.
    assert.equal(out.nodes.length, 2);
    const lead = out.nodes.find((n) => n.name === "Leadership");
    assert.equal(lead?.level, "Advanced"); // First wins.
  });
  it("returns empty result for empty / undefined input", () => {
    assert.deepEqual(buildSkillGraphModel([]), { nodes: [], lineage: [] });
    assert.deepEqual(buildSkillGraphModel(undefined), { nodes: [], lineage: [] });
  });
});

describe("flattenSkillsForView", () => {
  it("keeps the parent row + emits one row per keyword when leveled", () => {
    // 2026-05-04 fix: previously the parent row was always dropped when
    // it had keywords. After merge, evidence still pointed at the parent
    // name, so By Skill grouped under a name that didn't exist in flat.
    const out = flattenSkillsForView([
      { name: "Cloud Architecture", level: "Expert", keywords: ["AWS", "Azure", "Kubernetes"] },
    ]);
    assert.equal(out.length, 4);
    assert.deepEqual(
      out.map((s) => s.name).sort(),
      ["AWS", "Azure", "Cloud Architecture", "Kubernetes"],
    );
    assert.ok(out.every((s) => s.level === "Expert"));
  });
  it("drops the parent row when it has no level (pure category)", () => {
    const out = flattenSkillsForView([
      { name: "Languages", level: "", keywords: ["Python", "Go"] },
    ]);
    assert.deepEqual(out.map((s) => s.name).sort(), ["Go", "Python"]);
  });
  it("emits a single row when the skill has no keywords", () => {
    const out = flattenSkillsForView([
      { name: "Strategic Planning", level: "Advanced", keywords: [] },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Strategic Planning");
  });
  it("dedupes case-insensitively across rows (first wins)", () => {
    const out = flattenSkillsForView([
      { name: "Cloud", level: "Advanced", keywords: ["AWS"] },
      { name: "DevOps", level: "Expert", keywords: ["aws"] },
    ]);
    assert.equal(out.filter((s) => s.name.toLowerCase() === "aws").length, 1);
    // First wins → Advanced level survives.
    assert.equal(out.find((s) => s.name.toLowerCase() === "aws")?.level, "Advanced");
  });
  it("inherits years from the parent row", () => {
    const out = flattenSkillsForView([
      { name: "Languages", level: "", keywords: ["Python"], yearsOfExperience: 5 },
    ]);
    assert.equal(out[0].yearsOfExperience, 5);
  });
});

describe("dedupeSkillEvidence", () => {
  it("keeps first occurrence of each (skillName, referenceId) pair", () => {
    const out = dedupeSkillEvidence([
      { id: "1", skillName: "AWS", itemType: "work", referenceId: "w1", source: "extracted" },
      { id: "2", skillName: "aws", itemType: "work", referenceId: "w1", source: "manual" },
      { id: "3", skillName: "AWS", itemType: "work", referenceId: "w2", source: "manual" },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].id, "1");
    assert.equal(out[1].id, "3");
  });
  it("trims whitespace + lowercases for comparison", () => {
    const out = dedupeSkillEvidence([
      { id: "1", skillName: " Python ", itemType: "work", referenceId: "w1", source: "extracted" },
      { id: "2", skillName: "Python", itemType: "work", referenceId: "w1", source: "manual" },
    ]);
    assert.equal(out.length, 1);
  });
  it("drops malformed rows (missing skillName / referenceId)", () => {
    const out = dedupeSkillEvidence([
      { id: "1", skillName: "Python", itemType: "work", referenceId: "w1", source: "extracted" },
      { id: "2", skillName: undefined as any, itemType: "work", referenceId: "w1", source: "manual" },
      { id: "3", skillName: "Java", itemType: "work", referenceId: undefined as any, source: "manual" },
    ]);
    assert.equal(out.length, 1);
  });
  it("returns [] for empty / undefined input", () => {
    assert.deepEqual(dedupeSkillEvidence([]), []);
    assert.deepEqual(dedupeSkillEvidence(undefined), []);
  });
  it("preserves order of first occurrences (stable React keys)", () => {
    const out = dedupeSkillEvidence([
      { id: "1", skillName: "A", itemType: "work", referenceId: "w1", source: "extracted" },
      { id: "2", skillName: "B", itemType: "work", referenceId: "w1", source: "extracted" },
      { id: "3", skillName: "A", itemType: "work", referenceId: "w1", source: "extracted" },
    ]);
    assert.deepEqual(out.map((e: SkillEvidence) => e.id), ["1", "2"]);
  });
});

describe("mergeSkills", () => {
  const baseSkills = [
    { id: "s1", name: "Cloud Architecture", level: "Expert", keywords: ["AWS"] },
    { id: "s2", name: "Amazon Web Services (AWS)", level: "Intermediate", keywords: [], yearsOfExperience: 3 },
    { id: "s3", name: "Strategic Planning", level: "Advanced", keywords: [] },
  ];
  const baseEvidence = [
    { id: "e1", skillName: "AWS", itemType: "work" as const, referenceId: "w1", source: "extracted" as const },
    { id: "e2", skillName: "Amazon Web Services (AWS)", itemType: "work" as const, referenceId: "w2", source: "manual" as const },
    { id: "e3", skillName: "Strategic Planning", itemType: "work" as const, referenceId: "w1", source: "manual" as const },
  ];

  it("merges absorbed names into the primary's keywords", () => {
    const out = mergeSkills({
      skills: baseSkills,
      evidence: baseEvidence,
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    assert.equal(out.skills.length, 2);
    const primary = out.skills.find((s) => s.id === "s1")!;
    assert.equal(primary.name, "Cloud Architecture");
    assert.ok(primary.keywords?.includes("Amazon Web Services (AWS)"));
    assert.ok(primary.keywords?.includes("AWS"));
  });
  it("rebinds evidence pointing at absorbed names to the primary", () => {
    const out = mergeSkills({
      skills: baseSkills,
      evidence: baseEvidence,
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    // e2 was bound to "Amazon Web Services (AWS)" — should now point at
    // the primary "Cloud Architecture".
    const remapped = out.evidence.find((e) => e.id === "e2");
    assert.equal(remapped?.skillName, "Cloud Architecture");
    // e1 was bound to "AWS" (the keyword survives so the name still
    // matches; not rebinding it is fine because AWS is canonical here).
    const aws = out.evidence.find((e) => e.id === "e1");
    assert.equal(aws?.skillName, "AWS");
  });
  it("takes the highest level + years across the merged set", () => {
    // Force a case where the absorbed row has the higher level.
    const out = mergeSkills({
      skills: [
        { id: "s1", name: "Python", level: "Intermediate", keywords: [], yearsOfExperience: 2 },
        { id: "s2", name: "python", level: "Expert", keywords: [], yearsOfExperience: 6 },
      ],
      evidence: [],
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    const primary = out.skills.find((s) => s.id === "s1")!;
    assert.equal(primary.level, "Expert");
    assert.equal(primary.yearsOfExperience, 6);
  });
  it("dedupes evidence rebound onto the same item from two absorbed names", () => {
    // Both evidence rows reference absorbed-row names ("Amazon Web Services
    // (AWS)" and "AWS Cloud"). After merge, both rebind to "Cloud
    // Architecture" + w1 — the second is dropped as a duplicate.
    const out = mergeSkills({
      skills: [
        { id: "s1", name: "Cloud Architecture", level: "Expert", keywords: [] },
        { id: "s2", name: "Amazon Web Services (AWS)", level: "Intermediate", keywords: [] },
        { id: "s3", name: "AWS Cloud", level: "Advanced", keywords: [] },
      ],
      evidence: [
        { id: "x1", skillName: "Amazon Web Services (AWS)", itemType: "work", referenceId: "w1", source: "extracted" },
        { id: "x2", skillName: "AWS Cloud", itemType: "work", referenceId: "w1", source: "manual" },
      ],
      selectedIndexes: [0, 1, 2],
      primaryIndex: 0,
    });
    const onW1 = out.evidence.filter((e) => e.referenceId === "w1");
    assert.equal(onW1.length, 1);
    assert.equal(onW1[0].skillName, "Cloud Architecture");
  });
  it("returns input unchanged when fewer than 2 selected", () => {
    const out = mergeSkills({
      skills: baseSkills,
      evidence: baseEvidence,
      selectedIndexes: [0],
    });
    assert.deepEqual(out.skills, baseSkills);
    assert.deepEqual(out.evidence, baseEvidence);
  });
  it("refuses to merge into a nameless primary", () => {
    const out = mergeSkills({
      skills: [
        { id: "s1", name: "", level: "", keywords: [] },
        { id: "s2", name: "Python", level: "Expert", keywords: [] },
      ],
      evidence: [],
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    assert.equal(out.skills.length, 2); // unchanged
  });
});

describe("mergeCertificates", () => {
  const baseCerts = [
    { id: "c1", name: "AWS Solutions Architect", issuer: "", date: "", url: "" },
    { id: "c2", name: "AWS Certified Solutions Architect", issuer: "Amazon Web Services", date: "2023-09-01", url: "https://aws.amazon.com/cert/123" },
    { id: "c3", name: "PMP", issuer: "PMI", date: "2022-01-15", url: "" },
  ];
  const baseEvidence = [
    { id: "e1", skillName: "AWS", itemType: "certificate" as const, referenceId: "c2", source: "extracted" as const },
    { id: "e2", skillName: "Project Management", itemType: "certificate" as const, referenceId: "c3", source: "manual" as const },
    { id: "e3", skillName: "AWS", itemType: "work" as const, referenceId: "w1", source: "extracted" as const },
  ];

  it("keeps the primary's name and fills empty primary fields from absorbed rows", () => {
    const out = mergeCertificates({
      certificates: baseCerts,
      evidence: baseEvidence,
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    assert.equal(out.certificates.length, 2);
    const primary = out.certificates.find((c) => c.id === "c1")!;
    // Primary's name survives — user picked it as canonical.
    assert.equal(primary.name, "AWS Solutions Architect");
    // Empty issuer/date/url backfilled from the absorbed row.
    assert.equal(primary.issuer, "Amazon Web Services");
    assert.equal(primary.date, "2023-09-01");
    assert.equal(primary.url, "https://aws.amazon.com/cert/123");
  });
  it("rebinds skill evidence pointing at absorbed cert ids to the primary id", () => {
    const out = mergeCertificates({
      certificates: baseCerts,
      evidence: baseEvidence,
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    // e1 was bound to absorbed c2 → should now point at primary c1.
    const remapped = out.evidence.find((e) => e.id === "e1");
    assert.equal(remapped?.referenceId, "c1");
    // Non-certificate evidence is untouched even if referenceId collides.
    const work = out.evidence.find((e) => e.id === "e3");
    assert.equal(work?.referenceId, "w1");
  });
  it("dedupes evidence rebound from two absorbed certs onto the same primary", () => {
    const out = mergeCertificates({
      certificates: [
        { id: "c1", name: "AWS SA", issuer: "AWS", date: "", url: "" },
        { id: "c2", name: "AWS Solutions Architect", issuer: "AWS", date: "", url: "" },
        { id: "c3", name: "AWS Cert SA", issuer: "AWS", date: "", url: "" },
      ],
      evidence: [
        { id: "x1", skillName: "AWS", itemType: "certificate", referenceId: "c2", source: "extracted" },
        { id: "x2", skillName: "AWS", itemType: "certificate", referenceId: "c3", source: "manual" },
      ],
      selectedIndexes: [0, 1, 2],
      primaryIndex: 0,
    });
    const onC1 = out.evidence.filter((e) => e.referenceId === "c1");
    assert.equal(onC1.length, 1);
  });
  it("drops evidence pointing at absorbed certs when the primary has no id", () => {
    const out = mergeCertificates({
      certificates: [
        { name: "AWS SA", issuer: "", date: "", url: "" }, // no id
        { id: "c2", name: "AWS Cert", issuer: "AWS", date: "2023", url: "" },
      ],
      evidence: [
        { id: "x1", skillName: "AWS", itemType: "certificate", referenceId: "c2", source: "extracted" },
      ],
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    // c2 absorbed → its evidence has nowhere to bind, so it's dropped.
    assert.equal(out.evidence.length, 0);
  });
  it("returns input unchanged when fewer than 2 selected", () => {
    const out = mergeCertificates({
      certificates: baseCerts,
      evidence: baseEvidence,
      selectedIndexes: [0],
    });
    assert.deepEqual(out.certificates, baseCerts);
    assert.deepEqual(out.evidence, baseEvidence);
  });
  it("refuses to merge into a nameless primary", () => {
    const out = mergeCertificates({
      certificates: [
        { id: "c1", name: "", issuer: "", date: "", url: "" },
        { id: "c2", name: "PMP", issuer: "PMI", date: "", url: "" },
      ],
      evidence: [],
      selectedIndexes: [0, 1],
      primaryIndex: 0,
    });
    assert.equal(out.certificates.length, 2); // unchanged
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
