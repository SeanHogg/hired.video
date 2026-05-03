import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getApiKey } from "../services/adapters/ai.js";
import { aiCall } from "../services/adapters/ai-call.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import {
  extractSkills,
  mergeExtractedSkillsIntoResume,
  type ExtractResponse,
} from "../services/resume/skills.js";
import { buildRepos } from "../repositories/index.js";
import { getDb } from "../db/index.js";
import { listResolvableItems } from "../../../shared/skill-evidence.js";
import type { ResumeContent, SkillEvidence } from "../../../shared/resume.js";

export const skillExtractorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
skillExtractorRoutes.use("*", attachTokenBudget());

const ExtractRequestSchema = z.object({
  content: z.string().min(10).max(50000),
  sourceType: z.enum(["job", "resume"]).optional(),
  /** When the source is one of the user's saved resumes, the route fetches
   *  it and passes its section items as evidence-binding context to the LLM
   *  so the response carries `evidence` rows the caller can persist alongside
   *  the skills. Without this, the model has nothing to bind evidenceLabels
   *  to and the caller can't answer "where used X?". */
  resumeId: z.string().uuid().optional(),
});

skillExtractorRoutes.post("/extract", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "content is required (10–50 000 chars)",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const sourceType = parsed.data.sourceType ?? "resume";
  const apiKey = getApiKey(c.env);

  // Resolve resume items — only when the caller asserts a resume source AND
  // hands us the resumeId. Owner check matters: a recruiter running the
  // extractor against a candidate's text shouldn't be able to enumerate
  // section ids by guessing UUIDs.
  let resumeContent: ResumeContent | null = null;
  if (sourceType === "resume" && parsed.data.resumeId) {
    const userId = (c.var.user?.sub as string | undefined) ?? null;
    if (userId) {
      const repos = buildRepos(getDb());
      const row = await repos.resumes.findByIdForOwner(parsed.data.resumeId, userId);
      if (row?.content) {
        resumeContent = row.content as ResumeContent;
      }
    }
  }

  const items = resumeContent ? listResolvableItems(resumeContent) : undefined;

  const result = await aiCall(c, "skill_extractor", () =>
    extractSkills(apiKey ?? null, parsed.data.content, sourceType, items),
  );
  if (result instanceof Response) return result; // 429 — over budget

  // For resume-with-content calls, resolve evidenceLabels to UUIDs and
  // emit `evidence` rows alongside the skills. The caller can persist
  // these in a single resume PUT — no second round-trip required.
  let evidence: SkillEvidence[] | undefined;
  if (resumeContent) {
    const merged = mergeExtractedSkillsIntoResume(
      resumeContent.skills ?? [],
      result.data.skills,
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
    ...result.data,
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
