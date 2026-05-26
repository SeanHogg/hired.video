/**
 * Tests for the competency-aware variant of the question generator
 * (#1439). Exercises the mock-fallback path (no LLM key configured)
 * since that's the deterministic surface — the LLM-driven path is
 * covered transitively by integration tests against the route.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { generateQuestionsForCompetency } from "../question-generator.js";

const NO_KEY_ENV = {} as any;

describe("generateQuestionsForCompetency (mock fallback)", () => {
  it("returns the requested count of questions", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Technical Depth",
      count: 4,
    });
    assert.equal(out.length, 4);
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
    assert.equal(tooFew.length, 1);
    assert.equal(tooMany.length, 6);
  });

  it("echoes the competency name into each prompt + tags difficulty when level is provided", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Leadership",
      level: "L4",
      count: 2,
    });
    for (const q of out) {
      assert.ok(q.prompt.toLowerCase().includes("leadership"));
      assert.equal(q.difficulty, "L4");
    }
  });

  it("defaults expectedAnswer to 'star' in the mock path", async () => {
    const out = await generateQuestionsForCompetency(NO_KEY_ENV, undefined, {
      competencyName: "Communication",
      count: 1,
    });
    assert.equal(out[0].expectedAnswer, "star");
  });
});
