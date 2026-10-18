/**
 * Interview practice use cases behind /api/studio/interview/*
 * (routes/studio-features/interview.ts): browse the question library, seed
 * the defaults, start a session (AI talking points from a résumé), record an
 * answer (AI score + feedback) and list the user's sessions.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import {
  createStudioInterviewPracticeRepository,
  type InterviewQuestionFilter,
  type InterviewQuestionRow,
  type InterviewQuestionSeed,
  type InterviewSessionPatch,
  type InterviewSessionRow,
} from "../../repositories/studioInterviewPracticeRepository.js";

type LLMEnv = Parameters<typeof createLLMClient>[0];
type LLMUser = Parameters<typeof createLLMClient>[1];

/** What the AI steps need from the request. */
export interface InterviewAiContext {
  env: LLMEnv;
  user: LLMUser;
}

const DEFAULT_QUESTIONS: readonly InterviewQuestionSeed[] = [
  // Behavioral
  { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to deal with a difficult team member.", framework: "STAR", tips: ["Be specific about the situation", "Focus on your actions, not blame", "Show resolution and learning"], industry: "general" },
  { category: "behavioral", difficulty: "medium", question: "Describe a situation where you had to meet a tight deadline.", framework: "STAR", tips: ["Quantify the deadline pressure", "Show prioritization skills", "Highlight the outcome"], industry: "general" },
  { category: "behavioral", difficulty: "hard", question: "Tell me about your biggest professional failure and what you learned.", framework: "STAR", tips: ["Choose a genuine failure, not a humble-brag", "Focus 70% on the learning", "Show how you've applied the lesson since"], industry: "general" },
  { category: "behavioral", difficulty: "easy", question: "Why are you interested in this role?", framework: null, tips: ["Research the company thoroughly", "Connect your skills to their needs", "Show genuine enthusiasm"], industry: "general" },
  { category: "behavioral", difficulty: "medium", question: "Describe a time you went above and beyond for a project.", framework: "STAR", tips: ["Be specific about what 'above and beyond' meant", "Show the impact of your extra effort", "Connect it to your work ethic"], industry: "general" },
  { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to persuade someone to see things your way.", framework: "STAR", tips: ["Show empathy for the other perspective", "Describe your communication approach", "Focus on the collaborative outcome"], industry: "general" },
  { category: "behavioral", difficulty: "hard", question: "Describe a situation where you had to make a decision with incomplete information.", framework: "STAR", tips: ["Show your analytical framework", "Explain how you mitigated risk", "Share the outcome and what you'd do differently"], industry: "general" },
  // Technical
  { category: "technical", difficulty: "medium", question: "Walk me through a recent project you're proud of. What was the architecture?", framework: null, tips: ["Start with the problem being solved", "Explain your technical choices", "Discuss trade-offs you considered"], industry: "tech" },
  { category: "technical", difficulty: "hard", question: "How would you design a system to handle 10x your current traffic?", framework: null, tips: ["Think about horizontal scaling", "Discuss caching, CDNs, and database optimization", "Mention monitoring and fallback strategies"], industry: "tech" },
  { category: "technical", difficulty: "easy", question: "What programming languages and frameworks are you most comfortable with?", framework: null, tips: ["Rank by proficiency", "Give examples of what you've built with each", "Be honest about learning curves"], industry: "tech" },
  // Situational
  { category: "situational", difficulty: "medium", question: "Your manager assigns a project you disagree with. How do you handle it?", framework: null, tips: ["Show respect for authority while expressing your perspective", "Propose alternatives constructively", "Demonstrate adaptability"], industry: "general" },
  { category: "situational", difficulty: "hard", question: "You discover a colleague is taking credit for your work. What do you do?", framework: null, tips: ["Stay professional and calm", "Address it directly but diplomatically", "Document your contributions"], industry: "general" },
  { category: "situational", difficulty: "medium", question: "How would you onboard yourself into a new team within the first 90 days?", framework: null, tips: ["Show a structured approach", "Mention relationship building", "Balance learning with early contributions"], industry: "general" },
  // Company-specific
  { category: "company-specific", difficulty: "medium", question: "What do you know about our company's mission and how does it align with your values?", framework: null, tips: ["Do deep research beyond the About page", "Connect personally to their mission", "Be authentic"], industry: "general" },
  { category: "company-specific", difficulty: "medium", question: "Where do you see yourself contributing most in the first year?", framework: null, tips: ["Tie to the job description", "Show ambition tempered with realism", "Demonstrate understanding of their challenges"], industry: "general" },
];

const repo = () => createStudioInterviewPracticeRepository(getDb());

/** LLM replies sometimes arrive fenced in ```json … ```. */
function parseLlmJson<T>(content: string): T {
  return JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, "")) as T;
}

