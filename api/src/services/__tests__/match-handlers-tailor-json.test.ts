/**
 * Tests for the POST /api/match/tailor handler.
 *
 * The endpoint tailors a resume against a job AND persists the result
 * as a variation in one call. Clients render straight from
 * `tailoredResume` (web via DeclarativeResumeRenderer; extension via
 * renderMarkdownFromJsonResume) and use `variationId` to navigate to
 * the saved copy. No markdown is shipped.
 *
 * Runs fully locally with a fake LLM + fake DB.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleTailor,
  resolveJobV2,
  resolveResumeV2,
  validateTailorOutput,
  buildTailorPrompt,
  strengthenPrompt,
  TailorResponseSchema,
  type MatchDeps,
} from "../job/match-handlers.js";
import type { LLMClient } from "../../services/adapters/llm-client.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = randomUUID();
const JOB_ID = randomUUID();
const RESUME_ID = randomUUID();

function seedJobRow(): any {
  return {
    id: JOB_ID,
    title: "Senior Frontend Engineer",
    company: "GlobalCo",
    location: "Remote, USA",
    description: "Build beautiful React apps. TypeScript required. 5+ years experience.",
    jobType: "full_time",
    experienceLevel: "senior",
    skillsRequired: ["React", "TypeScript", "Next.js"],
    details: {
      responsibilities: ["Ship features", "Mentor juniors"],
      requirements: ["5+ years React", "TS"],
      qualifications: ["BS in CS or equivalent"],
      benefits: ["Health", "Remote"],
    },
    isRemote: true,
    sourceUrl: "https://example.com/jobs/42",
    salaryMin: "150000",
    salaryMax: "220000",
    salaryCurrency: "USD",
  };
}

function seedResumeRow(overrides: Record<string, any> = {}): any {
  const content: ResumeContent = ResumeContentSchema.parse({
    basics: {
      name: "Jane Doe",
      email: "jane@example.com",
      label: "Senior Frontend Engineer",
      summary: "Senior frontend engineer with 8 years building React apps.",
    },
    work: [
      {
        name: "Acme",
        position: "Senior Engineer",
        startDate: "2022-01",
        endDate: "Present",
        highlights: [
          "Shipped a Next.js redesign that cut LCP from 4.2s to 1.8s.",
          "Led migration from Redux to Zustand, dropping bundle by 18%.",
        ],
      },
      {
        name: "TechStart",
        position: "Frontend Engineer",
        startDate: "2018-06",
        endDate: "2021-12",
        highlights: ["Built the mobile web experience from scratch."],
      },
    ],
    education: [
      { institution: "Stanford", area: "Computer Science", studyType: "BS", startDate: "2014", endDate: "2018" },
    ],
    skills: [{ name: "Frontend", keywords: ["React", "TypeScript", "Next.js"] }],
  });
  return {
    id: RESUME_ID,
    userId: USER_ID,
    title: "Jane Doe — Frontend",
    content,
    isActive: true,
    isMaster: true,
    parentId: null,
    ...overrides,
  };
}

function tailoredFromSeed(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return ResumeContentSchema.parse({
    ...seedResumeRow().content,
    ...overrides,
  });
}

function buildDeps(opts: {
  llm?: LLMClient | null;
  resumes?: any[];
  jobs?: any[];
} = {}): MatchDeps & { _state: any; _calls: any[] } {
  const fake = buildFakeDb({
    resume_information: opts.resumes ?? [],
    job_items: opts.jobs ?? [],
    resume_match_scores: [],
  });
  return {
    db: fake.db,
    now: () => new Date("2026-04-23T00:00:00Z"),
    llm: opts.llm === undefined ? null : opts.llm,
    _state: fake.state,
    _calls: fake.calls,
  } as any;
}

/** Fake LLM that scripts one payload per call and records prompts. */
function makeFakeLLM(
  impls: Array<(userMessage: string) => unknown> | ((userMessage: string) => unknown),
): { client: LLMClient; calls: Array<{ systemPrompt: string; userMessage: string }> } {
  const calls: Array<{ systemPrompt: string; userMessage: string }> = [];
  const scripts = Array.isArray(impls) ? impls : [impls];
  let idx = 0;
  const client: LLMClient = {
    async callJson(options, schema) {
      calls.push({ systemPrompt: options.systemPrompt, userMessage: options.userMessage });
      const script = scripts[Math.min(idx++, scripts.length - 1)];
      const raw = script(options.userMessage);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`Fake LLM returned schema-invalid: ${parsed.error.message}`);
      return {
        data: parsed.data,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, model: "fake/test-model" },
      };
    },
    async callText() {
      throw new Error("callText unused in tailor tests");
    },
  };
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("validateTailorOutput", () => {
  it("accepts a tailored resume that preserves every work and education entry", () => {
    const input = seedResumeRow().content as ResumeContent;
    const output = tailoredFromSeed({
      basics: { ...input.basics, summary: "Rewrote for TS emphasis." },
    });
    const result = validateTailorOutput(input, output);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("flags dropped work entries", () => {
    const input = seedResumeRow().content as ResumeContent;
    const output = ResumeContentSchema.parse({
      ...input,
      work: [input.work[0]], // dropped TechStart
    });
    const result = validateTailorOutput(input, output);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingWorkEntries, ["TechStart"]);
  });

  it("flags dropped education entries", () => {
    const input = seedResumeRow().content as ResumeContent;
    const output = ResumeContentSchema.parse({ ...input, education: [] });
    const result = validateTailorOutput(input, output);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingEducationInstitutions, ["Stanford"]);
  });

  it("rejects schema-invalid output with a readable error", () => {
    const input = seedResumeRow().content as ResumeContent;
    const result = validateTailorOutput(input, { basics: "not an object" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].startsWith("Schema validation failed"));
  });
});

