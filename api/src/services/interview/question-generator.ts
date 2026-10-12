/**
 * Question-generator service — turns a skill list (plus optional role
 * context) into a deduplicated, role-specific interview question set.
 *
 * Shared by:
 *   - /tools/interview-questions (POST /api/studio/async-interview/generate-from-sources)
 *   - /tools/career-360 (POST .../generate-from-sources with targetRole + skills derived from the target)
 *   - The AI Coach tool-call surface (LLM hands us skills + role; we hand back questions)
 *
 * Reuses extractSkills() so a single LLM hop converts a resume / job /
 * profile blob into the skill list, and a second hop converts that list
 * into questions. We do NOT chain into one giant prompt — splitting
 * keeps the extractor reusable across every "what skills does this
 * have" surface (skill extractor tool, resume scorer, career360).
 */

import { z } from "zod";
import type { Skill } from "../resume/skills.js";
import { hasAnyLLMProviderKey, createLLMClient } from "../adapters/llm-client.js";
import type { Env, JwtPayload } from "../../types/index.js";

// ─── Public types ───────────────────────────────────────────────────────────

export interface GeneratedQuestion {
  id: string;
  text: string;
  category: "behavioral" | "technical" | "system-design" | "situational" | "role-fit";
  maxDurationSec: number;
  required: boolean;
  skillLinks: string[]; // Skill names this question probes
}

export type QuestionStyle = "behavioral" | "technical" | "mixed";

export interface GenerateQuestionsArgs {
  /** Skills to probe. Order is informational only — the LLM rebalances. */
  skills: Skill[];
  /** Role title the candidate is interviewing for (e.g. "Senior Backend Engineer"). */
  targetRole?: string;
  /** Seniority hint (e.g. "Senior", "Lead"). */
  seniority?: string;
  /** Question mix. */
  style?: QuestionStyle;
  /** 3–10 questions. */
  count?: number;
}

// ─── LLM schemas ────────────────────────────────────────────────────────────

const QuestionSchema = z.object({
  id: z.string(),
  text: z.string().min(8),
  category: z.enum(["behavioral", "technical", "system-design", "situational", "role-fit"]),
  maxDurationSec: z.number().min(30).max(300),
  required: z.boolean(),
  skillLinks: z.array(z.string()).default([]),
});

const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(12),
});

// ─── Mock fallback (parity with routes/interview.ts pattern) ────────────────

function buildMockQuestions(args: GenerateQuestionsArgs): GeneratedQuestion[] {
  const count = Math.min(Math.max(args.count ?? 5, 3), 10);
  const role = args.targetRole ?? "the target role";
  const top = args.skills.slice(0, count);

  return Array.from({ length: count }, (_, i) => {
    const skill = top[i % Math.max(top.length, 1)];
    const isTech = skill?.category === "technical" || skill?.category === "framework" || skill?.category === "tool";
    const isStyleTech =
      args.style === "technical" || (args.style === "mixed" && i % 2 === 0) || (!args.style && isTech);

    if (isStyleTech && skill) {
      return {
        id: `q${i + 1}`,
        text: `Walk me through a project where you used ${skill.name} in a ${role} context. What was the trade-off you made, and what would you do differently now?`,
        category: "technical" as const,
        maxDurationSec: 180,
        required: i < 3,
        skillLinks: skill ? [skill.name] : [],
      };
    }
    return {
      id: `q${i + 1}`,
      text: skill
        ? `Tell me about a time you applied ${skill.name} to deliver business impact in a ${role}-style role. What was the result?`
        : `Tell me about a time you delivered a measurable result in a ${role}-style role. What was the result?`,
      category: "behavioral" as const,
      maxDurationSec: 120,
      required: i < 3,
      skillLinks: skill ? [skill.name] : [],
    };
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Generate interview questions from a skill list. Falls back to a
 *  deterministic mock when no LLM provider is configured (parity with
 *  routes/interview.ts so dev builds without API keys still get a UX). */
export async function generateQuestionsFromSkills(
  env: Env,
  user: JwtPayload | undefined,
  args: GenerateQuestionsArgs,
): Promise<GeneratedQuestion[]> {
  const count = Math.min(Math.max(args.count ?? 5, 3), 10);
  const skills = args.skills.slice(0, 20); // cap the prompt — top 20 is plenty

  if (!hasAnyLLMProviderKey(env)) {
    return buildMockQuestions({ ...args, count, skills });
  }

  const style = args.style ?? "mixed";
  const role = args.targetRole?.trim() || "the target role";
  const seniority = args.seniority?.trim();

  const skillSummary = skills
    .map((s) => {
      const parts = [s.name];
      if (s.category) parts.push(`(${s.category})`);
      if (s.importance && s.importance !== "preferred") parts.push(`[${s.importance}]`);
      if (typeof s.yearsOfExperience === "number") parts.push(`${s.yearsOfExperience}y`);
      return parts.join(" ");
    })
    .join("\n");

  const systemPrompt =
`You are an expert technical interviewer designing a ${style} question set for a "${role}"${
  seniority ? ` at ${seniority} level` : ""
} interview.

RULES — read carefully:
1. Produce EXACTLY ${count} questions. No more, no fewer.
2. Every question MUST probe at least one specific skill from the supplied list. Echo the skill names back in skillLinks.
3. Mix difficulty: 1–2 warm-up, the rest core, 1 stretch. Mark only the warm-up + core as required:true.
4. Pick maxDurationSec so the total time fits a 25-min interview: 60–90 for warm-up / behavioural, 120–180 for technical / system-design.
5. Use the candidate's own technologies — never write "Tell me about your experience with X" when X isn't in the skill list.
6. id is "q1", "q2", … in order.
7. Return ONLY valid JSON matching this schema:
{
  "questions": [
    { "id": "q1", "text": "...", "category": "behavioral|technical|system-design|situational|role-fit", "maxDurationSec": 120, "required": true, "skillLinks": ["Skill A"] }
  ]
}`;

  const userMessage =
`Role: ${role}${seniority ? `\nSeniority: ${seniority}` : ""}
Style: ${style}
Question count: ${count}

Candidate skills:
${skillSummary || "(no skills supplied — fall back to role-fit questions for the role above)"}`;

  try {
    const llm = createLLMClient(env, user);
    const { data } = await llm.callJson(
      "interview_questions",
      { useCase: "interview_questions", systemPrompt, userMessage },
      QuestionsResponseSchema,
    );
    return data.questions.slice(0, count).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      skillLinks: q.skillLinks ?? [],
    }));
  } catch (err) {
    console.error("[question-generator] LLM call failed, using mock:", err);
    return buildMockQuestions({ ...args, count, skills });
  }
}