export function listInterviewQuestions(filter: InterviewQuestionFilter): Promise<InterviewQuestionRow[]> {
  return repo().listQuestions(filter);
}

/** Seed the default library; answers the size of the default set. */
export async function seedDefaultInterviewQuestions(): Promise<{ seeded: number }> {
  await repo().insertDefaultQuestions(DEFAULT_QUESTIONS);
  return { seeded: DEFAULT_QUESTIONS.length };
}

/** Start a practice session; with a résumé and an LLM key, generate talking
 *  points for the question (best-effort — failures leave them empty). */
export async function startInterviewSession(
  userId: string,
  input: { questionId: string; resumeText?: string },
  ai: InterviewAiContext,
) {
  const r = repo();
  let talkingPoints: string[] = [];

  if (hasAnyLLMProviderKey(ai.env) && input.resumeText) {
    const question = await r.findQuestionById(input.questionId);
    if (question) {
      try {
        const llm = createLLMClient(ai.env, ai.user);
        const { content } = await llm.callText("studio_interview_talking_points", {
          useCase: "interview_questions",
          systemPrompt: `You are an interview coach. Generate 3-5 bullet-point talking points that the candidate should mention when answering this question, based on their resume. Return JSON: {"points": ["...", "..."]}`,
          userMessage: `Question: ${question.question}\n\nResume:\n${input.resumeText.slice(0, 3000)}`,
        });
        talkingPoints = parseLlmJson<{ points?: string[] }>(content).points ?? [];
      } catch { /* fallback to empty */ }
    }
  }

  const session = await r.insertSession({ userId, questionId: input.questionId, talkingPoints });
  return { id: session.id, questionId: input.questionId, talkingPoints };
}

/** Patch the caller's session (404 when it is not theirs). When an answer
 *  arrives and an LLM key is set, score it best-effort; the response carries
 *  the row as patched (the score lands on the row for later reads). */
export async function updateInterviewSession(
  userId: string,
  sessionId: string,
  patch: InterviewSessionPatch,
  ai: InterviewAiContext,
): Promise<InterviewSessionRow> {
  const r = repo();
  const updated = await r.updateOwnSession(sessionId, userId, patch);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Session not found");

  if (patch.answer && updated.questionId && hasAnyLLMProviderKey(ai.env)) {
    const question = await r.findQuestionById(updated.questionId);
    if (question) {
      try {
        const llm = createLLMClient(ai.env, ai.user);
        const { content } = await llm.callText("studio_interview_score", {
          useCase: "interview_analyze",
          systemPrompt: `You are an interview coach. Score the candidate's answer to this interview question.
Return JSON: {"score": 0-100, "feedback": {"content": "...", "delivery": "...", "structure": "..."}}
Score 80+ is excellent, 60-79 is good, 40-59 needs work, below 40 is poor.`,
          userMessage: `Question: ${question.question}\n\nCandidate's answer:\n${patch.answer.slice(0, 3000)}`,
        });
        const result = parseLlmJson<{ score: number; feedback: unknown }>(content);
        await r.updateSessionScore(sessionId, result.score, result.feedback);
      } catch { /* ignore */ }
    }
  }

  return updated;
}

export function listInterviewSessions(userId: string): Promise<InterviewSessionRow[]> {
  return repo().listSessionsForUser(userId);
}
