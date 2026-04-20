/**
 * Tests for the skill extraction service, specifically the contract
 * between our Zod schema and what the LLM is asked to return.
 *
 * The original bug (2026-04-20): the LLM-facing schema required
 * `sourceType: "job" | "resume"`, a value the caller ALREADY passed in
 * as a parameter. Some providers echoed it back as the literal string
 * `"job" | "resume"` (from the prompt template) and dropped `skills`
 * entirely. Every upload triggered "[skill-extraction] LLM error,
 * falling back to heuristic" spam in the Workers logs.
 *
 * Fix: LLM schema only validates what the LLM actually produces. The
 * service stamps `sourceType` on the way out.
 *
 * Run: node --import tsx --test src/services/__tests__/skill-extraction.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SkillSchema,
  ExtractResponseSchema,
  buildFallbackExtraction,
  SKILL_EXTRACTOR_PROMPT,
} from "../skill-extraction.js";

describe("SKILL_EXTRACTOR_PROMPT contract", () => {
  it("does NOT ask the LLM to emit sourceType (caller owns that value)", () => {
    // If someone re-introduces `sourceType` to the prompt template, the
    // LLM will again return the literal string "job" | "resume" and
    // validation will blow up. This guards the regression.
    assert.equal(
      SKILL_EXTRACTOR_PROMPT.includes("sourceType"),
      false,
      "Prompt must not mention sourceType — we pass it in, not ask for it back.",
    );
  });

  it("still mentions skills and summary as output fields", () => {
    assert.match(SKILL_EXTRACTOR_PROMPT, /skills/);
    assert.match(SKILL_EXTRACTOR_PROMPT, /summary/);
  });
});

describe("ExtractResponseSchema (public, caller-facing shape)", () => {
  it("has sourceType, skills, and summary — sourceType is stamped by the service", () => {
    const parsed = ExtractResponseSchema.safeParse({
      sourceType: "resume",
      skills: [{ name: "TypeScript", category: "language" }],
      summary: "One skill",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects unknown sourceType values — no silent passthrough", () => {
    const parsed = ExtractResponseSchema.safeParse({
      sourceType: "garbage",
      skills: [],
    });
    assert.equal(parsed.success, false);
  });

  it("caps skills at 80 (guards against LLM hallucinating a long list)", () => {
    const oversized = {
      sourceType: "resume" as const,
      skills: Array.from({ length: 81 }, (_, i) => ({
        name: `Skill ${i}`,
        category: "other" as const,
      })),
    };
    assert.equal(ExtractResponseSchema.safeParse(oversized).success, false);
  });
});

describe("SkillSchema", () => {
  it("requires name + category, treats importance as optional", () => {
    assert.equal(
      SkillSchema.safeParse({ name: "React", category: "framework" }).success,
      true,
    );
    assert.equal(
      SkillSchema.safeParse({ name: "React" }).success,
      false,
      "category is required",
    );
  });

  it("rejects categories outside the enum", () => {
    assert.equal(
      SkillSchema.safeParse({ name: "React", category: "buzzword" }).success,
      false,
    );
  });
});

describe("buildFallbackExtraction", () => {
  it("stamps the passed-in sourceType without asking the LLM", () => {
    const result = buildFallbackExtraction(
      "Experienced JavaScript and Python engineer",
      "resume",
    );
    assert.equal(result.sourceType, "resume");
    assert.ok(result.skills.some((s) => s.name === "JavaScript"));
    assert.ok(result.skills.some((s) => s.name === "Python"));
  });

  it("returns an empty skill list + a clear summary when nothing matches", () => {
    const result = buildFallbackExtraction("lorem ipsum dolor", "job");
    assert.equal(result.sourceType, "job");
    assert.equal(result.skills.length, 0);
    assert.match(result.summary ?? "", /no common skills/i);
  });

  it("tags each skill with one of the canonical categories", () => {
    const result = buildFallbackExtraction(
      "Docker, AWS, and leadership experience",
      "resume",
    );
    for (const s of result.skills) {
      // Every skill must parse through the SkillSchema — if not, the
      // heuristic has drifted from the schema.
      assert.equal(SkillSchema.safeParse(s).success, true);
    }
  });
});
