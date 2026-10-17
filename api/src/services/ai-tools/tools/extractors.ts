/**
 * skill-extract + template-extract — read a résumé / job into structure.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../../shared/validation.js";
import type { ResumeContent, SkillEvidence } from "../../../../../shared/resume.js";
import { DomainError } from "../../../domains/errors.js";
import { servicesProcessor } from "../../../domains/services-processing/index.js";
import { getDb } from "../../../db/index.js";
import { logger } from "../../../lib/logger.js";
import { buildRepos } from "../../../repositories/index.js";
import { success } from "../../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../adapters/llm-client.js";
import { aiFailure } from "../../adapters/llm-error.js";
import { parsedJobFromRow } from "../../job/match-handlers.js";
import { extractSkills, mergeExtractedSkillsIntoResume, type ExtractResponse, type SkillExtractInput } from "../../resume/skills.js";
import { defineAiTool, failTool } from "../types.js";

/** Saved résumé (owner-checked) or saved job → the structured JSON the
 *  model reasons over; pasted text otherwise. Ids win over a `content`
 *  blob — re-shipping a JSON-stringified résumé blew the 50k cap. */
async function extractInput(
  userId: string,
  input: { content?: string; sourceType?: "job" | "resume"; resumeId?: string; jobId?: string },
): Promise<{ input: SkillExtractInput; resume: ResumeContent | null }> {
  const repos = buildRepos(getDb());
  if (input.resumeId) {
    const row = await repos.resumes.findByIdForOwner(input.resumeId, userId);
    if (!row?.content) throw new DomainError(404, "NOT_FOUND", "Resume not found");
    const content = row.content as ResumeContent;
    return { input: { kind: "resume-json", content }, resume: content };
  }
  if (input.jobId) {
    const row = await repos.jobs.findJobById(input.jobId);
    if (!row) throw new DomainError(404, "NOT_FOUND", "Job not found");
    return { input: { kind: "job-json", job: parsedJobFromRow(row as unknown as Record<string, unknown>) }, resume: null };
  }
  return { input: { kind: "text", sourceType: input.sourceType ?? "resume", text: input.content ?? "" }, resume: null };
}

/** Only the NEW evidence bindings, so callers can preview before saving. */
function newEvidence(resume: ResumeContent, result: ExtractResponse): SkillEvidence[] {
  const merged = mergeExtractedSkillsIntoResume(resume.skills ?? [], result.skills, { content: resume });
  const existing = new Set((resume.skillEvidence ?? []).map((e) => e.id));
  return merged.evidence.filter((e) => !existing.has(e.id));
}

export const skillExtractTool = defineAiTool({
  id: "skill-extract",
  schema: z
    .object({
      content: z.string().min(10).max(50000).optional(),
      sourceType: z.enum(["job", "resume"]).optional(),
      resumeId: UuidLikeSchema.optional(),
      jobId: UuidLikeSchema.optional(),
    })
    .refine((v) => Boolean(v.content) || Boolean(v.resumeId) || Boolean(v.jobId), {
      message: "content, resumeId, or jobId is required",
      path: ["content"],
    }),
  tokenBudget: "none",
  handler: async (c, body) => {
    let resolved: Awaited<ReturnType<typeof extractInput>>;
    try {
      resolved = await extractInput(c.var.user.sub as string, body);
    } catch (err) {
      if (err instanceof DomainError) return failTool(c, err);
      throw err;
    }
    const llm = hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
    let result: ExtractResponse;
    try {
      // Throw-on-error: a configured-but-failed call surfaces AI_* (#726);
      // only the no-key path keeps the heuristic fallback.
      result = await extractSkills(llm, resolved.input, { throwOnError: true });
    } catch (err) {
      return aiFailure(c, err, "[skill-extractor] LLM error");
    }
    const evidence = resolved.resume ? newEvidence(resolved.resume, result) : [];
    return c.json(success({ ...result, ...(evidence.length > 0 ? { evidence } : {}) }), 200);
  },
});

