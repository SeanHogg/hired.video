/**
 * Unit + integration tests for the JSON-preserving tailor pipeline.
 *
 * Covers:
 *   • resolveJobV2 / resolveResumeV2 return structured JSON (no flattening)
 *   • validateTailorOutput — schema + work/education preservation
 *   • buildTailorPrompt / strengthenPrompt shape
 *   • handleTailorJson — happy path, retry on validation failure, failure after retries
 *   • handleTailor facade — parallel execution, env-flag routing,
 *     comparison logging, degraded fallback when one path fails
 *
 * Runs under node:test with a fake LLM + fake DB.
 *
 * Run:
 *   node --import tsx --test src/routes/__tests__/match-handlers-tailor-json.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleTailor,
  handleTailorJson,
  resolveJobV2,
  resolveResumeV2,
  validateTailorOutput,
  buildTailorPrompt,
  strengthenPrompt,
  TailorResponseSchemaV2,
  type TailorComparisonLog,
  type MatchDeps,
} from "../match-handlers.js";
import type { LLMClient } from "../../services/llm-client.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import { renderMarkdownFromJsonResume } from "../../../../shared/resume-markdown.js";
import type { ParsedJob } from "../../services/job.js";

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

function seedResumeRow(): any {
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
  };
}

function buildDeps(opts: {
  llm?: LLMClient | null;
  resumes?: any[];
  jobs?: any[];
  tailorJsonEnabled?: boolean;
  logSpy?: (entry: TailorComparisonLog) => void;
} = {}): MatchDeps & { _state: any; _calls: any[] } {
  const fake = buildFakeDb({
    resume_information: opts.resumes ?? [],
    job_items: opts.jobs ?? [],
    resume_match_scores: [],
  });
  return {
    db: fake.db,
    now: () => new Date("2026-04-21T00:00:00Z"),
    llm: opts.llm === undefined ? null : opts.llm,
    tailorJsonEnabled: opts.tailorJsonEnabled,
    logTailor: opts.logSpy,
    _state: fake.state,
    _calls: fake.calls,
  } as any;
}

/** Fake LLM that returns a scripted payload per call and records prompts. */
function makeFakeLLM(
  impls: Array<(userMessage: string) => unknown> | ((userMessage: string) => unknown),
  opts: { throwNth?: number[] } = {},
): { client: LLMClient; calls: Array<{ systemPrompt: string; userMessage: string; temperature?: number }> } {
  const calls: Array<{ systemPrompt: string; userMessage: string; temperature?: number }> = [];
  const scripts = Array.isArray(impls) ? impls : [impls];
  let idx = 0;
  const throwOn = new Set(opts.throwNth ?? []);
  const client: LLMClient = {
    async callJson(options, schema) {
      calls.push({
        systemPrompt: options.systemPrompt,
        userMessage: options.userMessage,
        temperature: options.temperature,
      });
      const callIdx = idx;
      idx++;
      if (throwOn.has(callIdx)) throw new Error(`Simulated LLM failure on call ${callIdx}`);
      const script = scripts[Math.min(callIdx, scripts.length - 1)];
      const data = script(options.userMessage);
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new Error(`Fake LLM returned schema-invalid data: ${parsed.error.message}`);
      }
      return {
        data: parsed.data as any,
        usage: {
          promptTokens: Math.ceil(options.userMessage.length / 4),
          completionTokens: 200,
          totalTokens: Math.ceil(options.userMessage.length / 4) + 200,
          model: "fake/test-model",
        },
      };
    },
    async callText() {
      throw new Error("callText not used");
    },
  };
  return { client, calls };
}

