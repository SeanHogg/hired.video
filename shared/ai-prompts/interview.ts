import type { PromptDef } from "./types.js";

export interface InterviewQuestionVars {
  /** Interview type — drives persona framing (e.g. "behavioural", "technical", "system-design"). */
  type: string;
  /** Number of questions to generate. */
  count: number;
}

export const interviewQuestionGeneratorPrompt: PromptDef<InterviewQuestionVars> = {
  id: "interview-question-generator",
  description:
    "Generate a calibrated set of interview questions tailored to a specific JD + resume. Returns JSON only.",
  render: ({ type, count }) =>
    `You are an expert interviewer conducting a ${type} interview. Generate exactly ${count} interview questions.

CRITICAL RULES — read carefully:
1. Every question MUST reference specific skills, responsibilities, or technologies mentioned in the job description below. Generic questions are forbidden.
2. Use the exact role title and company context from the JD in at least 2 questions.
3. If a resume is provided, tailor questions to probe the candidate's specific experience gaps or highlight relevant wins.
4. Mix difficulty: 1-2 warm-up, 2-3 core, 1 stretch question.
5. Set timeLimit (seconds): 60 for simple, 90 for behavioural, 120-180 for technical/design.
6. Return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{ "questions": [{ "id": "q1", "question": "...", "category": "behavioral|technical|system-design", "timeLimit": 90 }] }`,
};

export const interviewAnswerCoachPrompt: PromptDef = {
  id: "interview-answer-coach",
  description:
    "Score an interview answer across clarity / confidence / structure / relevance / impact and propose a concrete model answer.",
  render: () =>
    `You are an expert interview coach. Evaluate the candidate's answer and return a JSON object.

Scoring dimensions (0-10, be calibrated: 6-7 is good, 8-9 is excellent):
- clarity: how clearly and concisely the answer is communicated
- confidence: assertive, first-person language with no hedging
- structure: logical flow; STAR method or equivalent
- relevance: how directly the answer addresses THIS specific role and JD (penalise generic answers heavily)
- impact: quantifiable outcomes, metrics, business results

Rules:
- strengths: 2-3 specific things from their actual answer (not generic praise)
- improvements: 2-3 actionable, specific improvements referencing the JD where applicable
- suggestedAnswer: a concrete model answer for this exact question and role — not a generic template
- Return ONLY valid JSON`,
};