describe("buildTailorPrompt / strengthenPrompt", () => {
  it("embeds the job + resume as pretty-printed JSON tagged for match_tailor", () => {
    const resume = seedResumeRow().content as ResumeContent;
    const prompt = buildTailorPrompt({
      job: { title: "SWE", description: "React work", confidence: "high" },
      resume,
    });
    assert.equal(prompt.useCase, "match_tailor");
    assert.equal(prompt.responseFormat, "json_object");
    assert.match(prompt.userMessage, /"title":\s*"SWE"/);
    assert.match(prompt.userMessage, /"name":\s*"Jane Doe"/);
  });

  it("passes prior recommendations into the prompt when provided", () => {
    const resume = seedResumeRow().content as ResumeContent;
    const prompt = buildTailorPrompt({
      job: { title: "SWE", description: "x", confidence: "high" },
      resume,
      priorRecommendations: "- salary-negotiation bullet",
    });
    assert.match(prompt.userMessage, /PRIOR ANALYSIS/);
    assert.match(prompt.userMessage, /salary-negotiation/);
  });

  it("strengthenPrompt appends missing-entry callouts", () => {
    const base = buildTailorPrompt({
      job: { title: "SWE", description: "x", confidence: "high" },
      resume: seedResumeRow().content as ResumeContent,
    });
    const strengthened = strengthenPrompt(base, {
      valid: false,
      errors: ["Missing work entry: TechStart"],
      missingWorkEntries: ["TechStart"],
      missingEducationInstitutions: [],
    });
    assert.match(strengthened.userMessage, /VALIDATION FAILURE/);
    assert.match(strengthened.userMessage, /"TechStart"/);
  });
});

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

describe("resolveJobV2 / resolveResumeV2", () => {
  it("resolveJobV2 returns the structured ParsedJob from job_items.details", async () => {
    const deps = buildDeps({ jobs: [seedJobRow()] });
    const resolved = await resolveJobV2(deps, { jobId: JOB_ID });
    assert.ok(resolved);
    assert.equal(resolved!.parsedJob.title, "Senior Frontend Engineer");
    assert.deepEqual(resolved!.parsedJob.responsibilities, ["Ship features", "Mentor juniors"]);
    assert.equal(resolved!.sourceUrl, "https://example.com/jobs/42");
  });

  it("resolveJobV2 returns null when the row is missing", async () => {
    const deps = buildDeps({ jobs: [] });
    const resolved = await resolveJobV2(deps, { jobId: randomUUID() });
    assert.equal(resolved, null);
  });

  it("resolveResumeV2 returns the structured ResumeContent for the owner", async () => {
    const deps = buildDeps({ resumes: [seedResumeRow()] });
    const resolved = await resolveResumeV2(deps, USER_ID, RESUME_ID);
    assert.ok(resolved);
    assert.equal(resolved!.content.basics.name, "Jane Doe");
    assert.equal(resolved!.content.work.length, 2);
  });
});

// ---------------------------------------------------------------------------
// handleTailor — happy path + error paths
// ---------------------------------------------------------------------------