/** Build a fully-valid `tailoredResume` that preserves the seed resume's entries. */
function tailoredFromSeed(): ResumeContent {
  return ResumeContentSchema.parse({
    basics: {
      name: "Jane Doe",
      email: "jane@example.com",
      label: "Senior Frontend Engineer",
      summary: "TypeScript-first senior frontend engineer with 8 years shipping React apps at scale.",
    },
    work: [
      {
        name: "Acme",
        position: "Senior Engineer",
        startDate: "2022-01",
        endDate: "Present",
        highlights: [
          "Led Next.js redesign (TypeScript) cutting LCP from 4.2s to 1.8s.",
          "Migrated state layer to Zustand, dropping bundle by 18%.",
        ],
      },
      {
        name: "TechStart",
        position: "Frontend Engineer",
        startDate: "2018-06",
        endDate: "2021-12",
        highlights: ["Built the mobile web experience in React + TypeScript from scratch."],
      },
    ],
    education: [
      { institution: "Stanford", area: "Computer Science", studyType: "BS", startDate: "2014", endDate: "2018" },
    ],
    skills: [{ name: "Frontend", keywords: ["React", "TypeScript", "Next.js", "GraphQL"] }],
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — resolveJobV2 / resolveResumeV2
// ---------------------------------------------------------------------------

describe("resolveJobV2 — JSON preservation", () => {
  it("returns ParsedJob directly from job_items.details (no flattening)", async () => {
    const deps = buildDeps({ jobs: [seedJobRow()] });
    const resolved = await resolveJobV2(deps, { jobId: JOB_ID });
    assert.ok(resolved, "should resolve");
    assert.equal(resolved!.jobId, JOB_ID);
    assert.equal(resolved!.sourceUrl, "https://example.com/jobs/42");

    const pj = resolved!.parsedJob;
    assert.equal(pj.title, "Senior Frontend Engineer");
    assert.equal(pj.company, "GlobalCo");
    assert.deepEqual(pj.responsibilities, ["Ship features", "Mentor juniors"]);
    assert.deepEqual(pj.requirements, ["5+ years React", "TS"]);
    assert.deepEqual(pj.qualifications, ["BS in CS or equivalent"]);
    assert.deepEqual(pj.benefits, ["Health", "Remote"]);
    assert.deepEqual(pj.skills, ["React", "TypeScript", "Next.js"]);
    assert.equal(pj.salaryMin, 150000);
    assert.equal(pj.salaryMax, 220000);
    assert.equal(pj.isRemote, true);
  });

  it("returns null when the job id is unknown", async () => {
    const deps = buildDeps({ jobs: [seedJobRow()] });
    const resolved = await resolveJobV2(deps, { jobId: randomUUID() });
    assert.equal(resolved, null);
  });
});

describe("resolveResumeV2 — JSON preservation", () => {
  it("returns ResumeContent directly from resume_information.content (no flattening)", async () => {
    const deps = buildDeps({ resumes: [seedResumeRow()] });
    const resolved = await resolveResumeV2(deps, USER_ID, RESUME_ID);
    assert.ok(resolved, "should resolve");
    assert.equal(resolved!.id, RESUME_ID);
    // work[] structure preserved; not a concatenated string
    assert.equal(resolved!.content.work.length, 2);
    assert.equal(resolved!.content.work[0].name, "Acme");
    assert.equal(resolved!.content.work[1].name, "TechStart");
    assert.equal(resolved!.content.education[0].institution, "Stanford");
    assert.deepEqual(resolved!.content.skills[0].keywords, ["React", "TypeScript", "Next.js"]);
  });

  it("auto-picks active resume when resumeId is omitted", async () => {
    const deps = buildDeps({
      resumes: [
        { ...seedResumeRow(), isActive: false, isMaster: false, id: randomUUID() },
        seedResumeRow(),
      ],
    });
    const resolved = await resolveResumeV2(deps, USER_ID);
    assert.ok(resolved);
    assert.equal(resolved!.id, RESUME_ID);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — validateTailorOutput
// ---------------------------------------------------------------------------

describe("validateTailorOutput", () => {
  it("passes valid output that preserves every work + education entry", () => {
    const input = seedResumeRow().content as ResumeContent;
    const res = validateTailorOutput(input, tailoredFromSeed());
    assert.equal(res.valid, true, JSON.stringify(res.errors));
    assert.equal(res.errors.length, 0);
    assert.deepEqual(res.missingWorkEntries, []);
    assert.deepEqual(res.missingEducationInstitutions, []);
  });

  it("catches a missing work entry", () => {
    const input = seedResumeRow().content as ResumeContent;
    const mutated = tailoredFromSeed();
    // Drop TechStart
    mutated.work = mutated.work.filter((w) => w.name !== "TechStart");
    const res = validateTailorOutput(input, mutated);
    assert.equal(res.valid, false);
    assert.ok(res.missingWorkEntries.includes("TechStart"));
    assert.ok(res.errors.some((e) => /TechStart/.test(e)));
  });

  it("catches a missing education entry", () => {
    const input = seedResumeRow().content as ResumeContent;
    const mutated = tailoredFromSeed();
    mutated.education = [];
    const res = validateTailorOutput(input, mutated);
    assert.equal(res.valid, false);
    assert.ok(res.missingEducationInstitutions.includes("Stanford"));
  });

  it("flags schema-invalid output", () => {
    const input = seedResumeRow().content as ResumeContent;
    const res = validateTailorOutput(input, { work: "not an array" } as any);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /Schema validation failed/.test(e)));
  });

  it("is case- and whitespace-insensitive on company matching", () => {
    const input = seedResumeRow().content as ResumeContent;
    const mutated = tailoredFromSeed();
    mutated.work[0].name = "acme  "; // lowercase + trailing whitespace
    const res = validateTailorOutput(input, mutated);
    assert.equal(res.valid, true);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — buildTailorPrompt / strengthenPrompt
// ---------------------------------------------------------------------------

describe("buildTailorPrompt", () => {
  it("serialises job and resume as JSON in the user message", () => {
    const job: ParsedJob = {
      title: "Senior Frontend Engineer",
      description: "Build apps",
      skills: ["React"],
      confidence: "high",
    };
    const resume = seedResumeRow().content as ResumeContent;
    const prompt = buildTailorPrompt({ job, resume });

    assert.equal(prompt.responseFormat, "json_object");
    assert.equal(prompt.temperature, 0.2);
    // JSON input, not flat text
    assert.match(prompt.userMessage, /"title": "Senior Frontend Engineer"/);
    assert.match(prompt.userMessage, /"name": "Acme"/);
    // Output schema mentioned in system prompt
    assert.match(prompt.systemPrompt, /tailoredResume/);
    assert.match(prompt.systemPrompt, /changes/);
    assert.match(prompt.systemPrompt, /Preserve ALL work experiences/);
  });

  it("embeds prior recommendations when provided", () => {
    const prompt = buildTailorPrompt({
      job: { title: "x", description: "y", confidence: "high" },
      resume: seedResumeRow().content,
      priorRecommendations: "Highlight TypeScript",
    });
    assert.match(prompt.userMessage, /PRIOR ANALYSIS/);
    assert.match(prompt.userMessage, /Highlight TypeScript/);
  });
});

describe("strengthenPrompt", () => {
  it("appends validation errors and an explicit preservation directive", () => {
    const base = buildTailorPrompt({
      job: { title: "x", description: "y", confidence: "high" },
      resume: seedResumeRow().content,
    });
    const strengthened = strengthenPrompt(base, {
      valid: false,
      errors: ["Missing work entry: TechStart"],
      missingWorkEntries: ["TechStart"],
      missingEducationInstitutions: [],
    });
    assert.match(strengthened.userMessage, /VALIDATION FAILURE/);
    assert.match(strengthened.userMessage, /TechStart/);
    assert.match(strengthened.userMessage, /You MUST include the following work entries/);
    // System prompt + temperature untouched
    assert.equal(strengthened.systemPrompt, base.systemPrompt);
    assert.equal(strengthened.temperature, base.temperature);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — handleTailorJson — retry + validation
// ---------------------------------------------------------------------------

describe("handleTailorJson", () => {
  it("returns tailoredResume + changes on the happy path", async () => {
    const { client, calls } = makeFakeLLM(() => ({
      oldScore: 55,
      newScore: 82,
      markdownResume: "ignored — server re-renders",
      tailoredResume: tailoredFromSeed(),
      changes: [
        {
          section: "work",
          before: "Led migration from Redux to Zustand",
          after: "Led TypeScript migration from Redux to Zustand",
          why: "Highlight TypeScript per job requirement",
        },
      ],
      summaryRecommendations: "- TypeScript front and center\n- React keywords added",
    }));
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const result = await handleTailorJson(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(result.handler.status, 200);
    const body = result.handler.body as any;
    assert.equal(body.success, true);
    assert.equal(body.data.tailoredResume.work.length, 2);
    assert.equal(body.data.changes.length, 1);
    assert.match(body.data.markdownResume, /Jane Doe/);
    // Server re-renders markdown from JSON — should not carry the LLM placeholder text
    assert.doesNotMatch(body.data.markdownResume, /ignored — server re-renders/);
    assert.equal(result.metrics.validationPassed, true);
    assert.equal(result.metrics.attempts, 1);
    assert.equal(calls.length, 1);
  });

  it("retries with a strengthened prompt when the first attempt drops a work entry", async () => {
    const dropping = () => {
      const tailored = tailoredFromSeed();
      tailored.work = tailored.work.filter((w) => w.name !== "TechStart");
      return {
        oldScore: 50,
        newScore: 70,
        markdownResume: "x",
        tailoredResume: tailored,
        changes: [],
        summaryRecommendations: "- fixed",
      };
    };
    const valid = () => ({
      oldScore: 55,
      newScore: 80,
      markdownResume: "x",
      tailoredResume: tailoredFromSeed(),
      changes: [],
      summaryRecommendations: "- ok now",
    });
    const { client, calls } = makeFakeLLM([dropping, valid]);
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const result = await handleTailorJson(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(result.handler.status, 200);
    assert.equal(calls.length, 2);
    // Retry prompt carries the missing-entry directive
    assert.match(calls[1].userMessage, /TechStart/);
    assert.match(calls[1].userMessage, /VALIDATION FAILURE/);
    assert.equal(result.metrics.attempts, 2);
    assert.equal(result.metrics.validationPassed, true);
  });

  it("returns 400 VALIDATION_ERROR after the retry still fails", async () => {
    const dropping = () => {
      const tailored = tailoredFromSeed();
      tailored.work = tailored.work.filter((w) => w.name !== "TechStart");
      return {
        oldScore: 50,
        newScore: 70,
        markdownResume: "x",
        tailoredResume: tailored,
        changes: [],
        summaryRecommendations: "- nope",
      };
    };
    const { client, calls } = makeFakeLLM([dropping, dropping]);
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const result = await handleTailorJson(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(result.handler.status, 400);
    const body = result.handler.body as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details?.missingWorkEntries.includes("TechStart"));
    assert.equal(calls.length, 2);
    assert.equal(result.metrics.attempts, 2);
    assert.equal(result.metrics.validationPassed, false);
  });

  it("returns 503 when no LLM is configured", async () => {
    const deps = buildDeps({
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
    });
    const result = await handleTailorJson(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(result.handler.status, 503);
  });

  it("returns 404 when the job does not exist", async () => {
    const { client } = makeFakeLLM(() => ({ oldScore: 0, newScore: 0, markdownResume: "", tailoredResume: tailoredFromSeed(), changes: [], summaryRecommendations: "" }));
    const deps = buildDeps({ llm: client, resumes: [seedResumeRow()] });
    const result = await handleTailorJson(deps, USER_ID, { jobId: randomUUID(), resumeId: RESUME_ID });
    assert.equal(result.handler.status, 404);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — handleTailor facade
// ---------------------------------------------------------------------------

describe("handleTailor facade — env-flag routing + logging", () => {
  it("RESUME_TAILOR=false returns the legacy path result with markdownResume", async () => {
    const { client } = makeFakeLLM([
      // First call is legacy (uses flat TailorResponseSchema)
      () => ({
        oldScore: 60,
        newScore: 82,
        markdownResume: "# Jane Doe\n\n## Summary\nSenior React engineer.",
        summaryRecommendations: "- did stuff",
      }),
      // Second call is JSON (uses TailorResponseSchemaV2)
      () => ({
        oldScore: 65,
        newScore: 85,
        markdownResume: "irrelevant",
        tailoredResume: tailoredFromSeed(),
        changes: [],
        summaryRecommendations: "- json ok",
      }),
    ]);
    const logs: TailorComparisonLog[] = [];
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
      tailorJsonEnabled: false,
      logSpy: (entry) => logs.push(entry),
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 200);
    const body = res.body as any;
    assert.equal(body.data.processingPath, "legacy");
    assert.match(body.data.markdownResume, /Jane Doe/);
    // Legacy path never exposes tailoredResume
    assert.equal(body.data.tailoredResume, undefined);

    // Comparison log fired
    assert.equal(logs.length, 1);
    assert.equal(logs[0].selectedPath, "legacy");
    assert.equal(logs[0].envFlag, false);
    assert.equal(logs[0].legacy.success, true);
    assert.equal(logs[0].json.success, true);
    assert.equal(logs[0].json.validationPassed, true);
  });

  it("RESUME_TAILOR=true returns the JSON path result with tailoredResume + changes", async () => {
    const { client, calls } = makeFakeLLM([
      () => ({
        oldScore: 60,
        newScore: 80,
        markdownResume: "legacy markdown",
        summaryRecommendations: "- legacy",
      }),
      () => ({
        oldScore: 65,
        newScore: 88,
        markdownResume: "irrelevant",
        tailoredResume: tailoredFromSeed(),
        changes: [
          { section: "skills", before: "React", after: "React, TypeScript", why: "keyword" },
        ],
        summaryRecommendations: "- json win",
      }),
    ]);
    const logs: TailorComparisonLog[] = [];
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
      tailorJsonEnabled: true,
      logSpy: (entry) => logs.push(entry),
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    assert.equal(res.status, 200);
    const body = res.body as any;
    assert.equal(body.data.processingPath, "json");
    assert.ok(body.data.tailoredResume, "tailoredResume must be present");
    assert.equal(body.data.tailoredResume.work.length, 2);
    assert.equal(body.data.changes.length, 1);
    // Both paths were called
    assert.equal(calls.length, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].selectedPath, "json");
    assert.equal(logs[0].envFlag, true);
  });

  it("runs both paths in parallel and logs metrics for each regardless of flag", async () => {
    // Both sub-handlers race each other, so the fake LLM branches on
    // the SYSTEM PROMPT (legacy flat-text vs JSON-preserving) instead
    // of call ordering.
    const client: LLMClient = {
      async callJson(options, schema) {
        const isJson = /tailoredResume/i.test(options.systemPrompt);
        // Each path sleeps 100ms. If the facade runs them in parallel
        // the total wall time is ~100ms; serial would be ~200ms.
        await new Promise((r) => setTimeout(r, 100));
        const payload = isJson
          ? {
              oldScore: 10,
              newScore: 40,
              markdownResume: "from-json",
              tailoredResume: tailoredFromSeed(),
              changes: [],
              summaryRecommendations: "-",
            }
          : {
              oldScore: 10,
              newScore: 40,
              markdownResume: "from-legacy",
              summaryRecommendations: "-",
            };
        const parsed = schema.safeParse(payload);
        if (!parsed.success) throw new Error(parsed.error.message);
        return {
          data: parsed.data as any,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "fake" },
        };
      },
      async callText() {
        throw new Error("unused");
      },
    };
    const start = Date.now();
    const logs: TailorComparisonLog[] = [];
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
      tailorJsonEnabled: false,
      logSpy: (entry) => logs.push(entry),
    });
    await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    const elapsed = Date.now() - start;
    // If parallel: ~100ms; if serial: ~200ms. We assert the elapsed
    // time is under 150ms (1.5×) — enough headroom for CI jitter while
    // still catching a regression to sequential execution.
    assert.ok(elapsed < 180, `expected <180ms for parallel execution, got ${elapsed}ms`);
    assert.equal(logs.length, 1);
    assert.ok(logs[0].legacy.success, `legacy.success should be true; error=${logs[0].legacy.error}`);
    assert.ok(logs[0].json.success, `json.success should be true; error=${logs[0].json.error}`);
  });

  it("falls back to the other path when the selected path fails", async () => {
    // JSON path fails validation; RESUME_TAILOR=true → facade should
    // return the legacy response instead.
    const dropping = () => {
      const t = tailoredFromSeed();
      t.work = [];
      return {
        oldScore: 0,
        newScore: 0,
        markdownResume: "x",
        tailoredResume: t,
        changes: [],
        summaryRecommendations: "-",
      };
    };
    const legacyOk = () => ({
      oldScore: 60,
      newScore: 82,
      markdownResume: "# Jane Doe\nLegacy saved the day.",
      summaryRecommendations: "-",
    });
    // Note: both tailor sub-handlers run in parallel, so the LLM sees
    // both prompts; whichever reaches it first gets call #0. We
    // branch on the prompt body instead of call order.
    const client: LLMClient = {
      async callJson(options, schema) {
        const isJson = /tailoredResume/i.test(options.systemPrompt);
        const data = isJson ? dropping() : legacyOk();
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new Error("schema fail: " + parsed.error.message);
        return {
          data: parsed.data as any,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "fake" },
        };
      },
      async callText() {
        throw new Error("unused");
      },
    };
    const logs: TailorComparisonLog[] = [];
    const deps = buildDeps({
      llm: client,
      resumes: [seedResumeRow()],
      jobs: [seedJobRow()],
      tailorJsonEnabled: true,
      logSpy: (entry) => logs.push(entry),
    });
    const res = await handleTailor(deps, USER_ID, { jobId: JOB_ID, resumeId: RESUME_ID });
    // JSON path failed; facade fell back to legacy.
    assert.equal(res.status, 200);
    const body = res.body as any;
    assert.equal(body.data.processingPath, "legacy");
    assert.match(body.data.markdownResume, /Legacy saved the day/);
    // Log records both outcomes for visibility
    assert.equal(logs.length, 1);
    assert.equal(logs[0].json.validationPassed, false);
    assert.equal(logs[0].legacy.success, true);
  });

  it("401s anonymous callers before running either path", async () => {
    const deps = buildDeps({ resumes: [seedResumeRow()], jobs: [seedJobRow()] });
    const res = await handleTailor(deps, null, { jobId: JOB_ID });
    assert.equal(res.status, 401);
  });

  it("400s on malformed body", async () => {
    const deps = buildDeps({ resumes: [seedResumeRow()], jobs: [seedJobRow()] });
    const res = await handleTailor(deps, USER_ID, {});
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// TailorResponseSchemaV2 sanity — make sure downstream types stay aligned
// ---------------------------------------------------------------------------

describe("renderMarkdownFromJsonResume", () => {
  it("renders a recognisable markdown resume from a JSON Resume", () => {
    const md = renderMarkdownFromJsonResume(tailoredFromSeed());
    assert.match(md, /^# Jane Doe/);
    assert.match(md, /## Summary/);
    assert.match(md, /## Experience/);
    assert.match(md, /Acme/);
    assert.match(md, /TechStart/);
    assert.match(md, /## Skills/);
    assert.match(md, /React/);
    assert.match(md, /## Education/);
    assert.match(md, /Stanford/);
  });

  it("is deterministic (calling twice produces the same output)", () => {
    const r = tailoredFromSeed();
    assert.equal(renderMarkdownFromJsonResume(r), renderMarkdownFromJsonResume(r));
  });

  it("gracefully handles empty sections", () => {
    const empty = ResumeContentSchema.parse({});
    const md = renderMarkdownFromJsonResume(empty);
    // Should not throw; empty resume renders an empty string.
    assert.equal(typeof md, "string");
  });
});

describe("TailorResponseSchemaV2", () => {
  it("accepts a full valid payload", () => {
    const payload = {
      oldScore: 60,
      newScore: 82,
      markdownResume: "# Jane",
      tailoredResume: tailoredFromSeed(),
      changes: [
        { section: "work", before: "a", after: "b", why: "because" },
      ],
      summaryRecommendations: "- x",
    };
    const parsed = TailorResponseSchemaV2.safeParse(payload);
    assert.equal(parsed.success, true);
  });

  it("rejects an invalid section enum", () => {
    const payload = {
      oldScore: 60,
      newScore: 82,
      markdownResume: "# Jane",
      tailoredResume: tailoredFromSeed(),
      changes: [{ section: "not-a-section", before: "a", after: "b", why: "x" }],
      summaryRecommendations: "- x",
    };
    const parsed = TailorResponseSchemaV2.safeParse(payload);
    assert.equal(parsed.success, false);
  });
});
