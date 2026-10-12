/**
 * Unit tests for the help-first deflection pure logic (help-assist.ts).
 *
 * Run: node --import tsx --test src/services/help/__tests__/help-assist-logic.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  HELP_ASSIST_ESCALATE_TOKEN,
  buildHelpDocsBlock,
  decideHelpEscalation,
  buildHelpAssistSystemPrompt,
} from "../help-assist.js";

describe("buildHelpDocsBlock", () => {
  it("frames usable candidates with a numbered title header", () => {
    const block = buildHelpDocsBlock([
      { slug: "set-up-profile", title: "Set up your profile", body: "Go to settings…" },
    ]);
    assert.match(block, /### Doc 1: Set up your profile/);
    assert.match(block, /Go to settings…/);
  });

  it("falls back to the slug when a title is absent", () => {
    const block = buildHelpDocsBlock([{ slug: "change-password", body: "Open security." }]);
    assert.match(block, /### Doc 1: change-password/);
  });

  it("returns empty string for no / non-array / empty input", () => {
    assert.equal(buildHelpDocsBlock(undefined), "");
    assert.equal(buildHelpDocsBlock([]), "");
    assert.equal(buildHelpDocsBlock("nope" as unknown), "");
  });

  it("drops candidates without a non-empty body (nothing to ground on)", () => {
    assert.equal(buildHelpDocsBlock([{ slug: "x", title: "X" }]), "");
    assert.equal(buildHelpDocsBlock([{ slug: "x", title: "X", body: "   " }]), "");
  });

  it("caps the number of docs (default 6)", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ slug: `s${i}`, body: `b${i}` }));
    const block = buildHelpDocsBlock(many);
    assert.match(block, /### Doc 6:/);
    assert.equal(/### Doc 7:/.test(block), false);
  });

  it("caps per-doc body length", () => {
    const block = buildHelpDocsBlock([{ slug: "s", body: "x".repeat(5000) }], { maxBodyChars: 100 });
    // header + 100 chars of body, not 5000
    assert.equal(block.includes("x".repeat(101)), false);
    assert.ok(block.includes("x".repeat(100)));
  });
});

describe("decideHelpEscalation", () => {
  it("escalates on empty / whitespace / nullish reply", () => {
    assert.deepEqual(decideHelpEscalation(""), { escalate: true });
    assert.deepEqual(decideHelpEscalation("   "), { escalate: true });
    assert.deepEqual(decideHelpEscalation(null), { escalate: true });
    assert.deepEqual(decideHelpEscalation(undefined), { escalate: true });
  });

  it("escalates when the sentinel appears anywhere in the reply", () => {
    assert.deepEqual(decideHelpEscalation(HELP_ASSIST_ESCALATE_TOKEN), { escalate: true });
    assert.deepEqual(
      decideHelpEscalation(`I'm not sure. ${HELP_ASSIST_ESCALATE_TOKEN}`),
      { escalate: true },
    );
  });

  it("returns a trimmed answer for a real reply", () => {
    assert.deepEqual(decideHelpEscalation("  Go to Settings → Security.  "), {
      escalate: false,
      answer: "Go to Settings → Security.",
    });
  });
});

describe("buildHelpAssistSystemPrompt", () => {
  it("embeds the persona, the docs, and the exact escalate sentinel", () => {
    const prompt = buildHelpAssistSystemPrompt("PERSONA-X", "### Doc 1: T\nbody");
    assert.match(prompt, /PERSONA-X/);
    assert.match(prompt, /### Doc 1: T/);
    assert.ok(prompt.includes(`EXACTLY "${HELP_ASSIST_ESCALATE_TOKEN}"`));
  });
});
