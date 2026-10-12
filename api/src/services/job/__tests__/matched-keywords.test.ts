/**
 * #2344 — the tailor's `matchedKeywords`: the job keywords the résumé already
 * shows. A candidate survives only when every word of it is on the résumé
 * and it is not one of the job's open gaps.
 *
 * Run: node --import tsx --test src/services/job/__tests__/matched-keywords.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifiedMatchedKeywords } from "../matched-keywords.js";
import type { ResumeContent } from "../../../../../shared/resume.js";
import type { JobGap } from "../../../../../shared/resume-tailor.js";

const RESUME = {
  basics: { name: "Ana Ruiz", label: "Director of IT", summary: "15 years running healthcare infrastructure; HIPAA programs." },
  work: [
    {
      name: "Northwind Health",
      position: "Director of IT",
      highlights: ["Migrated 40 apps to Azure", "Ran vendor management across 12 contracts", "Built the ITIL service desk"],
    },
  ],
  skills: [{ name: "Cybersecurity & Risk", keywords: ["NIST CSF", "Incident response"] }],
} as unknown as ResumeContent;

const GAPS: JobGap[] = [
  { id: "G1", requirement: "Kubernetes or cloud platform", kind: "skill", question: "Have you run Kubernetes?", skill: "Kubernetes" },
];

describe("verifiedMatchedKeywords", () => {
  it("keeps the job's keywords the résumé shows, in the job's words", () => {
    assert.deepEqual(
      verifiedMatchedKeywords(["Azure", "HIPAA", "ITIL", "NIST CSF", "Vendor management"], RESUME, GAPS),
      ["Azure", "HIPAA", "ITIL", "NIST CSF", "Vendor management"],
    );
  });

  it("drops what the résumé never says, and the job's open gaps", () => {
    assert.deepEqual(verifiedMatchedKeywords(["Kubernetes", "Terraform", "SAP S/4HANA", "Azure"], RESUME, GAPS), ["Azure"]);
  });

  it("dedupes case-insensitively and ignores blanks and run-on phrases", () => {
    assert.deepEqual(verifiedMatchedKeywords(["azure", "Azure", "  ", "x".repeat(81)], RESUME), ["azure"]);
  });

  it("caps the list at 20", () => {
    const many = Array.from({ length: 30 }, () => "Azure").map((k, i) => (i % 2 ? `${k}` : `${k} apps`));
    const out = verifiedMatchedKeywords([...many, ...Array.from({ length: 25 }, (_, i) => `Director ${i}`)], RESUME);
    assert.ok(out.length <= 20);
  });

  it("an empty candidate list matches nothing", () => {
    assert.deepEqual(verifiedMatchedKeywords([], RESUME), []);
  });
});

describe("verifiedMatchedKeywords — whole words, not substrings", () => {
  const ENGINEER = {
    basics: { name: "Lee Park", label: "Senior Software Engineer", summary: "Backend services in Go." },
    work: [
      {
        name: "Contoso Payments",
        position: "Senior Software Engineer",
        highlights: ["Rebuilt the checkout in JavaScript and Node.js", "Designed REST APIs serving 9M requests/day", "Ported reports to C#"],
      },
    ],
    skills: [{ name: "Languages", keywords: ["JavaScript", "Go", "C#"] }],
  } as unknown as ResumeContent;

  it("a job asking for Java is not matched by JavaScript (the old substring check said it was)", () => {
    assert.deepEqual(verifiedMatchedKeywords(["Java", "Script", "Pay"], ENGINEER), []);
  });

  it("matches a plural, a sentence-final word and symbol-bearing tokens", () => {
    assert.deepEqual(
      verifiedMatchedKeywords(["REST API", "Go", "Node.js", "C#", "JavaScript"], ENGINEER),
      ["REST API", "Go", "Node.js", "C#", "JavaScript"],
    );
  });
});
