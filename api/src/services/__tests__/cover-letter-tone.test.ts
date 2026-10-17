/**
 * Cover-letter Tone use case — POST /api/match/cover-letter/tone.
 *
 * Fake LLM, no DB. Pins:
 *   • input validation (tone enum, the letter's own schema) — happy, boundary, error;
 *   • the prompt: the tone's guide, the facts-only rule, and ONLY the letter
 *     body is sent (no greeting / sign-off / date);
 *   • the call is FREE: `exempt: true` (no budget gate, audited not debited)
 *     under its own feature key;
 *   • the rewrite replaces the body and carries everything else (recipient,
 *     greeting, sign-off, date, style) over untouched;
 *   • auth, no-AI and incomplete-output paths.
 *
 * Run: node --import tsx --test src/services/__tests__/cover-letter-tone.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CoverLetterToneInputSchema,
  COVER_LETTER_TONE_FEATURE_KEY,
  TONE_GUIDES,
  applyToneRewrite,
  buildTonePrompt,
  handleCoverLetterTone as coverLetterToneUseCase,
  type ToneWire,
} from "../job/cover-letter-tone.js";
import { asHandler } from "../../handlers/shared.js";

// The use case returns data / throws DomainError; assert the routed envelope.
const handleCoverLetterTone = asHandler(coverLetterToneUseCase);
import { COVER_LETTER_TONES, type CoverLetter } from "../../../../shared/cover-letter.js";
import type { LLMCallOpts, LLMClient, LLMOptions } from "../../services/adapters/llm-client.js";
import { useCaseForFeatureKey } from "../../services/adapters/providers.js";

const USER_ID = randomUUID();

// Mirrors a real letter the writer produced (Macomb CIO, 2026-10).
const LETTER: CoverLetter = {
  jobTitle: "Chief Information Officer",
  organization: "Macomb Community College",
  recipientLines: ["Search Committee, Chief Information Officer (Job No. 202301332)", "Macomb Community College"],
  salutation: "Dear Members of the Search Committee:",
  opening: ["I am applying for the Chief Information Officer role. As CIO at Alliance I cut operating costs by $1.79M (43%)."],
  highlightsIntro: "Your posting stresses three priorities my record covers:",
  highlights: [
    { label: "Budget stewardship", text: "Cut operating costs by $1.79M (43%) while expanding services." },
    { label: "Team leadership", text: "Led a 125+ person technology division across four states." },
  ],
  closing: ["Macomb's mission to serve its community matters to me.", "Thank you for your consideration."],
  signOff: "Sincerely,",
  date: "2026-10-04",
  style: { font: "serif", size: 11, spacing: "normal", paper: "a4" },
};

const WIRE: ToneWire = {
  opening: "I'd love to bring my work as CIO to Macomb. At Alliance I cut operating costs by $1.79M (43%).\n\nIt's work I'm proud of.",
  highlightsIntro: "Here's how my record meets what you're looking for:",
  highlights: [
    { label: "Budget stewardship", text: "I cut operating costs by $1.79M (43%) and grew services." },
    "I led a 125+ person division across four states.",
  ],
  closing: ["Macomb's mission means a lot to me.", "Thank you so much for reading."],
};

interface Call { featureKey: string; options: LLMOptions; opts?: LLMCallOpts }

function fakeLLM(reply: () => unknown): { client: Pick<LLMClient, "callJsonLenient">; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    async callJsonLenient(
      featureKey: string,
      options: LLMOptions,
      spec: { ingest: { parse: (v: unknown) => unknown }; coerce: (w: unknown) => unknown },
      opts?: LLMCallOpts,
    ) {
      calls.push({ featureKey, options, opts });
      const data = spec.coerce(spec.ingest.parse(reply()));
      return { data, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "fake/test" } };
    },
  } as unknown as Pick<LLMClient, "callJsonLenient">;
  return { client, calls };
}

describe("CoverLetterToneInputSchema", () => {
  it("accepts every shared tone with a real letter (happy)", () => {
    for (const tone of COVER_LETTER_TONES) {
      assert.equal(CoverLetterToneInputSchema.safeParse({ tone, letter: LETTER }).success, true, tone);
    }
  });

  it("accepts a letter written before styles existed (boundary: no style)", () => {
    const { style: _style, ...unstyled } = LETTER;
    assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "warm", letter: unstyled }).success, true);
  });

  it("accepts the size bounds 9 and 14 and rejects 8 / 15 (boundary)", () => {
    for (const size of [9, 14]) {
      assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "brief", letter: { ...LETTER, style: { ...LETTER.style, size } } }).success, true, `size ${size}`);
    }
    for (const size of [8, 15]) {
      assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "brief", letter: { ...LETTER, style: { ...LETTER.style, size } } }).success, false, `size ${size}`);
    }
  });

  it("rejects an unknown tone, a missing letter and a letter with no opening (error)", () => {
    assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "sarcastic", letter: LETTER }).success, false);
    assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "warm" }).success, false);
    assert.equal(CoverLetterToneInputSchema.safeParse({ tone: "warm", letter: { ...LETTER, opening: [] } }).success, false);
  });
});

describe("buildTonePrompt", () => {
  it("states the tone's guide and the facts-only rule, under the cover_letter use case", () => {
    const prompt = buildTonePrompt({ tone: "confident", letter: LETTER });
    assert.equal(prompt.useCase, "cover_letter");
    assert.equal(prompt.responseFormat, "json_object");
    assert.ok(prompt.systemPrompt.includes(TONE_GUIDES.confident));
    assert.match(prompt.systemPrompt, /Use ONLY facts stated in the letter/);
    assert.match(prompt.systemPrompt, /Keep every number exactly as written/);
  });

  it("sends ONLY the body — no greeting, sign-off, date, recipient or style", () => {
    const { userMessage } = buildTonePrompt({ tone: "warm", letter: LETTER });
    const sent = JSON.parse(userMessage.replace(/^LETTER \(JSON\):\n/, "")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(sent).sort(), ["closing", "highlights", "highlightsIntro", "jobTitle", "opening", "organization"]);
    assert.ok(userMessage.includes("$1.79M"));
    assert.ok(!userMessage.includes(LETTER.salutation));
    assert.ok(!userMessage.includes(LETTER.date));
  });

  it("has a guide for every shared tone", () => {
    for (const tone of COVER_LETTER_TONES) assert.ok(TONE_GUIDES[tone].length > 10, tone);
  });
});

describe("applyToneRewrite", () => {
  it("replaces the body and carries everything else over", () => {
    const next = applyToneRewrite(LETTER, WIRE, "warm");
    assert.ok(next);
    assert.deepEqual(next.opening, [
      "I'd love to bring my work as CIO to Macomb. At Alliance I cut operating costs by $1.79M (43%).",
      "It's work I'm proud of.",
    ]);
    assert.deepEqual(next.highlights[1], { label: "", text: "I led a 125+ person division across four states." });
    assert.equal(next.salutation, LETTER.salutation);
    assert.equal(next.signOff, LETTER.signOff);
    assert.equal(next.date, LETTER.date);
    assert.deepEqual(next.recipientLines, LETTER.recipientLines);
    assert.deepEqual(next.style, LETTER.style);
  });

  it("keeps the original highlights / closing when a non-brief tone drops them", () => {
    const next = applyToneRewrite(LETTER, { opening: ["New opening."] }, "formal");
    assert.ok(next);
    assert.deepEqual(next.highlights, LETTER.highlights);
    assert.deepEqual(next.closing, LETTER.closing);
  });

  it("lets brief drop every highlight, and clears the intro with them", () => {
    const next = applyToneRewrite(LETTER, { opening: "Short opening.", highlights: [] }, "brief");
    assert.ok(next);
    assert.deepEqual(next.highlights, []);
    assert.equal(next.highlightsIntro, "");
  });

  it("is null without an opening", () => {
    assert.equal(applyToneRewrite(LETTER, { opening: "  ", closing: ["x"] }, "warm"), null);
  });
});

describe("handleCoverLetterTone", () => {
  it("rewrites under its own FREE (exempt) feature key", async () => {
    const { client, calls } = fakeLLM(() => WIRE);
    const res = await handleCoverLetterTone({ llm: client }, USER_ID, { tone: "warm", letter: LETTER });
    assert.equal(res.status, 200);
    const body = res.body as { data: { letter: CoverLetter } };
    assert.equal(body.data.letter.salutation, LETTER.salutation);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].featureKey, COVER_LETTER_TONE_FEATURE_KEY);
    assert.deepEqual(calls[0].opts, { exempt: true });
    assert.equal(useCaseForFeatureKey(COVER_LETTER_TONE_FEATURE_KEY), "cover_letter");
  });

  it("401 signed out, 400 on bad input — before any AI call", async () => {
    const { client, calls } = fakeLLM(() => WIRE);
    assert.equal((await handleCoverLetterTone({ llm: client }, null, { tone: "warm", letter: LETTER })).status, 401);
    assert.equal((await handleCoverLetterTone({ llm: client }, USER_ID, { tone: "loud", letter: LETTER })).status, 400);
    assert.equal((await handleCoverLetterTone({ llm: client }, USER_ID, null)).status, 400);
    assert.equal(calls.length, 0);
  });

  it("503 without AI, 502 on an incomplete rewrite", async () => {
    assert.equal((await handleCoverLetterTone({ llm: null }, USER_ID, { tone: "warm", letter: LETTER })).status, 503);
    const { client } = fakeLLM(() => ({ closing: ["Only a closing."] }));
    const res = await handleCoverLetterTone({ llm: client }, USER_ID, { tone: "warm", letter: LETTER });
    assert.equal(res.status, 502);
  });
});