interface ResumeTemplateDescriptor {
  themeKey: string;
  fontKey: string;
  headingKey: string;
  layoutKey: string;
  accentColor: string;
  sections: Array<{ key: string; order: number }>;
  /** dynamic_* rows created for a new combination — empty until the
   *  multimodal extractor (#1770) lands. */
  dynamicRowsCreated: string[];
}

const BASELINE_DESCRIPTOR: ResumeTemplateDescriptor = {
  themeKey: "default",
  fontKey: "inter",
  headingKey: "sans-bold",
  layoutKey: "single-column-ats",
  accentColor: "#4F46E5",
  sections: [
    { key: "summary", order: 1 },
    { key: "experience", order: 2 },
    { key: "education", order: 3 },
    { key: "skills", order: 4 },
    { key: "projects", order: 5 },
  ],
  dynamicRowsCreated: [],
};

const TEMPLATE_SYSTEM_PROMPT = [
  "You are a resume-template analyst. Given a resume's text, choose the closest-match keys from the platform's static registry. Return STRICT JSON only:",
  "{",
  '  "themeKey": "default"|"minimal"|"bold"|"serif"|"two-column",',
  '  "fontKey": "inter"|"playfair"|"merriweather"|"roboto"|"jetbrains-mono",',
  '  "headingKey": "sans-bold"|"serif-italic"|"sans-uppercase",',
  '  "layoutKey": "single-column-ats"|"two-column"|"sidebar-left"|"sidebar-right",',
  '  "accentColor": "#RRGGBB",',
  '  "sections": [{"key": "summary|experience|education|skills|projects", "order": number}]',
  "}",
  "Prefer existing keys. Only suggest a new combination when no static match exists.",
].join("\n");

/**
 * #187 — closest-match ResumeTemplateDescriptor (theme / font / heading /
 * layout keys) for a résumé. Counts against `resume_parse`. Falls back to
 * the baseline descriptor on any model error so it never fails.
 */
export const templateExtractTool = defineAiTool({
  id: "template-extract",
  schema: z
    .object({ fileUrl: z.string().url().optional(), resumeText: z.string().max(50_000).optional() })
    .refine((d) => d.fileUrl || d.resumeText, "fileUrl or resumeText is required"),
  tokenBudget: "none",
  useCase: "resume_consolidate_highlights",
  handler: async (c, input) => {
    const blocked = await servicesProcessor.enforce(c, "resume_parse");
    if (blocked) return blocked;

    let descriptor = BASELINE_DESCRIPTOR;
    let usedModel = false;
    if (hasAnyLLMProviderKey(c.env)) {
      try {
        const { content } = await createLLMClient(c.env, c.var.user).callText("resume_template_extractor", {
          useCase: "resume_consolidate_highlights",
          systemPrompt: TEMPLATE_SYSTEM_PROMPT,
          userMessage: input.resumeText
            ? `Resume text:\n${input.resumeText.slice(0, 8_000)}\n\nReturn a ResumeTemplateDescriptor matching the visual style of this resume.`
            : `Resume PDF at ${input.fileUrl}. Best-effort descriptor.`,
          responseFormat: "json_object",
        });
        const match = content.match(/\{[\s\S]*\}/);
        const parsed = match ? (JSON.parse(match[0]) as Partial<ResumeTemplateDescriptor>) : null;
        if (parsed?.themeKey && parsed?.fontKey) {
          descriptor = { ...BASELINE_DESCRIPTOR, ...parsed, dynamicRowsCreated: [] };
          usedModel = true;
        }
      } catch (err) {
        logger.warn("[template-extractor] LLM extraction failed, using baseline", err);
      }
    }
    servicesProcessor.meterEvent(c, "resume_parse", { source: "template-extractor", usedModel });
    return c.json(
      success({
        descriptor,
        usedModel,
        note: usedModel ? "Descriptor extracted via multimodal LLM." : "LLM unavailable — using heuristic baseline descriptor.",
      }),
      200,
    );
  },
});
