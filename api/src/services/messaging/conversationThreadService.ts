/**
 * Conversation thread use cases behind /api/messages (Gap #45):
 * inbox list, start a thread, thread detail with read flags, send, and
 * mark-read. Every thread-scoped call first checks that the caller is a
 * participant and throws a 404 DomainError otherwise (a non-member never
 * learns the thread exists).
 *
 * `sendThreadMessage` deliberately does NOT notify recipients — that is the
 * contract this endpoint has always had; `messagingService.sendMessage` is
 * the notifying path.
 */

import type { Repos } from "../../repositories/index.js";
import type {
  ConversationParticipantRow,
  ConversationRow,
  MessageRow,
} from "../../repositories/conversationsRepository.js";
import { DomainError } from "../../domains/errors.js";
import { bumpInboxFor } from "./inboxCacheVersion.js";

export type ConversationThreadDeps = {
  repos: Pick<Repos, "conversations">;
};

/** Inbox page cap — the repository bounds the read so a heavy user cannot
 *  load an unbounded result set into the Worker isolate. */
const INBOX_LIMIT = 500;

function notFound(): DomainError {
  return new DomainError(404, "NOT_FOUND", "Conversation not found");
}

async function assertParticipant(deps: ConversationThreadDeps, conversationId: string, userId: string): Promise<void> {
  if (!(await deps.repos.conversations.isParticipant(conversationId, userId))) throw notFound();
}

/** Conversations the user participates in, most recently updated first. */
export function listInbox(deps: ConversationThreadDeps, userId: string): Promise<ConversationRow[]> {
  return deps.repos.conversations.findConversationsForUser(userId, INBOX_LIMIT);
}

/** Create a direct conversation with the caller plus `participantIds`. */
export async function startConversation(
  deps: ConversationThreadDeps,
  input: { userId: string; subject: string; participantIds: string[] },
): Promise<ConversationRow> {
  const repo = deps.repos.conversations;
  const convo = await repo.insertConversation({ subject: input.subject, type: "direct" });
  // One multi-row insert for every participant (was one insert each).
  const allParticipants = [...new Set([input.userId, ...input.participantIds])];
  await repo.insertConversationParticipants(
    allParticipants.map((pId) => ({ conversationId: convo.id, userId: pId, role: "member" })),
  );
  return convo;
}

export type ThreadDetail = ConversationRow & {
  participants: ConversationParticipantRow[];
  messages: Array<MessageRow & { readByMe: boolean }>;
};

/** Conversation + participants + non-deleted messages annotated `readByMe`. */
export async function getThreadDetail(
  deps: ConversationThreadDeps,
  conversationId: string,
  userId: string,
): Promise<ThreadDetail> {
  const repo = deps.repos.conversations;
  await assertParticipant(deps, conversationId, userId);

  const convo = await repo.findConversationById(conversationId);
  if (!convo) throw notFound();

  const [msgRows, participants, readSet] = await Promise.all([
    repo.findVisibleMessagesForConversation(conversationId),
    repo.findParticipantsForConversation(conversationId),
    // Receipts scoped to THIS conversation (not the user's whole history).
    repo.findReadMessageIdsInConversation(conversationId, userId),
  ]);

  const annotated = msgRows.map((m) => ({ ...m, readByMe: m.senderId === userId || readSet.has(m.id) }));
  return { ...convo, participants, messages: annotated };
}

/** Post a message, bump the thread for inbox ordering, refresh inbox caches. */
export async function sendThreadMessage(
  deps: ConversationThreadDeps,
  input: { conversationId: string; userId: string; content: string; contentType?: string },
): Promise<MessageRow> {
  const repo = deps.repos.conversations;
  await assertParticipant(deps, input.conversationId, input.userId);

  const msg = await repo.insertMessage({
    conversationId: input.conversationId,
    senderId: input.userId,
    content: input.content,
    contentType: input.contentType ?? "text",
  });

  // Touch conversation updatedAt for inbox ordering.
  await repo.touchConversation(input.conversationId);
  // New last-message preview + unread counts in every participant's cached inbox.
  bumpInboxFor(await repo.findParticipantUserIds(input.conversationId));
  return msg;
}

/** Mark every message read for the caller; returns the non-deleted count. */
export async function markThreadRead(
  deps: ConversationThreadDeps,
  conversationId: string,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  await assertParticipant(deps, conversationId, userId);
  return deps.repos.conversations.markConversationReadForUser(conversationId, userId, now);
}
