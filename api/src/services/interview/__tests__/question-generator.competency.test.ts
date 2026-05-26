/**
 * Tests for the competency-aware variant of the question generator
 * (#1439). Exercises the mock-fallback path (no LLM key configured)
 * since that's the deterministic surface — the LLM-driven path is
 * covered transitively by integration tests against the route.
 */

import { describe, expect, it } from "vitest";
import { generateQuestionsForCompetency } from "../question-generator.js";

const NO_KEY_ENV = {} as any;

describe("generateQuestionsForCompetency (mock fallback)", () => {
  it("returns the requested count of questions", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Technical Depth",
      count: 4,
    });
    expect(out).toHaveLength(4);
  });

  it("clamps count below 1 to 1 and above 6 to 6", async () => {
    const tooFew = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "X",
      count: 0,
    });
    const tooMany = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "X",
      count: 999,
    });
    expect(tooFew).toHaveLength(1);
    expect(tooMany).toHaveLength(6);
  });

  it("echoes the competency name into each prompt + tags difficulty when level is provided", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Leadership",
      level: "L4",
      count: 2,
    });
    for (const q of out) {
      expect(q.prompt.toLowerCase()).toContain("leadership");
      expect(q.difficulty).toBe("L4");
    }
  });

  it("defaults expectedAnswer to 'star' in the mock path", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Communication",
      count: 1,
    });
    expect(out[0].expectedAnswer).toBe("star");
  });
});
