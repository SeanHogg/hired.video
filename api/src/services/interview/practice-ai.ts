/**
 * AI side of self-serve mock-interview practice (/api/interview): question
 * generation and per-answer scoring. With an LLM provider configured the
 * gateway answers (and its errors propagate, so the route can surface a
 * typed AI_* envelope); with no provider key the deterministic mocks below
 * are the genuine fallback.
 */
import { z } from "zod";
import { createLLMClient, hasAnyLLMProviderKey, type LLMEnv } from "../adapters/llm-client.js";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";
import type { JwtPayload } from "../../types/index.js";

export const PracticeQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  category: z.string(),
  timeLimit: z.number(),
});

const QuestionsResponseSchema = z.object({
  questions: z.array(PracticeQuestionSchema),
});

type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>;

const FeedbackSchema = z.object({
  score: z.number(),
  scoreBreakdown: z.object({
    clarity: z.number(),
    confidence: z.number(),
    structure: z.number(),
    relevance: z.number(),
    impact: z.number(),
  }),
  feedback: z.object({
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    suggestedAnswer: z.string(),
  }),
});

export type PracticeFeedback = z.infer<typeof FeedbackSchema>;

function buildMockQuestions(type: string, count: number, jobDescription?: string): QuestionsResponse {
  // Extract a role hint from the JD so mock questions feel personalised
  const roleHint = jobDescription
    ? (() => {
        const m = jobDescription.match(/(?:senior|lead|staff|principal|junior)?\s*([a-z][a-z\s]{3,40}(?:engineer|developer|manager|designer|analyst|scientist|architect))/i);
        return m ? m[0].trim() : "this role";
      })()
    : "this role";

  const behavioral = [
    { id: "q1", question: `Tell me about yourself and why you're interested in ${roleHint}.`, category: "behavioral", timeLimit: 90 },
    { id: "q2", question: "Describe a challenging project you worked on and how you overcame the obstacles.", category: "behavioral", timeLimit: 120 },
    { id: "q3", question: `What specific experience do you have that makes you a strong fit for ${roleHint}?`, category: "behavioral", timeLimit: 90 },
    { id: "q4", question: "What is your greatest professional achievement and how did you measure its impact?", category: "behavioral", timeLimit: 90 },
    { id: "q5", question: "Describe a time you had to work with a difficult team member. How did you handle it?", category: "behavioral", timeLimit: 90 },
    { id: "q6", question: "Where do you see yourself in 5 years and how does this role fit that path?", category: "behavioral", timeLimit: 60 },
  ];
  const technical = [
    { id: "q1", question: `Walk me through a technically complex project relevant to ${roleHint}.`, category: "technical", timeLimit: 180 },
    { id: "q2", question: "How do you approach designing a system for high availability and scalability?", category: "technical", timeLimit: 120 },
    { id: "q3", question: "Explain a technical trade-off you made recently and why you chose that path.", category: "technical", timeLimit: 120 },
    { id: "q4", question: "How do you approach debugging a production issue under pressure?", category: "technical", timeLimit: 120 },
    { id: "q5", question: "What is your experience with distributed systems and how do you handle data consistency?", category: "technical", timeLimit: 120 },
    { id: "q6", question: "How do you ensure code quality and reliability in your team?", category: "technical", timeLimit: 90 },
  ];
  const base = type === "technical" ? technical : behavioral;
  return { questions: base.slice(0, count) };
}

function buildMockFeedback(question: string, transcript: string): PracticeFeedback {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(transcript);
  const hasExample = /example|instance|time when|worked on|project/i.test(transcript);

  const clarity = Math.min(9, 5 + (wordCount > 50 ? 1.5 : 0) + (wordCount < 200 ? 0.5 : 0));
  const confidence = Math.min(9, 5 + (wordCount > 30 ? 1 : 0));
  const structure = Math.min(9, 5 + (hasExample ? 1.5 : 0) + (transcript.includes("first") || transcript.includes("then") ? 1 : 0));
  const relevance = Math.min(9, 5.5 + (hasExample ? 1 : 0));
  const impact = Math.min(9, 5 + (hasNumbers ? 1.5 : 0));
  const score = Math.round(((clarity + confidence + structure + relevance + impact) / 5) * 10) / 10;

  return {
    score,
    scoreBreakdown: {
      clarity: Math.round(clarity * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      structure: Math.round(structure * 10) / 10,
      relevance: Math.round(relevance * 10) / 10,
      impact: Math.round(impact * 10) / 10,
    },
    feedback: {
      strengths: [
        wordCount > 50 ? "Good length and detail in your response" : "Clear and concise answer",
        hasExample ? "You provided a concrete example" : "You addressed the question directly",
      ],
      improvements: [
        !hasNumbers ? "Add specific metrics or numbers to quantify your impact" : "Continue using specific metrics",
        !hasExample ? "Use the STAR method: Situation, Task, Action, Result" : "Consider adding more measurable outcomes",
        wordCount < 50 ? "Expand your answer with more detail and context" : "Watch your pace and filler words",
      ],
      suggestedAnswer: `A strong answer to "${question}" would use the STAR method: describe a specific Situation, the Task you were responsible for, the Actions you took, and the measurable Results you achieved. Include specific numbers, percentages, or outcomes where possible.`,
    },
  };
}

export interface GenerateQuestionsInput {
  jobDescription: string;
  resumeText?: string;
  type: string;
  count: number;
}

/** LLM-generated questions, or the mock set when no provider key exists. Throws on LLM failure. */
export async function generatePracticeQuestions(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
  input: GenerateQuestionsInput,
): Promise<QuestionsResponse> {
  const { jobDescription, resumeText, type, count } = input;
  if (!hasAnyLLMProviderKey(env)) return buildMockQuestions(type, count, jobDescription);

  const systemPrompt = getPrompt("interview-question-generator").render({ type, count });
  const userContent = `Job Description:\n${jobDescription.slice(0, 3000)}${resumeText ? `\n\nCandidate Resume:\n${resumeText.slice(0, 2000)}` : ""}`;
  const llm = createLLMClient(env, user);
  const { data } = await llm.callJson("interview_questions", { useCase: "interview_questions", systemPrompt, userMessage: userContent }, QuestionsResponseSchema);
  return data;
}

export interface ScoreAnswerInput {
  question: string;
  transcript: string;
  jobDescription?: string;
}

/** LLM coaching feedback, or the heuristic mock when no provider key exists. Throws on LLM failure. */
export async function scorePracticeAnswer(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
  input: ScoreAnswerInput,
): Promise<PracticeFeedback> {
  if (!hasAnyLLMProviderKey(env)) return buildMockFeedback(input.question, input.transcript);

  const systemPrompt = `${getPrompt("interview-answer-coach").render({})}

Schema:
{
  "score": number,
  "scoreBreakdown": { "clarity": number, "confidence": number, "structure": number, "relevance": number, "impact": number },
  "feedback": {
    "strengths": string[],
    "improvements": string[],
    "suggestedAnswer": string
  }
}`;

  const jobContext = input.jobDescription ? `\nJob context: ${input.jobDescription.slice(0, 500)}` : "";
  const userContent = `Question: ${input.question}${jobContext}\n\nCandidate's answer:\n${input.transcript.slice(0, 2000)}`;
  const llm = createLLMClient(env, user);
  const { data } = await llm.callJson("interview_analyze", { useCase: "interview_analyze", systemPrompt, userMessage: userContent }, FeedbackSchema);
  return data;
}
