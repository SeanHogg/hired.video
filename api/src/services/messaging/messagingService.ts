/**
 * MessagingService — direct conversations + message sends.
 *
 * Routes call this instead of writing to `conversations` / `messages`
 * directly so two invariants stay enforced in one place:
 *
 *   1. **Find-or-create direct threads.** Clicking "Message" twice on
 *      the same person returns the same conversation; we never spawn
 *      duplicates. Group threads (>2 participants) bypass this.
 *
 *   2. **Every message ships a notification to the other participants.**
 *      Without this, recipients only see the message if they happen to
 *      have the chat panel open — which is exactly the bug the user
 *      reported.
 *
 * The notification path goes through `emitNotification`, so the inbox
 * `data.actor` envelope is identical to connection-request notifications.
 */

import type { Repos } from "../../repositories/index.js";
import type { ConversationRow, MessageRow } from "../../repositories/conversationsRepository.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";

export type MessagingServiceDeps = {
  repos: Pick<Repos, "users" | "notifications" | "conversations">;
};

const DIRECT_TYPE = "direct";

export interface FindOrCreateDirectInput {
  /** Always the caller — we trust the route to have authenticated this. */
  initiatorId: string;
  recipientId: string;
  /** Optional first message. If supplied, it's sent as part of this call
   *  (and the recipient gets a notification) so a single round-trip
   *  starts the thread. */
  initialMessage?: string;
}

export interface FindOrCreateDirectResult {
  conversation: ConversationRow;
  message: MessageRow | null;
  /** True when this call created the conversation row; false when an
   *  existing thread was reused. The frontend uses this to decide
   *  whether to highlight a brand-new thread. */
  created: boolean;
}

export async function findOrCreateDirectConversation(
  deps: MessagingServiceDeps,
  input: FindOrCreateDirectInput,
): Promise<FindOrCreateDirectResult> {
  if (input.initiatorId === input.recipientId) {
    throw new Error("Cannot start a conversation with yourself");
  }

  const existing = await deps.repos.conversations.findDirectConversationBetween(
    input.initiatorId,
    input.recipientId,
  );

  let conversation = existing;
  let created = false;
  if (!conversation) {
    conversation = await deps.repos.conversations.insertConversation({
      subject: null,
      type: DIRECT_TYPE,
    } as any);
    await deps.repos.conversations.insertConversationParticipants([
      { conversationId: conversation.id, userId: input.initiatorId, role: "member" } as any,
      { conversationId: conversation.id, userId: input.recipientId, role: "member" } as any,
    ]);
    created = true;
  }

  let message: MessageRow | null = null;
  const trimmed = input.initialMessage?.trim();
  if (trimmed) {
    message = await sendMessage(deps, {
      conversationId: conversation.id,
      senderId: input.initiatorId,
      content: trimmed,
    });
  }

  return { conversation, message, created };
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}

export async function sendMessage(
  deps: MessagingServiceDeps,
  input: SendMessageInput,
): Promise<MessageRow> {
  const trimmed = input.content.trim();
  if (!trimmed) {
    throw new Error("Message content is required");
  }

  const message = await deps.repos.conversations.insertMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: trimmed,
    contentType: "text",
  } as any);

  // Side effects: bump the conversation's updatedAt + notify the other
  // participants. Both are best-effort — failures must not make the
  // message look like it failed to send.
  await deps.repos.conversations.touchConversation(input.conversationId).catch((err) => {
    console.error("[messaging] touchConversation failed:", err);
  });

  try {
    const participantIds = await deps.repos.conversations.findParticipantUserIds(
      input.conversationId,
    );
    const recipients = participantIds.filter((id) => id !== input.senderId);
    if (recipients.length > 0) {
      const { actor, actorName } = await resolveActor(deps, input.senderId);
      const preview = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
      await emitNotification(deps, {
        recipientIds: recipients,
        type: "message_received",
        actor,
        title: `${actorName} sent you a message`,
        message: preview,
        target: { id: input.conversationId, type: "conversation" },
      });
    }
  } catch (err) {
    console.error("[messaging] notification fanout failed:", err);
  }

  return message;
}
