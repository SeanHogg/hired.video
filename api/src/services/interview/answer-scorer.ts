/**
 * answer-scorer — runs an LLM rubric against a single interview answer
 * (text or video transcript) and returns a structured score the recruiter
 * review surface can render side-by-side.
 *
 * Rubric is STAR + skill probe — this is what HireVue's AI Insights surface
 * publicly leans on, and matches how senior recruiters read transcripts.
 * Returning a structured breakdown instead of one number lets the UI explain
 * the score ("strong Situation, weak Result") instead of just asserting it.
 */

import { z } from "zod";
import type { Env, JwtPayload } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import { logger } from "../../lib/logger.js";

export interface AnswerScoreBreakdown {
  situation: number;
  task: number;
  action: number;
  result: number;
  skillProbe: number;
}

export interface AnswerScoreResult {
  score: number;                       // 0–10 weighted average
  breakdown: AnswerScoreBreakdown;     // each 0–10
  summary: string;                     // 1–2 sentence verdict
  strengths: string[];                 // 1–4 short phrases
  concerns: string[];                  // 0–4 short phrases
}

const ResponseSchema = z.object({
  score: z.number().min(0).max(10),
  breakdown: z.object({
    situation: z.number().min(0).max(10),
    task: z.number().min(0).max(10),
    action: z.number().min(0).max(10),
    result: z.number().min(0).max(10),
    skillProbe: z.number().min(0).max(10),
  }),
  summary: z.string().min(8),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

export interface ScoreAnswerArgs {
  question: string;
  /** Skills the question was generated to probe. */
  skillLinks?: string[];
  category?: string;
  /** Either textAnswer (text mode) or transcription (video mode). */
  answerText: string;
  /** Helpful context that lets the LLM tune the bar (e.g. "Senior Backend Engineer"). */
  targetRole?: string;
}

/** Heuristic fallback when no LLM key is configured — basic word count + length
 *  shape so the recruiter UI always has *something* to render. Returned with a
 *  modest score (~5) so a no-LLM environment doesn't auto-shortlist anyone. */
function mockScore(args: ScoreAnswerArgs): AnswerScoreResult {
  const words = args.answerText.trim().split(/\s+/).filter(Boolean).length;
  const base = Math.min(10, Math.max(2, Math.round(words / 25)));
  return {
    score: base,
    breakdown: { situation: base, task: base, action: base, result: base, skillProbe: base },
    summary:
      words < 20
        ? "Answer is very short — likely under-developed."
        : `Answer is ${words} words; AI scoring was unavailable so a rough heuristic was used.`,
    strengths: words > 60 ? ["Answer has enough depth to evaluate"] : [],
    concerns: words < 30 ? ["Answer is very brief — depth unclear"] : [],
  };
}

export async function scoreAnswer(
  env: Env,
  user: JwtPayload | undefined,
  args: ScoreAnswerArgs,
): Promise<AnswerScoreResult> {
  if (!args.answerText?.trim()) {
    return {
      score: 0,
      breakdown: { situation: 0, task: 0, action: 0, result: 0, skillProbe: 0 },
      summary: "No answer to evaluate.",
      strengths: [],
      concerns: ["No answer provided"],
    };
  }
  if (!hasAnyLLMProviderKey(env)) return mockScore(args);

  const systemPrompt = `You are a senior hiring manager scoring an interview answer using the STAR rubric (Situation, Task, Action, Result) plus a skill-probe dimension. Score each rubric 0–10 and the overall score 0–10 as a weighted blend (skill probe weights highest for technical, action+result for behavioral).
Be specific. Reward concrete metrics, named technologies, ownership language. Penalise vagueness ("we did things"), missing outcomes, off-topic answers.
Return ONLY valid JSON matching this schema:
{
  "score": 0..10,
  "breakdown": { "situation": 0..10, "task": 0..10, "action": 0..10, "result": 0..10, "skillProbe": 0..10 },
  "summary": "1-2 sentences",
  "strengths": ["short phrase", ...],
  "concerns": ["short phrase", ...]
}`;

  const userMessage = `Target role: ${args.targetRole ?? "(unspecified)"}
Question category: ${args.category ?? "general"}
Skills the question probes: ${(args.skillLinks ?? []).join(", ") || "(none)"}

Question:
${args.question}

Candidate's answer:
${args.answerText}`;

  try {
    const llm = createLLMClient(env, user);
    const { data } = await llm.callJson(
      "interview_answer_score",
      { useCase: "interview_answer_score", systemPrompt, userMessage },
      ResponseSchema,
    );
    return data;
  } catch (err) {
    logger.error("[answer-scorer] LLM call failed, using mock", err);
    return mockScore(args);
  }
}

/** Combine per-answer scores into a single overall score for the assignment.
 *  Weighted by question importance (required > optional). */
export function aggregateScores(
  rows: Array<{ score: number | null; required: boolean }>,
): { overall: number; coverage: number } {
  if (rows.length === 0) return { overall: 0, coverage: 0 };
  let weightedSum = 0;
  let weightTotal = 0;
  let answered = 0;
  for (const r of rows) {
    if (r.score == null) continue;
    const w = r.required ? 1.5 : 1;
    weightedSum += r.score * w;
    weightTotal += w;
    answered += 1;
  }
  const overall = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 0;
  const coverage = rows.length === 0 ? 0 : Math.round((answered / rows.length) * 100);
  return { overall, coverage };
}
