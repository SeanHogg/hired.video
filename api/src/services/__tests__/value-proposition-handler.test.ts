/**
 * Value Proposition use case — POST /api/valueproposition/generate.
 *
 * Fake DB + fake LLM, same harness shape as match-handlers.test.ts. Pins:
 *   • the LLM actually sees THIS résumé + THIS job (+ company context) —
 *     the old route returned one canned pitch for every input (#2335);
 *   • résumé ids are owner-scoped (another user's id → 404, never read);
 *   • input validation, unknown ids, no-AI and LLM failure paths.
 *
 * Run: node --import tsx --test src/services/__tests__/value-proposition-handler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { handleValueProposition as valuePropositionUseCase, buildValuePropositionMessage } from "../job/value-proposition-handler.js";
import { handleByid as byidUseCase, type MatchDeps } from "../job/match-handlers.js";
import type { LLMClient, LLMOptions } from "../../services/adapters/llm-client.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { asHandler } from "../../handlers/shared.js";

// Use cases return data / throw DomainError; assert the routed envelope.
const handleValueProposition = asHandler(valuePropositionUseCase);
const handleByid = asHandler(byidUseCase);

const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const JOB_ID = randomUUID();
const RESUME_ID = randomUUID();
const OTHER_RESUME_ID = randomUUID();

const PITCH = {
  valueProposition: "I cut page load times by more than half on a React estate the size of yours.",
  executiveSummary: "Eight years of React with measured performance wins; strong fit for the senior frontend role.",
  keyStrengths: ["Cut LCP from 4.2s to 1.8s with a Next.js redesign", "Led a Redux→Zustand migration (-18% bundle)"],
  alignmentPoints: ["5+ years React ↔ 8 years building React apps", "TypeScript required ↔ TS across both roles"],
  callToAction: "Happy to walk through the LCP work in a 20-minute call.",
  confidenceScore: 0.84,
};

interface Call { featureKey: string; options: LLMOptions }

function fakeLLM(reply: () => unknown): { client: LLMClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    async callJson(featureKey: string, options: LLMOptions, schema: { parse: (v: unknown) => unknown }) {
      calls.push({ featureKey, options });
      return { data: schema.parse(reply()), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "fake/test" } };
    },
  } as unknown as LLMClient;
  return { client, calls };
}

function seedResume(id: string, userId: string, name: string): Record<string, unknown> {
  return {
    id,
    userId,
    title: `${name} — master`,
    content: {
      basics: { name, label: "Senior Frontend Engineer", summary: "Senior frontend engineer with 8 years building React apps." },
      work: [{
        name: "Acme",
        position: "Senior Engineer",
        startDate: "2022-01",
        endDate: "Present",
        highlights: ["Shipped a Next.js redesign that cut LCP from 4.2s to 1.8s."],
      }],
    },
  };
}

const JOB = {
  id: JOB_ID,
  title: "Senior Frontend Engineer",
  company: "GlobalCo",
  location: "Remote, USA",
  description: "Build beautiful React apps. TypeScript required. 5+ years experience.",
  details: { requirements: ["5+ years React", "TypeScript"] },
};

function deps(llm: LLMClient | null): MatchDeps {
  const fake = buildFakeDb({
    resume_information: [seedResume(RESUME_ID, USER_ID, "Jane Doe"), seedResume(OTHER_RESUME_ID, OTHER_USER_ID, "Someone Else")],
    job_items: [JOB],
    resume_match_scores: [],
  });
  return { db: fake.db, now: () => new Date("2026-10-04T00:00:00Z"), llm, runDetached: () => {} };
}

const PASTED_JOB = "Senior Frontend Engineer at GlobalCo. React and TypeScript, 5+ years.";
const PASTED_RESUME = "Jane Doe — Senior Engineer at Acme. Cut LCP from 4.2s to 1.8s.";

describe("handleValueProposition", () => {
  it("401s an anonymous caller", async () => {
    const res = await handleValueProposition(deps(fakeLLM(() => PITCH).client), null, { jobContent: PASTED_JOB, resumeContent: PASTED_RESUME });
    assert.equal(res.status, 401);
  });

  it("400s when the job or the résumé is missing", async () => {
    const { client, calls } = fakeLLM(() => PITCH);
    assert.equal((await handleValueProposition(deps(client), USER_ID, { resumeContent: PASTED_RESUME })).status, 400);
    assert.equal((await handleValueProposition(deps(client), USER_ID, { jobContent: PASTED_JOB })).status, 400);
    assert.equal((await handleValueProposition(deps(client), USER_ID, { jobContent: "   ", resumeContent: PASTED_RESUME })).status, 400);
    assert.equal(calls.length, 0);
  });

  it("sends the pasted job, résumé and company context to the value_proposition use case", async () => {
    const { client, calls } = fakeLLM(() => PITCH);
    const res = await handleValueProposition(deps(client), USER_ID, {
      jobContent: PASTED_JOB,
      resumeContent: PASTED_RESUME,
      companyName: "GlobalCo",
      companyMission: "Make the web fast",
    });
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as { data: unknown }).data, PITCH);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].featureKey, "value_proposition_generate");
    assert.equal(calls[0].options.useCase, "value_proposition");
    const msg = calls[0].options.userMessage;
    assert.match(msg, /React and TypeScript/);
    assert.match(msg, /Cut LCP from 4\.2s/);
    assert.match(msg, /Company: GlobalCo/);
    assert.match(msg, /Mission: Make the web fast/);
  });

  it("reads a tracked job and the caller's own résumé by id", async () => {
    const { client, calls } = fakeLLM(() => PITCH);
    const res = await handleValueProposition(deps(client), USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 200);
    const msg = calls[0].options.userMessage;
    assert.match(msg, /Senior Frontend Engineer/);
    assert.match(msg, /Jane Doe/);
    assert.match(msg, /4\.2s to 1\.8s/);
  });

  it("never reads another user's résumé by id", async () => {
    const { client, calls } = fakeLLM(() => PITCH);
    const res = await handleValueProposition(deps(client), USER_ID, { jobId: JOB_ID, resumeId: OTHER_RESUME_ID });
    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
  });

  it("404s an unknown job id", async () => {
    const res = await handleValueProposition(deps(fakeLLM(() => PITCH).client), USER_ID, { jobId: randomUUID(), resumeContent: PASTED_RESUME });
    assert.equal(res.status, 404);
  });

  it("503s instead of inventing a pitch when no AI is configured", async () => {
    const res = await handleValueProposition(deps(null), USER_ID, { jobContent: PASTED_JOB, resumeContent: PASTED_RESUME });
    assert.equal(res.status, 503);
  });

  it("lets an LLM failure or off-schema reply throw for the route's AI_* envelope", async () => {
    const boom = { callJson: async () => { throw new Error("gateway down"); } } as unknown as LLMClient;
    await assert.rejects(handleValueProposition(deps(boom), USER_ID, { jobContent: PASTED_JOB, resumeContent: PASTED_RESUME }), /gateway down/);
    const offSchema = fakeLLM(() => ({ ...PITCH, confidenceScore: 84 })).client;
    await assert.rejects(handleValueProposition(deps(offSchema), USER_ID, { jobContent: PASTED_JOB, resumeContent: PASTED_RESUME }));
  });
});

describe("buildValuePropositionMessage", () => {
  it("omits the company block when no company context is given", () => {
    const msg = buildValuePropositionMessage("JOB", "RESUME", {});
    assert.doesNotMatch(msg, /Company context/);
    assert.match(msg, /Job:\nJOB/);
    assert.match(msg, /Resume:\nRESUME/);
  });
});

describe("match /byid résumé ownership", () => {
  it("404s on another user's résumé id instead of scoring it", async () => {
    const res = await handleByid(deps(null), USER_ID, { jobId: JOB_ID, resumeId: OTHER_RESUME_ID });
    assert.equal(res.status, 404);
  });
});
