/**
 * Tests for the XYZ-format rewrite primitives behind /api/resumeoptimizer/
 * rewrite-xyz-highlights and /rewrite-xyz-text.
 *
 * Pure-dependency tests — no DB, no HTTP. The LLMClient is stubbed so
 * the assertions are about HOW the service shapes the request + handles
 * the response (fallbacks, context-block assembly, schema validation),
 * not about what the real model returns.
 *
 * Run: node --import tsx --test src/services/__tests__/rewrite-xyz.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";

import {
  rewriteHighlightsAsXyz,
  rewriteTextAsXyz,
  XYZ_HIGHLIGHTS_SYSTEM_PROMPT,
  XYZ_SUMMARY_SYSTEM_PROMPT,
  XYZ_POSITION_SYSTEM_PROMPT,
} from "../resume/rewrite-xyz.js";
import type { LLMClient, LLMOptions } from "../adapters/llm-client.js";

// ─── Stub LLMClient ─────────────────────────────────────────────────────
// Captures the (featureKey, options) the service passed and returns a
// caller-supplied canned JSON value. Cast to LLMClient so we satisfy the
// service's parameter type without implementing the other 3 methods we
// don't exercise.

interface Capture {
  featureKey: string;
  options: LLMOptions;
}

function stubLLM<T>(
  cannedData: T,
  capture: { last?: Capture } = {},
): LLMClient {
  return {
    async callJson<R>(
      featureKey: string,
      options: LLMOptions,
      _schema: z.ZodType<R>,
    ): Promise<{ data: R; usage: { totalTokens: number } }> {
      capture.last = { featureKey, options };
      return {
        data: cannedData as unknown as R,
        usage: { totalTokens: 0 } as unknown as { totalTokens: number },
      };
    },
  } as unknown as LLMClient;
}

function throwingLLM(err: Error): LLMClient {
  return {
    async callJson() {
      throw err;
    },
  } as unknown as LLMClient;
}

// ═══════════════════════════════════════════════════════════════════════
// rewriteHighlightsAsXyz
// ═══════════════════════════════════════════════════════════════════════

describe("rewriteHighlightsAsXyz", () => {
  it("returns empty items array for empty input without calling the LLM", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ items: [{ text: "should not appear", sources: [1] }] }, capture);

    const result = await rewriteHighlightsAsXyz([], undefined, llm);

    assert.deepEqual(result, { items: [] });
    assert.equal(capture.last, undefined, "LLM should not be called for empty input");
  });

  it("passes XYZ-format system prompt and numbered user bullets", async () => {
    const capture: { last?: Capture } = {};
    const canned = {
      items: [
        { text: "Drove a 40% reduction in onboarding time by rewriting the wizard.", sources: [1, 2] },
        { text: "Launched SOC2 audit prep, closing 23 controls in 6 weeks.", sources: [3] },
      ],
    };
    const llm = stubLLM(canned, capture);

    const result = await rewriteHighlightsAsXyz(
      [
        "Worked on onboarding wizard",
        "Helped improve onboarding by 40%",
        "Worked on SOC2 controls",
      ],
      { role: "Engineering Manager", organization: "Acme" },
      llm,
    );

    assert.deepEqual(result.items, canned.items);
    assert.ok(capture.last, "LLM should have been called");
    assert.equal(capture.last!.options.systemPrompt, XYZ_HIGHLIGHTS_SYSTEM_PROMPT);
    assert.equal(capture.last!.options.responseFormat, "json_object");
    assert.match(capture.last!.options.userMessage, /Role: Engineering Manager/);
    assert.match(capture.last!.options.userMessage, /Organization: Acme/);
    assert.match(capture.last!.options.userMessage, /1\. Worked on onboarding wizard/);
    assert.match(capture.last!.options.userMessage, /3\. Worked on SOC2 controls/);
  });

  it("falls back to 1:1 echo when the model returns zero items", async () => {
    const llm = stubLLM({ items: [] });
    const input = ["Bullet A", "Bullet B"];
    const result = await rewriteHighlightsAsXyz(input, undefined, llm);

    assert.equal(result.items.length, input.length);
    assert.deepEqual(
      result.items,
      input.map((text, i) => ({ text, sources: [i + 1] })),
      "Empty model output must echo input 1:1 so the wand never destroys user data",
    );
  });

  it("omits context block when no context fields are supplied", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ items: [{ text: "X", sources: [1] }] }, capture);

    await rewriteHighlightsAsXyz(["one bullet"], undefined, llm);

    assert.ok(capture.last, "LLM should have been called");
    assert.doesNotMatch(capture.last!.options.userMessage, /Role:/);
    assert.doesNotMatch(capture.last!.options.userMessage, /Organization:/);
    assert.doesNotMatch(capture.last!.options.userMessage, /Summary:/);
  });

  it("includes summary in the context block when supplied", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ items: [{ text: "X", sources: [1] }] }, capture);

    await rewriteHighlightsAsXyz(
      ["b"],
      { summary: "Owned developer experience" },
      llm,
    );

    assert.match(capture.last!.options.userMessage, /Summary: Owned developer experience/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// rewriteTextAsXyz
// ═══════════════════════════════════════════════════════════════════════

describe("rewriteTextAsXyz", () => {
  it("returns the original unchanged for empty input without calling the LLM", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ improved: "should not appear" }, capture);

    const result = await rewriteTextAsXyz("summary", "", undefined, llm);

    assert.equal(result.improved, "");
    assert.equal(capture.last, undefined);
  });

  it("uses the summary prompt for kind='summary'", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ improved: "Engineering lead for X." }, capture);

    await rewriteTextAsXyz(
      "summary",
      "Was an engineering lead",
      { role: "Eng Lead", organization: "Acme" },
      llm,
    );

    assert.equal(capture.last!.options.systemPrompt, XYZ_SUMMARY_SYSTEM_PROMPT);
    assert.match(capture.last!.options.userMessage, /Role summary:/);
  });

  it("uses the position prompt for kind='position'", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ improved: "Software Engineer II" }, capture);

    await rewriteTextAsXyz("position", "Eng II", { organization: "Acme" }, llm);

    assert.equal(capture.last!.options.systemPrompt, XYZ_POSITION_SYSTEM_PROMPT);
    assert.match(capture.last!.options.userMessage, /Job title:/);
  });

  it("includes highlights in the context block for summary rewrites", async () => {
    const capture: { last?: Capture } = {};
    const llm = stubLLM({ improved: "x" }, capture);

    await rewriteTextAsXyz(
      "summary",
      "Original summary",
      { highlights: ["Shipped feature A", "Cut latency 40%"] },
      llm,
    );

    assert.match(capture.last!.options.userMessage, /Highlights under this entry/);
    assert.match(capture.last!.options.userMessage, /1\. Shipped feature A/);
    assert.match(capture.last!.options.userMessage, /2\. Cut latency 40%/);
  });

  it("returns the improved text + notes when the model provides notes", async () => {
    const llm = stubLLM({
      improved: "Drove a 40% reduction in onboarding latency.",
      notes: ["preserved 40% metric"],
    });

    const result = await rewriteTextAsXyz(
      "summary",
      "Made onboarding faster",
      undefined,
      llm,
    );

    assert.equal(result.improved, "Drove a 40% reduction in onboarding latency.");
    assert.deepEqual(result.notes, ["preserved 40% metric"]);
  });

  it("propagates LLM errors so the route can record + echo", async () => {
    const llm = throwingLLM(new Error("upstream 503"));

    await assert.rejects(
      () => rewriteTextAsXyz("summary", "Original", undefined, llm),
      /upstream 503/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// System-prompt invariants
// ═══════════════════════════════════════════════════════════════════════

describe("system prompts", () => {
  it("XYZ_HIGHLIGHTS_SYSTEM_PROMPT forbids invented metrics", () => {
    assert.match(
      XYZ_HIGHLIGHTS_SYSTEM_PROMPT,
      /Do NOT invent metrics/,
      "Conservative-rewrite rule is the most important contract — preserving the 'never fabricate numbers' guardrail",
    );
  });

  it("XYZ_HIGHLIGHTS_SYSTEM_PROMPT requires source coverage (no orphans)", () => {
    assert.match(XYZ_HIGHLIGHTS_SYSTEM_PROMPT, /no orphans/);
  });

  it("XYZ_POSITION_SYSTEM_PROMPT explicitly forbids promoting seniority", () => {
    assert.match(
      XYZ_POSITION_SYSTEM_PROMPT,
      /Do NOT promote them/,
      "Job titles are factual claims — silent seniority drift would be a resume-fraud bug",
    );
  });

  it("XYZ_SUMMARY_SYSTEM_PROMPT caps the output length", () => {
    assert.match(XYZ_SUMMARY_SYSTEM_PROMPT, /400 characters/);
  });
});
