/**
 * Tests for the pure scorer behind /api/recruiter/bulk-score.
 *
 * The route runs `scoreOne` over each candidate resume and ranks the
 * results. The function is intentionally heuristic (skill overlap + title
 * keyword match + description keyword overlap) so it stays fast + cheap;
 * these tests pin the weight defaults and the edge cases (no required
 * skills, no resume skills, partial title match).
 *
 * Run: node --import tsx --test src/routes/__tests__/bulk-scoring.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreOne } from "../bulk-scoring.js";

const DEFAULT_WEIGHTS = { skill: 70, title: 20, description: 10 };

function jdTokens(...words: string[]): Set<string> {
  return new Set(words.map((w) => w.toLowerCase()));
}

describe("scoreOne — skill overlap", () => {
  it("100/2 skills matched → 50% of skill weight", () => {
    const result = scoreOne({
      resume: {
        id: "r1",
        label: "Engineer",
        content: { skills: [{ name: "TypeScript" }] },
      },
      jobSkills: ["typescript", "go"],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    // Skill: 1/2 * 70 = 35. Title: 0. Desc: 0.
    assert.equal(result.score, 35);
    assert.deepEqual(result.matchedSkills, ["typescript"]);
    assert.deepEqual(result.missingSkills, ["go"]);
  });

  it("All required skills present → full skill weight", () => {
    const result = scoreOne({
      resume: {
        id: "r1",
        label: null,
        content: { skills: ["typescript", "go"] },
      },
      jobSkills: ["typescript", "go"],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    // 70 + 0 + desc bonus from skills appearing in desc (none here) = 70.
    assert.equal(result.score, 70);
  });

  it("No required skills on the job → defaults to half skill weight", () => {
    const result = scoreOne({
      resume: { id: "r1", label: null, content: {} },
      jobSkills: [],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    // jobSkills.length = 0 path: skillScore = weights.skill / 2 = 35.
    assert.equal(result.score, 35);
  });
});

describe("scoreOne — title match", () => {
  it("Adds the title weight when any resume title shares a token with the JD title", () => {
    const result = scoreOne({
      resume: {
        id: "r1",
        label: null,
        content: {
          basics: { label: "Senior Software Engineer" },
          skills: [],
        },
      },
      jobSkills: [],
      jobTitleTokens: jdTokens("software", "engineer"),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    // Skill score (no required skills) = 35; title = 20; desc = 0.
    assert.equal(result.score, 55);
    assert.equal(result.titleMatch, true);
  });

  it("titleMatch is false when no token overlaps", () => {
    const result = scoreOne({
      resume: {
        id: "r1",
        label: null,
        content: { basics: { label: "Marketing Lead" } },
      },
      jobSkills: [],
      jobTitleTokens: jdTokens("software", "engineer"),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    assert.equal(result.titleMatch, false);
  });
});

describe("scoreOne — description overlap", () => {
  it("Caps description bonus at the configured weight", () => {
    const result = scoreOne({
      resume: {
        id: "r1",
        label: null,
        content: { skills: ["react", "typescript", "graphql", "tailwind", "vite"] },
      },
      jobSkills: [],
      // 5 tokens that all also appear as resume skills.
      jobDescTokens: jdTokens("react", "typescript", "graphql", "tailwind", "vite"),
      jobTitleTokens: jdTokens(),
      weights: { skill: 70, title: 20, description: 3 },
    });
    // Skill (no required) = 35; title = 0; desc capped at 3.
    assert.equal(result.score, 38);
  });
});

describe("scoreOne — name extraction", () => {
  it("uses the explicit label when present", () => {
    const result = scoreOne({
      resume: { id: "r1", label: "Pinned candidate", content: {} },
      jobSkills: [],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    assert.equal(result.candidateName, "Pinned candidate");
  });

  it("falls back to basics.name", () => {
    const result = scoreOne({
      resume: { id: "r1", label: null, content: { basics: { name: "Alice" } } },
      jobSkills: [],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    assert.equal(result.candidateName, "Alice");
  });

  it("falls back to the placeholder when neither is set", () => {
    const result = scoreOne({
      resume: { id: "r1", label: null, content: {} },
      jobSkills: [],
      jobTitleTokens: jdTokens(),
      jobDescTokens: jdTokens(),
      weights: DEFAULT_WEIGHTS,
    });
    assert.equal(result.candidateName, "Unnamed candidate");
  });
});
