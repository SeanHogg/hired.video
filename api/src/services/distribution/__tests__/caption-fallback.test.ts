/**
 * Planner caption fallback contract (#2300 / #2848).
 *
 * process-posting-agent.ts passes `null` to generateSocialCaption when
 * the user is under AI_CALL_MIN_TOKENS or the per-run caption budget is
 * spent. This file pins that contract from the API test tree (shared/
 * already covers the happy LLM path).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/caption-fallback.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AI_CALL_MIN_TOKENS, hasTokensForAiCall } from "../../../../../shared/pricing.js";
import {
  buildTemplateCaption,
  generateSocialCaption,
  type CaptionSource,
  type CaptionTarget,
} from "../../../../../shared/social-caption.js";

const source: CaptionSource = {
  transcript: "I led a payments rewrite at a fintech startup.",
  resumeText: "Staff engineer · payments\nPreviously at Example Corp.",
};

const target: CaptionTarget = {
  platforms: ["linkedin"],
  tone: "professional",
};

describe("token budget gate (planner)", () => {
  it("refuses a call below AI_CALL_MIN_TOKENS and allows one at the floor", () => {
    assert.equal(hasTokensForAiCall(0), false);
    assert.equal(hasTokensForAiCall(AI_CALL_MIN_TOKENS - 1), false);
    assert.equal(hasTokensForAiCall(AI_CALL_MIN_TOKENS), true);
  });
});

describe("generateSocialCaption fallback", () => {
  it("uses the template when the caller is null (out of tokens)", async () => {
    const cap = await generateSocialCaption(source, target, null);
    const template = buildTemplateCaption(source);
    assert.deepEqual(cap, template);
  });

  it("uses the template when the LLM throws", async () => {
    const cap = await generateSocialCaption(source, target, async () => {
      throw new Error("no tokens");
    });
    assert.equal(cap.hook, "Staff engineer · payments");
    assert.equal(cap.caption, buildTemplateCaption(source).caption);
  });

  it("uses the template when the LLM returns non-JSON", async () => {
    const cap = await generateSocialCaption(source, target, async () => "not json at all");
    assert.deepEqual(cap, buildTemplateCaption(source));
  });

  it("uses the template when JSON is missing hook or caption", async () => {
    const cap = await generateSocialCaption(source, target, async () =>
      JSON.stringify({ hashtags: ["fintech"] }),
    );
    assert.deepEqual(cap, buildTemplateCaption(source));
  });

  it("falls back to a default hook when resume and transcript are empty", () => {
    const cap = buildTemplateCaption({ transcript: "  \n", resumeText: "" });
    assert.equal(cap.hook, "New video on hired.video");
  });

  it("puts a watch link in the template caption when one is given", () => {
    const cap = buildTemplateCaption(source, "https://hired.video/m/abc");
    assert.equal(cap.caption, "Watch: https://hired.video/m/abc");
  });

  it("parses JSON wrapped in extra prose and caps hashtags at 8", async () => {
    const cap = await generateSocialCaption(source, target, async () =>
      `Sure!\n${JSON.stringify({
        hook: "Payments, rewritten.",
        caption: "I led a payments rewrite.",
        hashtags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      })}`,
    );
    assert.equal(cap.hook, "Payments, rewritten.");
    assert.equal(cap.caption, "I led a payments rewrite.");
    assert.equal(cap.hashtags.length, 8);
  });
});