describe("handleTailor — happy path", () => {
  it("returns the tailored resume, scores, changes, and persists a variation", async () => {
    const tailored = tailoredFromSeed({
      basics: {
        ...seedResumeRow().content.basics,
        summary: "TypeScript-forward senior engineer focused on React/Next.js perf.",
      },
    });
    const { client, calls } = makeFakeLLM(() => ({
      oldScore: 60,
      newScore: 85,
      tailoredResume: tailored,
      changes: [
        { section: "basics", before: "Senior frontend engineer", after: "TypeScript-forward senior engineer", why: "Lead with TS" },
      ],
      summaryRecommendations: "- Rewrote summary for TypeScript emphasis",
    }));

    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });

    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 200);
    const data = (res.body as any).data;

    assert.equal(data.oldScore, 60);
    assert.equal(data.newScore, 85);
    assert.equal(data.resumeId, RESUME_ID);
    assert.equal(data.sourceUrl, "https://example.com/jobs/42");

    // Tailored resume JSON is echoed back in full
    assert.equal(data.tailoredResume.basics.name, "Jane Doe");
    assert.equal(data.tailoredResume.work.length, 2);
    assert.equal(data.changes.length, 1);
    assert.match(data.summaryRecommendations, /TypeScript/);

    // Variation is persisted server-side and returned
    assert.ok(data.variationId, "variationId must be present");
    assert.equal(data.variationTitle, "Senior Frontend Engineer - GlobalCo");

    // No markdown anywhere in the response
    assert.equal(typeof data.markdownResume, "undefined");

    // Exactly one LLM call — no parallel legacy path any more
    assert.equal(calls.length, 1);

    // DB saw an insert for the new variation
    const insertedVariations = (deps as any)._calls.filter(
      (c: any) => c.kind === "insert" && c.table === "resume_information",
    );
    assert.equal(insertedVariations.length, 1);
  });

  it("retries with a strengthened prompt when work entries are dropped, then succeeds", async () => {
    const good = tailoredFromSeed();
    const dropped = ResumeContentSchema.parse({ ...good, work: [good.work[0]] });

    const { client, calls } = makeFakeLLM([
      () => ({
        oldScore: 50,
        newScore: 70,
        tailoredResume: dropped,
        changes: [],
        summaryRecommendations: "- first attempt dropped TechStart",
      }),
      () => ({
        oldScore: 50,
        newScore: 80,
        tailoredResume: good,
        changes: [],
        summaryRecommendations: "- restored TechStart",
      }),
    ]);

    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[1].userMessage, /VALIDATION FAILURE/);
    assert.match(calls[1].userMessage, /"TechStart"/);
  });

  it("returns 400 VALIDATION_ERROR when the LLM fails validation after every retry", async () => {
    const good = tailoredFromSeed();
    const dropped = ResumeContentSchema.parse({ ...good, work: [good.work[0]] });
    const { client, calls } = makeFakeLLM(() => ({
      oldScore: 50,
      newScore: 70,
      tailoredResume: dropped,
      changes: [],
      summaryRecommendations: "- dropped TechStart",
    }));

    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 400);
    const body = res.body as any;
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(body.error.details.missingWorkEntries, ["TechStart"]);
    assert.equal(calls.length, 2);
  });

  it("returns 503 AI_ERROR when no LLM client is configured", async () => {
    const deps = buildDeps({
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 503);
    assert.equal((res.body as any).error.code, "AI_ERROR");
  });

  it("returns 404 NOT_FOUND when the job does not exist", async () => {
    const { client } = makeFakeLLM(() => ({ oldScore: 0, newScore: 0, tailoredResume: tailoredFromSeed(), changes: [], summaryRecommendations: "" }));
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [],
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 404);
  });

  it("returns 404 NOT_FOUND when the resume does not exist", async () => {
    const { client } = makeFakeLLM(() => ({ oldScore: 0, newScore: 0, tailoredResume: tailoredFromSeed(), changes: [], summaryRecommendations: "" }));
    const deps = buildDeps({
      llm: client,
      resumes: [],
      jobs: [seedJobRow()],
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 404);
  });

  it("accepts jobHtml when no jobId is provided (synthesized ParsedJob)", async () => {
    const { client, calls } = makeFakeLLM(() => ({
      oldScore: 40,
      newScore: 70,
      tailoredResume: tailoredFromSeed(),
      changes: [],
      summaryRecommendations: "- tailored for the pasted description",
    }));
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [],
    });
    const res = await handleTailor(deps, USER_ID, {
      jobHtml: "<h1>Platform Engineer</h1><p>Kubernetes, Go.</p>",
      resumeId: RESUME_ID,
    });
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(data.variationTitle, "Untitled Job");
    // jobHtml → no sourceUrl (unlike persisted jobs)
    assert.equal(data.sourceUrl, undefined);
    assert.match(calls[0].userMessage, /"Untitled Job"/);
  });

  it("returns 401 when viewerId is null", async () => {
    const deps = buildDeps({ resumes: [seedResumeRow()], jobs: [seedJobRow()] });
    const res = await handleTailor(deps, null, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
// Response schema sanity — TailorResponseSchema no longer includes
// markdownResume. This test pins the contract so any future drift that
// re-introduces a markdown field blows up loudly.
// ---------------------------------------------------------------------------

describe("TailorResponseSchema", () => {
  it("has no markdownResume field", () => {
    const shape = TailorResponseSchema.shape as Record<string, unknown>;
    assert.equal("markdownResume" in shape, false, "markdownResume must not be in the schema");
    for (const required of ["oldScore", "newScore", "tailoredResume", "changes", "summaryRecommendations"]) {
      assert.equal(required in shape, true, `${required} must be in the schema`);
    }
  });
});
