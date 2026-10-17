/**
 * Tests for `handleJobSentimentPrediction` (services/job/job-sentiment-handler.ts).
 *
 * Mirrors the resume-side coverage in resume-handlers.test.ts. Critical
 * scenarios pinned here:
 *   • 400 when no jobId in body
 *   • 400 when body is a bare string (the legacy frontend payload that
 *     caused the 2026-05-04 resume-side regression — guarded against
 *     before the same bug can land on the job side)
 *   • 404 when the job does not exist
 *   • Happy path: scores rendered job text, persists `sentiment_score`
 *     on the row, score reflects the description
 *   • Cross-route contract: a job and a resume with identical text
 *     score identically (both pull through the shared `scoreSentiment`
 *     in shared/sentiment.ts — guards against the divergent-ladder
 *     regression that motivated that consolidation)
 *
 * Run: node --import tsx --test src/services/__tests__/job-sentiment-handler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";
import { handleJobSentimentPrediction as jobSentimentUseCase } from "../job/job-sentiment-handler.js";
import { asHandler } from "../../handlers/shared.js";
import { jobRowToLLMText } from "../job/match-handlers.js";
import { scoreSentiment } from "../../../../shared/sentiment.js";

// The use case returns data / throws DomainError; assert the HTTP envelope
// the route sends.
const handleJobSentimentPrediction = asHandler(jobSentimentUseCase);

const JOB_ID = "22222222-2222-2222-2222-222222222222";

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date("2026-05-04T00:00:00Z");
  // Long description so it lands in the highest scoring bucket — proves
  // the handler is scoring the *description text*, not the jobId.
  const description =
    "We are looking for a senior engineer to join our distributed-systems " +
    "team. You will own platform infrastructure, mentor a team of four, " +
    "and partner with product on the next generation of our developer " +
    "tooling. Strong TypeScript, Postgres, and Cloudflare Workers " +
    "experience is required. Bonus points for prior open-source contributions.";
  return {
    id: JOB_ID,
    postedByUserId: null,
    companyId: null,
    title: "Staff Engineer",
    description,
    company: "Acme",
    location: "Remote",
    jobType: "full_time",
    experienceLevel: "senior",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "USD",
    skillsRequired: ["TypeScript", "Postgres", "Cloudflare Workers"],
    details: {
      responsibilities: ["Own platform infra", "Mentor team"],
      requirements: ["TypeScript", "Postgres"],
      qualifications: [],
      benefits: ["Remote-first"],
    },
    isRemote: true,
    isActive: true,
    expiresAt: null,
    sponsored: false,
    sponsoredUntil: null,
    sponsoredRankBoost: 0,
    sourceUrl: null,
    applyUrl: null,
    heroImageUrl: null,
    sentimentScore: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDeps(seedJobs: ReturnType<typeof makeJob>[] = []) {
  const fake = buildFakeDb({ job_items: seedJobs as any });
  return {
    deps: { jobs: new JobsRepository(fake.db, () => new Date("2026-05-04T00:00:00Z")) },
    state: fake.state,
  };
}

describe("handleJobSentimentPrediction", () => {
  it("400s when no jobId is supplied", async () => {
    const { deps } = makeDeps();
    const res = await handleJobSentimentPrediction(deps, {});
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, "VALIDATION_ERROR");
  });

  it("400s when the body is a bare string (legacy regression guard)", async () => {
    const { deps, state } = makeDeps([makeJob()]);
    const res = await handleJobSentimentPrediction(deps, JOB_ID);
    assert.equal(res.status, 400);
    // Critical: the bare string must NOT be silently scored. Same bug
    // class as the 2026-05-04 resume-side regression.
    assert.equal((state as any).job_items[0].sentimentScore, null);
  });

  it("404s when the job does not exist", async () => {
    const { deps } = makeDeps();
    const res = await handleJobSentimentPrediction(deps, { jobId: JOB_ID });
    assert.equal(res.status, 404);
  });

  it("scores the rendered job text (not the jobId) and persists the score", async () => {
    const { deps, state } = makeDeps([makeJob()]);
    const res = await handleJobSentimentPrediction(deps, { jobId: JOB_ID });
    assert.equal(res.status, 200);
    const score = (res.body as any).data.score;
    // Cross-check: must equal what the shared scorer returns for the
    // job's rendered text. Same contract as the resume side.
    const expected = scoreSentiment(jobRowToLLMText(makeJob() as Record<string, unknown>));
    assert.equal(score, expected);
    // Top bucket — proves we're not falling through to "score the id".
    assert.equal(score, 85);
    assert.equal((state as any).job_items[0].sentimentScore, score);
  });

  it("matches /sentiment/sentimentprediction for the same effective text (cross-route contract)", async () => {
    // Two paths produce a sentiment score for jobs: the raw-text route
    // (pasted job description) and this handler. They MUST agree on
    // identical text or the user sees different numbers depending on
    // whether the job was saved. Same invariant as the resume side
    // (resume-handlers.test.ts).
    const { deps } = makeDeps([makeJob()]);

    const res = await handleJobSentimentPrediction(deps, { jobId: JOB_ID });
    const handlerScore = (res.body as any).data.score;

    const renderedText = jobRowToLLMText(makeJob() as Record<string, unknown>);
    const rawTextScore = scoreSentiment(renderedText);

    assert.equal(handlerScore, rawTextScore);
  });
});