// ─── Competency-aware variant (#1439) ───────────────────────────────────────

export interface GenerateForCompetencyArgs {
  competencyName: string;
  /** Optional level / anchor description for calibrated difficulty. */
  level?: string;
  /** Optional leveled-anchor text — gives the LLM "what L3 looks like". */
  anchorText?: string;
  /** 1–6 questions, defaults to 3. */
  count?: number;
  /** Optional role context for tone. */
  targetRole?: string;
}

export interface GeneratedCompetencyQuestion {
  prompt: string;
  difficulty?: string;
  expectedAnswer: "star" | "technical" | "coding" | "portfolio" | "open";
}

const CompetencyQuestionSchema = z.object({
  prompt: z.string().min(8).max(2000),
  difficulty: z.string().max(8).optional(),
  expectedAnswer: z
    .enum(["star", "technical", "coding", "portfolio", "open"])
    .default("open"),
});

const CompetencyQuestionsResponseSchema = z.object({
  questions: z.array(CompetencyQuestionSchema).min(1).max(6),
});

function buildMockCompetencyQuestions(
  args: GenerateForCompetencyArgs,
): GeneratedCompetencyQuestion[] {
  const count = Math.min(Math.max(args.count ?? 3, 1), 6);
  const level = args.level ? ` (${args.level})` : "";
  return Array.from({ length: count }, (_, i) => ({
    prompt:
      i === 0
        ? `Tell me about a time you demonstrated ${args.competencyName}${level} in a recent role. What was the situation and outcome?`
        : i === 1
          ? `What's the most challenging situation you've handled that tested your ${args.competencyName}${level}? Walk me through your approach.`
          : `How would you coach a teammate on ${args.competencyName}${level}? What would you focus on first?`,
    difficulty: args.level,
    expectedAnswer: "star" as const,
  }));
}

/**
 * Generate interview questions calibrated against a competency + level.
 * Falls back to a deterministic mock when no LLM provider is configured.
 * Tagged outputs are tightly scoped to the competency the caller passed
 * — the route layer attaches `competencyId` when persisting.
 */
export async function generateQuestionsForCompetency(
  env: Env,
  user: JwtPayload | undefined,
  args: GenerateForCompetencyArgs,
): Promise<GeneratedCompetencyQuestion[]> {
  const count = Math.min(Math.max(args.count ?? 3, 1), 6);
  if (!hasAnyLLMProviderKey(env)) {
    return buildMockCompetencyQuestions({ ...args, count });
  }
  const role = args.targetRole?.trim() ?? "the target role";
  const systemPrompt =
`You are designing structured-interview questions that probe a specific competency. Return STRICT JSON.

RULES:
1. Produce EXACTLY ${count} questions targeting "${args.competencyName}".
2. ${args.level ? `Calibrate difficulty to level "${args.level}".` : "Mix difficulty across the question set."}
3. Each question MUST be answerable in 2-4 minutes by a candidate giving a STAR-structured answer.
4. Prefer behavioral / situational phrasing; only use "technical" or "coding" expectedAnswer when the competency is unambiguously a hard-skill area.
5. NO yes/no questions. NO leading questions.

OUTPUT JSON SHAPE:
{
  "questions": [
    { "prompt": "...", "difficulty": "${args.level ?? "L3"}", "expectedAnswer": "star" }
  ]
}`;
  const userMessage =
`Competency: ${args.competencyName}
${args.level ? `Level: ${args.level}\n` : ""}${args.anchorText ? `What "${args.level ?? "this level"}" looks like:\n${args.anchorText}\n` : ""}Role context: ${role}
Count: ${count}`;
  try {
    const llm = createLLMClient(env, user);
    const { data } = await llm.callJson(
      "interview_questions",
      { useCase: "interview_questions", systemPrompt, userMessage },
      CompetencyQuestionsResponseSchema,
    );
    return data.questions.slice(0, count).map((q) => ({
      prompt: q.prompt,
      difficulty: q.difficulty ?? args.level,
      expectedAnswer: q.expectedAnswer ?? "open",
    }));
  } catch (err) {
    console.error("[question-generator/competency] LLM error, using mock:", err);
    return buildMockCompetencyQuestions({ ...args, count });
  }
}

