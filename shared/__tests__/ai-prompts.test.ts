/**
 * Locks the AI prompt registry shape:
 * - every PromptId in the union has a registered entry
 * - every registered entry's `id` matches its registry key
 * - rendered prompts are non-empty
 * - getPrompt returns the same reference as PROMPTS[id]
 * - getPrompt throws on unknown ids (catches typo'd callers)
 *
 * Run: node --import tsx --test shared/__tests__/ai-prompts.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PROMPT_IDS,
  PROMPTS,
  getPrompt,
  type PromptId,
} from "../ai-prompts/index.js";

describe("ai-prompts registry", () => {
  it("registers every PromptId in the union", () => {
    const expected: PromptId[] = [
      "career-coach",
      "career-resilience",
      "resume-editor-consolidate",
      "resume-editor-shorten",
      "resume-roast",
      "interview-question-generator",
      "interview-answer-coach",
      "video-pitch",
    ];
    assert.deepStrictEqual([...PROMPT_IDS].sort(), [...expected].sort());
  });

  it("every entry's `id` matches its registry key", () => {
    for (const id of PROMPT_IDS) {
      assert.strictEqual(
        PROMPTS[id].id,
        id,
        `Prompt under key "${id}" has mismatched id "${PROMPTS[id].id}"`,
      );
    }
  });

  it("every entry has a non-empty description", () => {
    for (const id of PROMPT_IDS) {
      assert.ok(
        PROMPTS[id].description.length > 0,
        `Prompt "${id}" has empty description`,
      );
    }
  });

  it("renders a non-empty string for every prompt with empty vars", () => {
    // career-coach and the editor/roast/coach prompts accept empty vars
    // (or vars-less); interview-question-generator needs type + count.
    for (const id of PROMPT_IDS) {
      let rendered: string;
      if (id === "interview-question-generator") {
        rendered = PROMPTS[id].render({ type: "behavioural", count: 5 });
      } else if (id === "video-pitch") {
        rendered = PROMPTS[id].render({ targetWordCount: 90, tone: "professional" });
      } else {
        rendered = (PROMPTS[id].render as (v: Record<string, unknown>) => string)({});
      }
      assert.ok(
        rendered.trim().length > 0,
        `Prompt "${id}" rendered empty string`,
      );
    }
  });

  it("getPrompt returns the same reference as the registry", () => {
    for (const id of PROMPT_IDS) {
      assert.strictEqual(getPrompt(id), PROMPTS[id]);
    }
  });

  it("getPrompt throws on unknown id", () => {
    assert.throws(
      () => getPrompt("not-a-real-prompt" as PromptId),
      /Unknown prompt id/,
    );
  });

  it("career-coach prompt interpolates user info", () => {
    const withUser = PROMPTS["career-coach"].render({
      name: "Sean",
      role: "recruiter",
      plan: "pro",
    });
    const withoutUser = PROMPTS["career-coach"].render({});
    assert.ok(withUser.includes("Sean"), "expected name in rendered prompt");
    assert.ok(withUser.includes("recruiter"), "expected role in rendered prompt");
    assert.ok(withUser.includes("pro"), "expected plan in rendered prompt");
    assert.ok(
      !withoutUser.includes("USER PROFILE"),
      "expected empty user info to omit the USER PROFILE block",
    );
  });

  it("interview-question-generator interpolates type + count", () => {
    const rendered = PROMPTS["interview-question-generator"].render({
      type: "system-design",
      count: 7,
    });
    assert.ok(rendered.includes("system-design interview"));
    assert.ok(rendered.includes("exactly 7"));
  });
});
