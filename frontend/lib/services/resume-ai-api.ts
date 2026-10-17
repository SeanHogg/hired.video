/**
 * Résumé AI tools reached through the one dispatcher
 * (`POST /api/ai/tools/:toolId`, shared/ai-tools/tool-ids.ts): revise,
 * summarize, consolidate bullets. Exposed on `resumeService`
 * (resume-service.ts) under the historical method names.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import { aiToolPath } from "@shared/ai-tools/tool-ids";
import { ResumeContentSchema } from "@shared/resume";
import type { ReviseFocus } from "@shared/video-plan";
import type { ResumeData, ConsolidateBulletsRequest, ConsolidateBulletsResult } from "@/types/resume";

/**
 * The kit chat: a change request comes back as revised `content` plus
 * the areas it `changed`; a question comes back as a `reply` and leaves the
 * draft alone. Nothing is persisted server-side. Anonymous-capable
 * (IP-capped), like parse.
 */
export async function reviseResumeContent(
  content: ResumeData,
  instruction: string,
  focus?: ReviseFocus,
): Promise<{ content: ResumeData; changed: string[] } | { reply: string }> {
  const response = await apiClient.request<{ content: ResumeData; changed: string[] } | { reply: string }>(
    aiToolPath("resume-revise"),
    {
      method: "POST",
      body: JSON.stringify({ content, instruction, focus }),
      headers: { "Content-Type": "application/json" },
      // A full-resume rewrite can exceed the 30s default on the fallback model.
      timeout: 90_000,
    },
    z.union([
      z.object({ reply: z.string() }),
      z.object({ content: ResumeContentSchema, changed: z.array(z.string()).default([]) }),
    ]),
  );
  return response.data;
}

/** AI-generated summary of a stored résumé (`resume-summarize` → `{ result }`). */
export async function getResumeSummary(id: string): Promise<string> {
  const response = await apiClient.post<{ result: string }>(
    aiToolPath("resume-summarize"),
    { resumeId: id },
    z.object({ result: z.string() }),
  );
  return response.data.result;
}

/**
 * Ask the AI to consolidate/rewrite a flat bullet list — dedupes slight
 * wording variants, normalises keyword casing, tightens phrasing. Never
 * invents facts. Caller is responsible for showing a diff and having
 * the user accept before replacing the original list.
 */
export async function consolidateBullets(request: ConsolidateBulletsRequest): Promise<ConsolidateBulletsResult> {
  const response = await apiClient.post<ConsolidateBulletsResult>(
    aiToolPath("resume-consolidate-bullets"),
    request,
    z.any(),
  );
  return response.data;
}
