/**
 * Cover letter use case — POST /api/match/cover-letter.
 *
 * Fake LLM, no DB rows needed (pasted job + inline résumé). Pins:
 *   • the model sees THIS job and THIS résumé, under the cover_letter use case;
 *   • the wire is normalised (string highlights, one-string paragraphs) and
 *     the letter is dated by the server, never the model;
 *   • auth, validation, no-AI and incomplete-output paths.
 *
 * Run: node --import tsx --test src/services/__tests__/cover-letter-handler.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { handleCoverLetter, toCoverLetter } from "../job/cover-letter-handler.js";
import type { MatchDeps } from "../job/match-handlers.js";
import type { LLMClient, LLMOptions } from "../../services/adapters/llm-client.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

const USER_ID = randomUUID();
const NOW = new Date("2026-10-04T15:00:00Z");

const RESUME = {
  basics: { name: "Sean Hogg", label: "CIO", email: "sean@example.com", summary: "CIO with 25 years in IT leadership." },
  work: [
    {
      name: "Alliance Inspection Management",
      position: "CIO / VP of Technology",
      highlights: ["Cut operating costs by $1.79M (43%).", "Led a 125+ person division."],
    },
  ],
};
const JOB_TEXT = "Chief Information Officer — Macomb Community College, 16000 Hall Rd, Clinton Township, MI. Job Number 202301332.";

const WIRE = {
  jobTitle: "Chief Information Officer",
  organization: "Macomb Community College",
  recipientLines: ["Search Committee, Chief Information Officer (Job No. 202301332)", "Macomb Community College"],
  salutation: "Dear Members of the Search Committee:",
  opening: "I am applying for the Chief Information Officer role.\n\nAs CIO I cut costs by $1.79M.",
  highlights: ["Led a 125+ person division.", { label: "Budget", text: "Cut operating costs 43%." }],
  closing: ["Thank you for your consideration."],
  signOff: "Sincerely,",
};

interface Call { featureKey: string; options: LLMOptions }

function fakeLLM(reply: () => unknown): { client: LLMClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    async callJsonLenient(featureKey: string, options: LLMOptions, spec: { ingest: { parse: (v: unknown) => unknown }; coerce: (w: unknown) => unknown }) {
      calls.push({ featureKey, options });
      const data = spec.coerce(spec.ingest.parse(reply()));
      return { data, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "fake/test" } };
    },
  } as unknown as LLMClient;
  return { client, calls };
}

function deps(llm: LLMClient | null): MatchDeps {
  return { db: buildFakeDb().db, now: () => NOW, llm, runDetached: () => {} };
}

describe("handleCoverLetter", () => {
  it("writes the letter from THIS job and THIS résumé, dated by the server", async () => {
    const { client, calls } = fakeLLM(() => WIRE);
    const res = await handleCoverLetter(deps(client), USER_ID, { jobHtml: JOB_TEXT, resumeContent: RESUME });
    assert.equal(res.status, 200);
    const { letter } = (res.body as { data: { letter: Record<string, unknown> } }).data;
    assert.equal(letter.date, "2026-10-04");
    assert.deepEqual(letter.opening, ["I am applying for the Chief Information Officer role.", "As CIO I cut costs by $1.79M."]);
    assert.deepEqual(letter.highlights, [
      { label: "", text: "Led a 125+ person division." },
      { label: "Budget", text: "Cut operating costs 43%." },
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].featureKey, "cover_letter_generate");
    assert.equal(calls[0].options.useCase, "cover_letter");
    assert.match(calls[0].options.userMessage, /Macomb Community College/);
    assert.match(calls[0].options.userMessage, /Alliance Inspection Management/);
  });

  it("requires a signed-in user", async () => {
    const { client } = fakeLLM(() => WIRE);
    const res = await handleCoverLetter(deps(client), null, { jobHtml: JOB_TEXT, resumeContent: RESUME });
    assert.equal(res.status, 401);
  });

  it("rejects a request without a job", async () => {
    const { client } = fakeLLM(() => WIRE);
    const res = await handleCoverLetter(deps(client), USER_ID, { resumeContent: RESUME });
    assert.equal(res.status, 400);
  });

  it("503s without an AI provider", async () => {
    const res = await handleCoverLetter(deps(null), USER_ID, { jobHtml: JOB_TEXT, resumeContent: RESUME });
    assert.equal(res.status, 503);
  });

  it("502s when the model returns no opening paragraph", async () => {
    const { client } = fakeLLM(() => ({ ...WIRE, opening: "" }));
    const res = await handleCoverLetter(deps(client), USER_ID, { jobHtml: JOB_TEXT, resumeContent: RESUME });
    assert.equal(res.status, 502);
  });
});

describe("toCoverLetter", () => {
  it("fills a missing salutation and sign-off instead of failing", () => {
    const letter = toCoverLetter({ opening: ["Hello."] }, "2026-10-04");
    assert.equal(letter?.salutation, "Dear Hiring Committee,");
    assert.equal(letter?.signOff, "Sincerely,");
    assert.deepEqual(letter?.recipientLines, []);
  });
});
