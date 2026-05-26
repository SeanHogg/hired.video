import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import {
  extractSkills,
  mergeExtractedSkillsIntoResume,
  type ExtractResponse,
  type SkillExtractInput,
} from "../services/resume/skills.js";
import { parsedJobFromRow } from "../services/job/match-handlers.js";
import { buildRepos } from "../repositories/index.js";
import { getDb } from "../db/index.js";
import type { ResumeContent, SkillEvidence } from "../../../shared/resume.js";

export const skillExtractorRoutes = new Hono<AppEnv>();
skillExtractorRoutes.use("*", attachTokenBudget());

const ExtractRequestSchema = z
  .object({
    /** Free-form text (paste / file-upload paths). Mutually exclusive in
     *  practice with `resumeId`/`jobId` — when the caller has a saved
     *  entity, they should ship the id, not a JSON-stringified copy. */
    content: z.string().min(10).max(50000).optional(),
    sourceType: z.enum(["job", "resume"]).optional(),
    /** Saved-resume path. Server loads the resume (owner-checked), ships
     *  its `ResumeContent` JSON straight to the LLM, and uses its section
     *  items as evidence-binding context. */
    resumeId: UuidLikeSchema.optional(),
    /** Saved-job path. Server loads the job, projects it to `ParsedJob`,
     *  and ships the JSON to the LLM so it can reason over the
     *  responsibilities/requirements arrays directly instead of a flat
     *  text blob. */
    jobId: UuidLikeSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.content) || Boolean(v.resumeId) || Boolean(v.jobId),
    { message: "content, resumeId, or jobId is required", path: ["content"] },
  );

skillExtractorRoutes.post("/extract", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "content (10–50 000 chars), resumeId, or jobId is required",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const llm = hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
  const userId = (c.var.user?.sub as string | undefined) ?? null;

  // Resolve the input shape. resumeId / jobId take precedence over a
  // client-supplied `content` blob — re-shipping a JSON-stringified
  // resume was the cause of the 50k VALIDATION_ERROR users hit on
  // /Tools/SkillExtractor (2026-05-05). Owner check on resumes blocks a
  // recruiter from enumerating section ids by guessing UUIDs; jobs are
  // visible to anyone signed in (mirrors the public /api/jobs/:id GET).
  let resumeContent: ResumeContent | null = null;
  let extractInput: SkillExtractInput;

  if (parsed.data.resumeId) {
    if (!userId) {
      return c.json(
        {
          success: false as const,
          error: {
            code: "UNAUTHORIZED",
            message: "Sign in to extract from a saved resume",
          },
          timestamp: new Date().toISOString(),
        },
        401,
      );
    }
    const repos = buildRepos(getDb());
    const row = await repos.resumes.findByIdForOwner(parsed.data.resumeId, userId);
    if (!row?.content) {
      return c.json(
        {
          success: false as const,
          error: { code: "NOT_FOUND", message: "Resume not found" },
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }
    resumeContent = row.content as ResumeContent;
    extractInput = { kind: "resume-json", content: resumeContent };
  } else if (parsed.data.jobId) {
    if (!userId) {
      return c.json(
        {
          success: false as const,
          error: {
            code: "UNAUTHORIZED",
            message: "Sign in to extract from a saved job",
          },
          timestamp: new Date().toISOString(),
        },
        401,
      );
    }
    const repos = buildRepos(getDb());
    const row = await repos.jobs.findJobById(parsed.data.jobId);
    if (!row) {
      return c.json(
        {
          success: false as const,
          error: { code: "NOT_FOUND", message: "Job not found" },
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }
    extractInput = {
      kind: "job-json",
      job: parsedJobFromRow(row as unknown as Record<string, unknown>),
    };
  } else {
    extractInput = {
      kind: "text",
      sourceType: parsed.data.sourceType ?? "resume",
      text: parsed.data.content ?? "",
    };
  }

  const result = await extractSkills(llm, extractInput);

  // For resume-json calls, resolve evidenceLabels to UUIDs and emit
  // `evidence` rows alongside the skills. The caller can persist these
  // in a single resume PUT — no second round-trip required.
  let evidence: SkillEvidence[] | undefined;
  if (resumeContent) {
    const merged = mergeExtractedSkillsIntoResume(
      resumeContent.skills ?? [],
      result.skills,
      { content: resumeContent },
    );
    // The merge function returns ALL evidence (existing + new). The
    // visualizer only needs the new bindings here so callers can preview
    // before saving — we slice off the rows that were already on the row.
    const existing = new Set(
      (resumeContent.skillEvidence ?? []).map((e) => e.id),
    );
    evidence = merged.evidence.filter((e) => !existing.has(e.id));
  }

  const response: ExtractResponse & { evidence?: SkillEvidence[] } = {
    ...result,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
  return c.json(success(response), 200);
});

skillExtractorRoutes.all("*", (c) =>
  c.json(
    {
      success: false as const,
      error: { code: "NOT_IMPLEMENTED", message: "Skill extractor route not implemented" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
