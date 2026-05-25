/**
 * Pure-function tests for Agent v2 intake helpers.
 *
 * No DB, no LLM — every function under test is pure or accepts a
 * stub `LLMClient`. Keeps the test suite stable across CI without a
 * live database and lets us trust the brief-parsing heuristics that
 * back the "no LLM key" local-dev fallback path.
 *
 * Run: node --import tsx --test src/services/recruiter/__tests__/agent-intake.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractTitleFromBrief,
  extractSkillsFromBrief,
  extractExperienceFromBrief,
  extractLocationFromBrief,
  heuristicCriteriaFromBrief,
  deriveCriteriaFromJobRow,
  deriveCriteriaFromBrief,
  FOLLOWUP_DEFAULTS,
} from "../agent-intake.js";
import type { LLMClient } from "../../adapters/llm-client.js";

// ───────────────────────────────────────────────────────────────────────────
// extractTitleFromBrief — picks the first 1–4 non-stopword tokens
// ───────────────────────────────────────────────────────────────────────────

describe("extractTitleFromBrief", () => {
  it("pulls the title out of a 'Looking for a …' brief", () => {
    const title = extractTitleFromBrief("Looking for a senior staff engineer to join my team");
    assert.equal(title, "senior staff engineer");
  });

  it("handles a bare title with no lead-in", () => {
    assert.equal(extractTitleFromBrief("Product Designer"), "product designer");
  });

  it("returns an empty string for stopword-only input", () => {
    assert.equal(extractTitleFromBrief("looking for a"), "");
  });

  it("caps the title at four tokens", () => {
    const title = extractTitleFromBrief("principal infrastructure security platform reliability architect");
    assert.equal(title.split(" ").length, 4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractSkillsFromBrief — dictionary matching, no false positives
// ───────────────────────────────────────────────────────────────────────────

describe("extractSkillsFromBrief", () => {
  it("matches multiple skills from a sentence", () => {
    const skills = extractSkillsFromBrief("Need a backend engineer fluent in Python, Postgres, and Kubernetes.");
    assert.ok(skills.includes("python"));
    assert.ok(skills.includes("postgres"));
    assert.ok(skills.includes("kubernetes"));
  });

  it("deduplicates repeated mentions", () => {
    const skills = extractSkillsFromBrief("React expert, deep React experience, React Native too");
    assert.equal(skills.filter((s) => s === "react").length, 1);
  });

  it("doesn't false-positive on substrings (e.g. 'rust' inside 'trust')", () => {
    const skills = extractSkillsFromBrief("Builds trust with stakeholders, no programming required");
    assert.ok(!skills.includes("rust"));
  });

  it("returns an empty array when no skills are mentioned", () => {
    assert.deepEqual(extractSkillsFromBrief("People-first leader, big on mentorship."), []);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractExperienceFromBrief
// ───────────────────────────────────────────────────────────────────────────

describe("extractExperienceFromBrief", () => {
  it("parses explicit '5 years' / '5+ years' patterns", () => {
    assert.equal(extractExperienceFromBrief("Needs 5+ years of experience"), 5);
    assert.equal(extractExperienceFromBrief("3 yrs minimum"), 3);
  });

  it("infers from seniority labels when no number is present", () => {
    assert.equal(extractExperienceFromBrief("Senior engineer needed"), 5);
    assert.equal(extractExperienceFromBrief("Staff role on the platform team"), 7);
    assert.equal(extractExperienceFromBrief("Principal architect"), 10);
    assert.equal(extractExperienceFromBrief("entry level analyst"), 0);
  });

  it("returns null when nothing matches", () => {
    assert.equal(extractExperienceFromBrief("Looking for a passionate designer"), null);
  });

  it("prefers explicit numbers over seniority words", () => {
    // "8 years" wins over "senior" (which would imply 5)
    assert.equal(extractExperienceFromBrief("Senior engineer with 8 years"), 8);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractLocationFromBrief
// ───────────────────────────────────────────────────────────────────────────

describe("extractLocationFromBrief", () => {
  it("recognises 'remote' as a location", () => {
    assert.equal(extractLocationFromBrief("Fully remote role across NA"), "Remote");
    assert.equal(extractLocationFromBrief("Remote-only position"), "Remote");
  });

  it("pulls a capitalised place after 'in'", () => {
    assert.equal(extractLocationFromBrief("Engineer in San Francisco, CA"), "San Francisco, CA");
  });

  it("returns an empty string when no location surfaces", () => {
    assert.equal(extractLocationFromBrief("Generic recruiting blurb"), "");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// heuristicCriteriaFromBrief — composes the above + sensible defaults
// ───────────────────────────────────────────────────────────────────────────

describe("heuristicCriteriaFromBrief", () => {
  it("composes the parsed fields into AgentCriteria", () => {
    const c = heuristicCriteriaFromBrief("Senior Python engineer for a remote role, 7+ years");
    assert.equal(c.jobTitle, "senior python engineer");
    assert.ok(c.skills.includes("python"));
    assert.equal(c.location, "Remote");
    assert.equal(c.experienceYears, 7);
    assert.equal(c.maxCandidates, FOLLOWUP_DEFAULTS.maxCandidates);
  });

  it("falls back to 'Software Engineer' when no title can be inferred", () => {
    const c = heuristicCriteriaFromBrief("a"); // pure stopword
    assert.equal(c.jobTitle, "Software Engineer");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deriveCriteriaFromJobRow — straight projection
// ───────────────────────────────────────────────────────────────────────────

describe("deriveCriteriaFromJobRow", () => {
  it("projects job fields into AgentCriteria", () => {
    const c = deriveCriteriaFromJobRow({
      title: "Staff ML Engineer",
      description: "5+ years of experience expected",
      location: "New York, NY",
      skillsRequired: ["python", "pytorch", "sql"],
    });
    assert.equal(c.jobTitle, "Staff ML Engineer");
    assert.deepEqual(c.skills, ["python", "pytorch", "sql"]);
    assert.equal(c.location, "New York, NY");
    assert.equal(c.experienceYears, 5);
  });

  it("tolerates nullish fields", () => {
    const c = deriveCriteriaFromJobRow({
      title: null,
      description: null,
      location: null,
      skillsRequired: null as any,
    });
    assert.equal(c.jobTitle, "");
    assert.equal(c.skills.length, 0);
    assert.equal(c.location, "");
    assert.equal(c.experienceYears, null);
  });

  it("filters non-string entries out of skillsRequired", () => {
    const c = deriveCriteriaFromJobRow({
      title: "Engineer",
      description: null,
      location: null,
      skillsRequired: ["python", 42, null, "react"] as any,
    });
    assert.deepEqual(c.skills, ["python", "react"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deriveCriteriaFromBrief — LLM path + fallback
// ───────────────────────────────────────────────────────────────────────────

function makeStubLlm(jsonReply: string): LLMClient {
  return {
    // We only exercise callText; the other methods can be stubs.
    callText: async () => ({ content: jsonReply, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }),
  } as unknown as LLMClient;
}

describe("deriveCriteriaFromBrief", () => {
  it("uses heuristic path when no LLM is provided", async () => {
    const c = await deriveCriteriaFromBrief("Senior Python engineer for a remote role", null);
    assert.equal(c.jobTitle, "senior python engineer");
    assert.equal(c.location, "Remote");
    assert.ok(c.skills.includes("python"));
  });

  it("uses LLM output when valid JSON is returned", async () => {
    const stub = makeStubLlm(JSON.stringify({
      jobTitle: "Staff Platform Engineer",
      skills: ["go", "kubernetes", "terraform"],
      location: "San Francisco, CA",
      experienceYears: 8,
      maxCandidates: 25,
    }));
    const c = await deriveCriteriaFromBrief("hire a backend specialist", stub);
    assert.equal(c.jobTitle, "Staff Platform Engineer");
    assert.deepEqual(c.skills, ["go", "kubernetes", "terraform"]);
    assert.equal(c.location, "San Francisco, CA");
    assert.equal(c.experienceYears, 8);
    assert.equal(c.maxCandidates, 25);
  });

  it("falls back to heuristic when LLM returns garbage", async () => {
    const stub = makeStubLlm("not json at all");
    const c = await deriveCriteriaFromBrief("Senior React engineer", stub);
    // No JSON block ⇒ heuristic path
    assert.equal(c.jobTitle, "senior react engineer");
  });

  it("clamps maxCandidates from the LLM into [1, 50]", async () => {
    const stub = makeStubLlm(JSON.stringify({
      jobTitle: "x",
      skills: [],
      location: "",
      experienceYears: 0,
      maxCandidates: 9999,
    }));
    const c = await deriveCriteriaFromBrief("anything", stub);
    assert.equal(c.maxCandidates, 50);
  });

  it("clamps experienceYears from the LLM into [0, 40]", async () => {
    const stub = makeStubLlm(JSON.stringify({
      jobTitle: "x",
      skills: [],
      location: "",
      experienceYears: -3,
      maxCandidates: 10,
    }));
    const c = await deriveCriteriaFromBrief("anything", stub);
    assert.equal(c.experienceYears, 0);
  });
});
