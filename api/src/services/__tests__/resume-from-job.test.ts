/**
 * Create-from-a-job (services/resume/from-job.ts) and the tailor pieces it
 * shares (tailor-edits.ts): the SERVER decides what counts as evidence,
 * what is a gap, what may be left out, and which skills are honest.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleDraft, evidenceCorpus, withVersionEvidence } from "../resume/from-job.js";
import { applyResumeEdits, dropUnsupportedSkills, toJobGaps } from "../job/tailor-apply.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";

const master = ResumeContentSchema.parse({
  basics: { name: "Sean Hogg", label: "Director Engineering", summary: "Hands-on technology executive." },
  work: [
    {
      name: "Alliance Inspection Management (AiM)",
      position: "VP of Technology/CIO",
      highlights: [
        "20% reduction in YoY operating costs ($1.79M).",
        "90% reduction in attrition.",
        "Revamped Quality Assurance with API automation.",
      ],
    },
    { name: "Career Now Brands", position: "EVP Product & Technology", highlights: ["Cut operating costs from 4M to 1.7M."] },
    { name: "Old Co", position: "Developer", highlights: ["Wrote VB6."] },
  ],
  skills: [{ name: "SOC 2", keywords: ["Compliance"] }, { name: "Mergers & Acquisitions" }],
  education: [{ institution: "University of Windsor", studyType: "BSc", area: "Computer Science" }],
});

const job = { title: "VP Engineering", company: "Northwind Health", description: "…", confidence: "low" as const };

describe("evidence corpus", () => {
  it("cites bullets, skills and education by content path", () => {
    const ids = evidenceCorpus(master).map((e) => e.id);
    assert.ok(ids.includes("work.0.highlights.2"));
    assert.ok(ids.includes("skills.0"));
    assert.ok(ids.includes("education.0"));
    assert.ok(ids.includes("basics.summary"));
  });

  it("folds version-only bullets onto the matching master entry, never new entries", () => {
    const version = {
      ...master,
      work: [
        { ...master.work[0], highlights: [...master.work[0].highlights, "Led SOC 2 Type II readiness."] },
        { name: "Unknown Startup", position: "CTO", highlights: ["x"] },
      ],
    } as ResumeContent;
    const merged = withVersionEvidence(master, [version]);
    assert.equal(merged.work.length, master.work.length);
    assert.equal(merged.work[0].highlights.at(-1), "Led SOC 2 Type II readiness.");
    assert.equal(master.work[0].highlights.length, 3, "input not mutated");
  });
});

describe("assembleDraft", () => {
  const wire = {
    job: { title: "VP Engineering", company: "Northwind Health" },
    requirements: [
      { text: "Lead a 60+ person eng org", evidence: ["work.0.highlights.1"], status: "covered", note: "AiM" },
      { text: "Own quality", evidence: ["work.0.highlights.2", "work.9.highlights.0"], status: "covered", note: "AiM QA" },
      { text: "Kubernetes", evidence: ["made.up.id"], status: "covered", note: "" },
      { text: "Healthcare domain", evidence: [], status: "gap", note: "" },
    ],
    edits: [
      {
        op: "highlights",
        section: "work",
        match: "Alliance Inspection Management (AiM)",
        highlights: ["Revamped QA with API automation.", "20% reduction in YoY operating costs ($1.79M).", "90% reduction in attrition."],
        why: "The job leads with quality.",
      },
      { op: "skills", skills: [{ name: "SOC 2", keywords: [] }, { name: "Kubernetes", keywords: [] }], why: "Job terms." },
    ],
    gaps: [{ requirement: "Healthcare domain", kind: "skill", question: "Any healthcare work?", skill: "Healthcare" }],
    leftOut: ["work.2", "work.0", "skills.1", "basics.label", "work.99"],
  };

  const draft = assembleDraft(master, "master-id", job, wire);

  it("drops evidence ids that are not in the source and makes them gaps", () => {
    const k8s = draft.requirements.find((r) => r.text === "Kubernetes");
    assert.equal(k8s?.status, "gap");
    assert.deepEqual(k8s?.evidence, []);
    assert.deepEqual(draft.requirements[1].evidence.includes("work.9.highlights.0"), false);
  });

  it("re-points evidence into a rewritten bullet list at the entry", () => {
    assert.deepEqual(draft.requirements[0].evidence, ["work.0"]);
  });

  it("every gap requirement gets a question keyed by its requirement id", () => {
    const ids = draft.gaps.map((g) => g.id).sort();
    assert.deepEqual(ids, ["R3", "R4"]);
    assert.equal(draft.gaps.find((g) => g.id === "R4")?.kind, "skill");
  });

  it("never claims a skill the résumé does not show", () => {
    assert.deepEqual(draft.content.skills.map((s) => s.name), ["SOC 2"]);
  });

  it("left-out keeps only real, uncited entry paths", () => {
    // work.0 is cited, basics.label is not an entry, work.99 and skills.1
    // (the skills edit replaced that list) do not exist in the draft.
    assert.deepEqual(draft.leftOut.map((l) => l.path), ["work.2"]);
    assert.match(draft.leftOut.find((l) => l.path === "work.2")?.label ?? "", /Developer/);
  });

  it("changes carry content paths", () => {
    assert.deepEqual(draft.changes.map((c) => c.path), ["work.0.highlights", "skills"]);
  });
});

describe("tailor pieces", () => {
  it("applyResumeEdits anchors basics + entry changes", () => {
    const { changes } = applyResumeEdits(master, [
      { op: "basics", label: "VP Engineering", why: "title" },
      { op: "summary", section: "work", match: "Career Now Brands", summary: "Ran product.", why: "x" },
    ]);
    assert.deepEqual(changes.map((c) => c.path), ["basics.label", "work.1.summary"]);
  });

  it("toJobGaps drops a 'gap' the résumé already lists and resolves the anchor entry", () => {
    const gaps = toJobGaps(
      [
        { requirement: "Compliance", skill: "Compliance", kind: "skill" },
        { requirement: "Cloud platform", kind: "experience", match: "career now brands", section: "work" },
      ],
      master,
    );
    assert.equal(gaps.length, 1);
    assert.deepEqual([gaps[0].id, gaps[0].anchorPath], ["G1", "work.1"]);
  });

  it("dropUnsupportedSkills keeps rephrasings whose words appear in the résumé", () => {
    const tailored = { ...master, skills: [{ name: "QA Automation", level: "", keywords: [] }, { name: "Terraform", level: "", keywords: [] }] };
    assert.deepEqual(dropUnsupportedSkills(master, tailored).skills.map((s) => s.name), ["QA Automation"]);
  });

  it("dropUnsupportedSkills lets a group be named in the job's words but checks every keyword in it", () => {
    const tailored = {
      ...master,
      skills: [
        { name: "Cybersecurity & Risk", level: "", keywords: ["Compliance", "Identity Federation"] },
        { name: "Higher Education ERP", level: "", keywords: ["Banner", "Workday Student"] },
      ],
    };
    const out = dropUnsupportedSkills(master, tailored).skills;
    assert.deepEqual(out, [{ name: "Cybersecurity & Risk", level: "", keywords: ["Compliance"] }]);
  });

  it("dropUnsupportedSkills returns the same object when every claim is supported", () => {
    const tailored = { ...master, skills: [{ name: "Cost Reduction", level: "", keywords: ["Quality Assurance"] }] };
    assert.equal(dropUnsupportedSkills(master, tailored), tailored);
  });
});
