/**
 * resume-summarize + resume-revise — whole-document résumé text tools.
 */
import { z } from "zod";
import { DomainError } from "../../../domains/errors.js";
import { servicesProcessor } from "../../../domains/services-processing/index.js";
import { getDb } from "../../../db/index.js";
import { logger } from "../../../lib/logger.js";
import { anonResumeAiGate } from "../../../middleware/anon-resume-ai-gate.js";
import { buildRepos } from "../../../repositories/index.js";
import { success } from "../../../types/index.js";
import { createAiTextCaller } from "../../adapters/ai-text-caller.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../adapters/llm-client.js";
import { parseReviseFocus, reviseResumeContent, REVISE_MAX_INPUT_CHARS } from "../../resume/revise.js";
import {
  buildDeterministicSummary,
  classifySummarizeInput,
  MAX_RESUME_CHARS,
  resolveResumeForSummary,
  SUMMARY_SYSTEM_PROMPT,
} from "../../resume/summarize.js";
import { defineAiTool, failTool } from "../types.js";

/** `{ resumeText: string | ResumeContent }` or `{ resumeId }` → `{ result }`.
 *  Free tier: 5 / month (#765). The LLM summary falls back to a
 *  deterministic one, so the tool always answers. */
export const resumeSummarizeTool = defineAiTool({
  id: "resume-summarize",
  schema: z.object({ resumeText: z.unknown().optional(), resumeId: z.string().optional() }).passthrough(),
  tokenBudget: "none",
  useCase: "resume_summary",
  handler: async (c, input) => {
    const blocked = await servicesProcessor.enforce(c, "resume_summary");
    if (blocked) return blocked;

    const resolved = await resolveResumeForSummary(buildRepos(getDb()).resumes, classifySummarizeInput(input), c.var.user?.sub);
    // `in` narrowing — the API compiles with `strict: false`.
    if ("code" in resolved) return failTool(c, new DomainError(resolved.status, resolved.code, resolved.message));

    let summary = "";
    if (hasAnyLLMProviderKey(c.env)) {
      try {
        const { content } = await createLLMClient(c.env, c.var.user).callText("resume_summary", {
          useCase: "resume_summary",
          systemPrompt: SUMMARY_SYSTEM_PROMPT,
          userMessage: `Summarise this resume:\n\n${resolved.resumeText.slice(0, MAX_RESUME_CHARS)}`,
          responseFormat: "text",
        });
        summary = content.trim();
      } catch (err) {
        logger.warn("[resume/summarize] LLM error, falling back to deterministic summary", {
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    servicesProcessor.meterEvent(c, "resume_summary");
    return c.json(success({ result: summary || buildDeterministicSummary(resolved.resumeText) }), 200);
  },
});

/**
 * The kit workspace chat: apply one plain-language change ("make it
 * punchier") to the draft on screen → `{ content, changed }`, or answer a
 * question → `{ reply }` with the draft untouched. Nothing is persisted.
 * Signed-out visitors may use it (IP-capped); the shared résumé caller
 * falls back to Workers AI when the gateway is unavailable.
 */
export const resumeReviseTool = defineAiTool({
  id: "resume-revise",
  schema: z.object({
    content: z.record(z.string(), z.unknown()),
    instruction: z.string(),
    focus: z.unknown().optional(),
  }),
  tokenBudget: "none",
  useCase: "resume_optimize",
  guard: anonResumeAiGate,
  handler: async (c, input) => {
    const result = await reviseResumeContent(
      input.content,
      input.instruction,
      createAiTextCaller(c.env, c.var.user, {
        label: "resume_revise_ai",
        useCase: "resume_optimize",
        maxInputChars: REVISE_MAX_INPUT_CHARS,
      }),
      parseReviseFocus(input.focus),
    );
    if ("code" in result) {
      const code = result.code === "INVALID_INSTRUCTION" ? "VALIDATION_ERROR" : "REVISE_FAILED";
      return failTool(c, new DomainError(result.code === "AI_FAILED" ? 503 : 422, code, result.message));
    }
    if ("reply" in result) return c.json(success({ reply: result.reply }), 200);
    return c.json(success({ content: result.content, changed: result.changed }), 200);
  },
});
