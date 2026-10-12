/**
 * Social caption generation (#2300).
 * Run: node --import tsx --test shared/__tests__/social-caption.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateCaption,
  generateSocialCaption,
  type CaptionSource,
  type CaptionTarget,
} from "../social-caption.js";

const source: CaptionSource = {
  transcript: "I led a payments rewrite at a fintech startup.",
  resumeText: "Staff engineer · payments\nPreviously at Example Corp.",
};

const target: CaptionTarget = {
  platforms: ["linkedin"],
  tone: "professional",
};

describe("buildTemplateCaption", () => {
  it("uses the resume headline and preset hashtags", () => {
    const cap = buildTemplateCaption(source);
    assert.equal(cap.hook, "Staff engineer · payments");
    assert.ok(cap.hashtags.includes("hiring"));
    assert.ok(cap.caption.includes("hired.video"));
  });
});

describe("generateSocialCaption", () => {
  it("falls back to the template when there is no LLM", async () => {
    const cap = await generateSocialCaption(source, target, null);
    assert.equal(cap.hook, "Staff engineer · payments");
  });

  it("parses the LLM JSON when the caller returns a caption", async () => {
    const cap = await generateSocialCaption(source, target, async () =>
      JSON.stringify({
        hook: "Payments, rewritten.",
        caption: "I led a payments rewrite.",
        hashtags: ["fintech"],
      }),
    );
    assert.equal(cap.hook, "Payments, rewritten.");
    assert.equal(cap.caption, "I led a payments rewrite.");
    assert.deepEqual(cap.hashtags, ["fintech"]);
  });

  it("falls back when the LLM throws", async () => {
    const cap = await generateSocialCaption(source, target, async () => {
      throw new Error("no tokens");
    });
    assert.equal(cap.hook, "Staff engineer · payments");
  });
});
