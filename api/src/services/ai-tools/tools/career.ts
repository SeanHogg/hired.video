/**
 * Career AI tools — value proposition, salary (analyze + negotiation tips),
 * career resilience.
 */
import { z } from "zod";
import { DomainError } from "../../../domains/errors.js";
import { servicesProcessor } from "../../../domains/services-processing/index.js";
import { getDb } from "../../../db/index.js";
import { CareerResilienceRepository } from "../../../repositories/careerResilienceRepository.js";
import { success } from "../../../types/index.js";
import { randomHex } from "../../../utils/crypto.js";
import { tryExtractJson } from "../../../../../shared/extract-json.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../adapters/llm-client.js";
import { aiFailure } from "../../adapters/llm-error.js";
import { AiStreamFailure, aiStreamResponse, wantsEventStream } from "../../adapters/ai-stream-response.js";
import {
  buildFallbackReport,
  buildResiliencePrompt,
  getFallbackRiskScore,
  RESILIENCE_SYSTEM_PROMPT,
  ResilienceRequestSchema,
  type ResilienceReport,
} from "../../career/resilience.js";
import { handleValueProposition } from "../../job/value-proposition-handler.js";
import { analyzeSalary, salaryNegotiationTips, type SalaryDeps } from "../../salary/handlers.js";
import { defineAiTool, failTool, type AiToolContext } from "../types.js";

const llmOrNull = (c: AiToolContext) => (hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null);

/** Run a use case: data → 200, DomainError → its envelope, a configured
 *  LLM call that threw → the typed AI_* envelope. */
async function answer(c: AiToolContext, tag: string, run: () => Promise<unknown>): Promise<Response> {
  try {
    return c.json(success(await run()), 200);
  } catch (err) {
    if (err instanceof DomainError) return failTool(c, err);
    return aiFailure(c, err, tag);
  }
}

/**
 * The pitch for one job: the body says whether the job / résumé are ids or
 * text. Paid AI → Pro (2026-10-04); the Free-tier meter (#765) still counts
 * pitches. Streams as it is written (#1342).
 */
export const valuePropositionTool = defineAiTool({
  id: "value-proposition",
  schema: z.record(z.string(), z.unknown()),
  requirePro: "Value Proposition",
  tokenBudget: "gate",
  moduleSlug: "value-proposition",
  handler: async (c, body) => {
    const blocked = await servicesProcessor.enforce(c, "value_prop_pitch");
    if (blocked) return blocked;
    const deps = { db: getDb(), now: () => new Date(), llm: llmOrNull(c) };
    const userId = c.var.user?.sub ?? null;
    if (wantsEventStream(c)) {
      return aiStreamResponse(
        c,
        async (stream) => {
          try {
            const pitch = await handleValueProposition(deps, userId, body, stream);
            servicesProcessor.meterEvent(c, "value_prop_pitch");
            return pitch;
          } catch (err) {
            if (err instanceof DomainError) throw new AiStreamFailure(err.code, err.message, err.status, err.details);
            throw err;
          }
        },
        { tag: "[valueproposition] stream" },
      );
    }
    return answer(c, "[valueproposition] LLM error", async () => {
      const pitch = await handleValueProposition(deps, userId, body);
      servicesProcessor.meterEvent(c, "value_prop_pitch");
      return pitch;
    });
  },
});

const salaryDeps = (c: AiToolContext): SalaryDeps => ({ llm: llmOrNull(c) });

/** AI-first; with no provider the use case returns a deterministic stub
 *  keyed off years of experience so the page never hard-errors. */
export const salaryAnalyzeTool = defineAiTool({
  id: "salary-analyze",
  schema: z.record(z.string(), z.unknown()),
  requirePro: "Salary Calculator",
  tokenBudget: "gate",
  handler: (c, body) =>
    answer(c, "[salary] LLM call failed", () => analyzeSalary(salaryDeps(c), c.var.user?.sub ?? null, body)),
});

export const salaryNegotiationTipsTool = defineAiTool({
  id: "salary-negotiation-tips",
  schema: z.record(z.string(), z.unknown()),
  requirePro: "Salary Negotiation Tips",
  tokenBudget: "gate",
  handler: (c, body) =>
    answer(c, "[salary] LLM call failed", () => salaryNegotiationTips(salaryDeps(c), c.var.user?.sub ?? null, body)),
});

/** Generate + persist a resilience report (gap #103) with a share token. */
export const careerResilienceTool = defineAiTool({
  id: "career-resilience",
  schema: ResilienceRequestSchema,
  tokenBudget: "none",
  useCase: "career",
  moduleSlug: "career",
  handler: async (c, { currentRole, yearsExperience, topSkills, industry }) => {
    const fallbackScore = getFallbackRiskScore(currentRole);
    let report: ResilienceReport = buildFallbackReport(currentRole, fallbackScore, topSkills ?? []);
    const llm = llmOrNull(c);
    if (llm) {
      try {
        const { content } = await llm.callText("career_resilience", {
          useCase: "career",
          systemPrompt: RESILIENCE_SYSTEM_PROMPT,
          userMessage: buildResiliencePrompt(currentRole, yearsExperience, topSkills ?? [], industry),
        });
        const parsed = tryExtractJson(content) as ResilienceReport | null;
        if (parsed) report = parsed;
      } catch (err) {
        // Configured-but-threw: AI_* envelope, never the heuristic as if AI.
        return aiFailure(c, err, "[career/resilience-score] LLM error");
      }
    }
    const saved = await new CareerResilienceRepository(getDb()).insert({
      userId: c.var.user.sub as string,
      currentRole,
      riskScore: report.riskScore ?? fallbackScore,
      reportJson: report,
      shareToken: randomHex(16),
    });
    return c.json(success({ ...saved, report }), 201);
  },
});
