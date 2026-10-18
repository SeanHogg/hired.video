/**
 * Value Proposition use case — AI tool `value-proposition` (POST /api/ai/tools/value-proposition).
 *
 * Resolves the job (tracked id or pasted text) and the résumé (one of the
 * caller's résumé ids, owner-scoped, or pasted text) through the same
 * resolvers every fit flow uses, then asks the LLM for the shared
 * `ValuePropositionResponse` shape. LLM failures throw so the route can
 * surface the typed AI_* envelope; there is deliberately no canned
 * fallback — a pitch that isn't about the user's résumé is worse than none.
 */

import {
  ValuePropositionRequestSchema,
  ValuePropositionResponseSchema,
  type ValuePropositionRequest,
  type ValuePropositionResponse,
} from "../../../../shared/tool-schemas.js";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import type { LLMStreamSink } from "../adapters/llm-client.js";
import type { MatchDeps } from "./match-deps.js";
import { TEXT_CAP, resumeContentToText } from "./match-text.js";
import { resolveJob, resolveResumeV2 } from "./match-resolvers.js";

const SYSTEM_PROMPT = getPrompt("value-proposition").render({});

/** Pasted text wins only when no id was given — mirrors the request contract. */
async function resolveResumeText(
  deps: MatchDeps,
  userId: string,
  req: ValuePropositionRequest,
): Promise<string | null> {
  if (req.resumeId) {
    const resume = await resolveResumeV2(deps, userId, req.resumeId);
    return resume ? resumeContentToText(resume.content) : null;
  }
  return req.resumeContent?.trim().slice(0, TEXT_CAP) ?? null;
}

export function buildValuePropositionMessage(
  jobText: string,
  resumeText: string,
  req: Pick<ValuePropositionRequest, "companyName" | "companyMission" | "companyValues">,
): string {
  const company = [
    req.companyName && `Company: ${req.companyName}`,
    req.companyMission && `Mission: ${req.companyMission}`,
    req.companyValues && `Values: ${req.companyValues}`,
  ].filter(Boolean);
  return [
    `Job:\n${jobText}`,
    ...(company.length ? [`Company context:\n${company.join("\n")}`] : []),
    `Resume:\n${resumeText}`,
  ].join("\n\n---\n\n");
}

export async function handleValueProposition(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
  /** Stream the pitch as it is written (#1342). */
  stream?: LLMStreamSink,
): Promise<ValuePropositionResponse> {
  const userId = requireUserId(viewerId);

  const parsed = ValuePropositionRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "A job (jobId or jobContent) and a resume (resumeId or resumeContent) are required", parsed.error.flatten());
  }
  const req = parsed.data;

  const job = await resolveJob(deps, req.jobId ? { jobId: req.jobId } : { jobHtml: req.jobContent });
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  const resumeText = await resolveResumeText(deps, userId, req);
  if (!resumeText) throw new DomainError(404, "NOT_FOUND", "Resume not found");

  if (!deps.llm) throw new DomainError(503, "AI_UNAVAILABLE", "AI is not configured");

  const { data } = await deps.llm.callJson<ValuePropositionResponse>(
    "value_proposition_generate",
    {
      useCase: "value_proposition",
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildValuePropositionMessage(job.text, resumeText, req),
      responseFormat: "json_object",
    },
    ValuePropositionResponseSchema,
    stream ? { stream } : undefined,
  );
  return data;
}
