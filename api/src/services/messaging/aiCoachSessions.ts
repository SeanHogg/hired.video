/**
 * Career-coach (AI Brain) chat sessions behind `/api/ai/sessions` and the
 * session bookkeeping of `POST /api/ai/chat`. The `model` / `systemPrompt`
 * columns are stored for SuperAdmin audit and must NEVER reach consumers.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { AiChatRepository, type AiChatSessionSummary, type IAiChatRepository } from "../../repositories/aiChatRepository.js";
import { logger } from "../../lib/logger.js";

function repo(): IAiChatRepository {
  return new AiChatRepository(getDb());
}

function sessionNotFound(): DomainError {
  return new DomainError(404, "NOT_FOUND", "Session not found");
}

/** GET /sessions — the caller's 50 most recently updated sessions. */
export function listCoachSessions(userId: string, chats: IAiChatRepository = repo()): Promise<AiChatSessionSummary[]> {
  return chats.findAiChatSessionSummariesForUser(userId, 50);
}

/** GET /sessions/:id — the owned session (minus model/systemPrompt) with its messages. */
export async function getCoachSession(userId: string, id: string, chats: IAiChatRepository = repo()) {
  const session = await chats.findAiChatSessionById(id);
  if (!session || session.userId !== userId) throw sessionNotFound();
  const messages = await chats.findAiChatMessages(session.id);
  const { model: _model, systemPrompt: _sp, ...sessionPublic } = session;
  return { ...sessionPublic, messages };
}

/** DELETE /sessions/:id — owner only. */
export async function deleteCoachSession(userId: string, id: string, chats: IAiChatRepository = repo()): Promise<void> {
  const session = await chats.findAiChatSessionById(id);
  if (!session || session.userId !== userId) throw sessionNotFound();
  await chats.deleteAiChatSession(session.id);
}

/**
 * Resolve the caller's session for a chat turn, or create a fresh one. The
 * ownership filter is load-bearing: a missing or foreign session id silently
 * falls through to a new session (never persist into another user's thread).
 */
export async function resolveCoachSession(
  userId: string,
  incomingSessionId: string | null,
  init: { title: string; systemPrompt: string },
  chats: IAiChatRepository = repo(),
): Promise<string> {
  const owned = incomingSessionId ? await chats.findOwnedAiChatSessionId(incomingSessionId, userId) : null;
  if (owned) {
    await chats.touchAiChatSession(owned);
    return owned;
  }
  const created = await chats.insertAiChatSession({
    userId,
    title: init.title,
    model: "google/gemini-flash-1.5",
    systemPrompt: init.systemPrompt,
    isActive: true,
  });
  return created.id;
}

/** The last 20 turns, oldest first — history replay when the client sent none. */
export function loadCoachHistory(sessionId: string, chats: IAiChatRepository = repo()) {
  return chats.findRecentAiChatTurns(sessionId, 20);
}

/**
 * Best-effort message persistence: a failure (subrequest cap, Neon transient,
 * FK race) is logged and swallowed so the chat turn still answers (#1570/#1578).
 */
export async function persistCoachMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  tokensUsed: number,
  chats: IAiChatRepository = repo(),
): Promise<void> {
  if (!content) return;
  try {
    await chats.insertAiChatMessage({ sessionId, role, content, tokensUsed });
  } catch (persistErr) {
    logger.error("[ai/chat] persist message failed", { sessionId, role, tokensUsed, error: persistErr });
  }
}
