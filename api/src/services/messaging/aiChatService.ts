/**
 * Legacy user-to-AI chat (`POST /api/messages`, `POST /api/messages/message`,
 * also mounted under /api/chat). Replies are canned keyword responses — no
 * LLM call — and both sides of the exchange are persisted to the user's chat
 * session (created on first use).
 */

import { getDb } from "../../db/index.js";
import { AiChatRepository, type AiChatSessionRow, type IAiChatRepository } from "../../repositories/aiChatRepository.js";
import { estimateTokens } from "../adapters/llm-stream.js";

export interface AiChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatReply {
  message: string;
  usage: AiChatUsage;
}

function repo(): IAiChatRepository {
  return new AiChatRepository(getDb());
}

/** Keyword-matched canned reply with estimated token usage. */
export function generateMockResponse(input: string): AiChatReply {
  const normalized = (input ?? "").toLowerCase();
  let message = "I'm here to help! Ask me anything about resumes, jobs, or hiring.";

  if (normalized.includes("resume") || normalized.includes("cv")) {
    message =
      "I can help optimize your resume for ATS and hiring managers. Share what you'd like to improve, and I'll suggest updates.";
  } else if (normalized.includes("job") || normalized.includes("career") || normalized.includes("position")) {
    message =
      "Looking for a job? I can help you discover opportunities, tailor applications, and optimize your profile for recruiters.";
  } else if (normalized.includes("recruit") || normalized.includes("hire") || normalized.includes("talent")) {
    message =
      "As a recruiter, I can help you source candidates, craft outreach messages, and track hiring progress.";
  } else if (normalized.includes("analytics") || normalized.includes("data") || normalized.includes("metrics")) {
    message =
      "I can analyze your hiring data and help you interpret key metrics like time-to-hire, conversion rates, and engagement.";
  } else if (normalized.includes("help") || normalized.includes("how") || normalized.includes("what")) {
    message =
      "Ask me anything about hiring, job searching, or resume building and I'll do my best to help.";
  }

  const promptTokens = estimateTokens(input.length);
  const completionTokens = estimateTokens(message.length);
  return { message, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
}

/** Every AI chat session the user owns, oldest first. */
export function listAiChatSessions(userId: string, chats: IAiChatRepository = repo()): Promise<AiChatSessionRow[]> {
  return chats.findAllAiChatSessionsForUserOldestFirst(userId);
}

/** Persist the user's message, generate the canned reply, persist it, return it. */
export async function sendAiChatMessage(
  userId: string,
  userMessage: string,
  chats: IAiChatRepository = repo(),
): Promise<AiChatReply> {
  const session =
    (await chats.findAnyAiChatSessionForUser(userId)) ??
    (await chats.insertAiChatSession({ userId, title: "AI Chat", model: "gpt-3.5", systemPrompt: "" }));

  await chats.insertAiChatMessage({
    sessionId: session.id,
    role: "user",
    content: userMessage,
    tokensUsed: estimateTokens(userMessage.length),
  });

  const response = generateMockResponse(userMessage);

  await chats.insertAiChatMessage({
    sessionId: session.id,
    role: "assistant",
    content: response.message,
    tokensUsed: response.usage.totalTokens,
  });

  return response;
}
