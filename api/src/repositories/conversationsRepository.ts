/**
 * ConversationsRepository — user-to-user and user-to-AI messaging.
 *
 * Covers:
 *   • conversations             — DM / group thread root
 *   • conversationParticipants  — thread membership
 *   • messages                  — message bodies on user-to-user threads
 *   • businessPhoneNumbers      — per-user outbound phone provisioning
 *   • callLogs                  — call history
 *
 * (The user-to-AI chat channel lives in AiChatRepository.)
 *
 * Grouped because they're all "an ongoing exchange between two
 * parties" — different channels, same conversational shape.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { bumpInboxFor } from "../services/messaging/inboxCacheVersion.js";

const {
  conversations,
  conversationParticipants,
  messages,
  messageReadReceipts,
  businessPhoneNumbers,
  callLogs,
} = schema;

export type DbLike = any;

export type ConversationRow = typeof conversations.$inferSelect;
export type ConversationInsert = typeof conversations.$inferInsert;
export type ConversationParticipantRow = typeof conversationParticipants.$inferSelect;
export type ConversationParticipantInsert = typeof conversationParticipants.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type { AiChatSessionRow, AiChatSessionInsert, AiChatMessageRow, AiChatMessageInsert } from "./aiChatRepository.js";
export type BusinessPhoneNumberRow = typeof businessPhoneNumbers.$inferSelect;
export type BusinessPhoneNumberInsert = typeof businessPhoneNumbers.$inferInsert;
export type CallLogRow = typeof callLogs.$inferSelect;
export type CallLogInsert = typeof callLogs.$inferInsert;

/** Conversations + participants. */
export interface IConversationRepository {
  findConversationById(id: string): Promise<ConversationRow | null>;
  /** Most-recently-updated conversations the user participates in,
   *  ordered `updatedAt DESC`, capped at `limit` (default 200, max 500). */
  findConversationsForUser(userId: string, limit?: number): Promise<ConversationRow[]>;
  /** Find an existing direct conversation between exactly these two users
   *  (any order). Used for find-or-create so we don't spawn duplicate
   *  threads when "Message" is clicked twice. */
  findDirectConversationBetween(userAId: string, userBId: string): Promise<ConversationRow | null>;
  insertConversation(input: ConversationInsert): Promise<ConversationRow>;
  insertConversationParticipant(input: ConversationParticipantInsert): Promise<void>;
  insertConversationParticipants(inputs: ConversationParticipantInsert[]): Promise<void>;
  findParticipantUserIds(conversationId: string): Promise<string[]>;
  /** True when `userId` is a participant of the conversation. */
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  /** Full participant rows for one conversation. */
  findParticipantsForConversation(conversationId: string): Promise<ConversationParticipantRow[]>;
  /** Batch participant lookup — one round-trip for a page of conversations. */
  findParticipantUserIdsForConversations(conversationIds: string[]): Promise<Map<string, string[]>>;
  /** Bump the conversation's `updatedAt` so the inbox sort by most-recent
   *  reflects the latest message without an extra select-then-update. */
  touchConversation(id: string): Promise<void>;
}

/** Messages + read receipts. */
export interface IConversationMessageRepository {
  findMessagesForConversation(conversationId: string, limit?: number): Promise<MessageRow[]>;
  /** Every non-deleted message in a conversation, newest first. */
  findVisibleMessagesForConversation(conversationId: string): Promise<MessageRow[]>;
  /** Newest-first messages across every conversation `userId` participates
   *  in (optionally narrowed to one conversation), capped at `limit`
   *  (default 100, max 500). */
  findMessagesForParticipant(
    userId: string,
    opts?: { conversationId?: string; limit?: number },
  ): Promise<MessageRow[]>;
  insertMessage(input: MessageInsert): Promise<MessageRow>;
  /** Ids of messages in one conversation the user has a read receipt for
   *  (scoped to the conversation — not the user's whole receipt history). */
  findReadMessageIdsInConversation(conversationId: string, userId: string): Promise<Set<string>>;
  /** Mark every non-deleted message in a conversation read for `userId`:
   *  one read (messages LEFT JOIN the user's receipts) + one multi-row
   *  insert for the messages not yet read and not sent by the user.
   *  Returns the count of non-deleted messages in the conversation. */
  markConversationReadForUser(conversationId: string, userId: string, readAt: Date): Promise<number>;
  /** Latest-message-per-conversation lookup — used by the inbox feed
   *  to render `lastMessage` previews without N+1 queries. */
  findLatestMessagePerConversation(conversationIds: string[]): Promise<MessageRow[]>;
  /** Unread count per conversation for the given viewer (#531). Counts
   *  messages where the viewer is NOT the sender and has no row in
   *  `message_read_receipts`. One round-trip per inbox load. */
  countUnreadPerConversation(
    viewerId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>>;
}

/** Business phone numbers + call logs. */
export interface ITelephonyRepository {
  findBusinessPhoneNumbersForUser(userId: string): Promise<BusinessPhoneNumberRow[]>;
  findCallLogsForUser(userId: string, limit?: number): Promise<CallLogRow[]>;
  insertCallLog(input: CallLogInsert): Promise<void>;
}

export interface IConversationsRepository
  extends IConversationRepository,
    IConversationMessageRepository,
    ITelephonyRepository {}

export class ConversationsRepository implements IConversationsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findConversationById(id: string): Promise<ConversationRow | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return (row as ConversationRow) ?? null;
  }

  async findConversationsForUser(userId: string, limit = 200): Promise<ConversationRow[]> {
    const rows = (await this.db
      .select({ convo: conversations })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(Math.min(500, Math.max(1, limit)))) as Array<{ convo: ConversationRow }>;
    return rows.map((r) => r.convo);
  }

  async findDirectConversationBetween(userAId: string, userBId: string): Promise<ConversationRow | null> {
    // A direct conversation is a conversation with type="direct" that has
    // exactly the two users as participants. The HAVING clause guards
    // against a 1:1 thread expanded into a group later.
    const rows = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.type, "direct"),
          inArray(conversationParticipants.userId, [userAId, userBId]),
        ),
      )
      .groupBy(conversations.id)
      .having(sql`COUNT(DISTINCT ${conversationParticipants.userId}) = 2 AND COUNT(${conversationParticipants.userId}) = 2`);
    if (rows.length === 0) return null;
    return this.findConversationById(rows[0].id);
  }

  async insertConversation(input: ConversationInsert): Promise<ConversationRow> {
    const [row] = await this.db.insert(conversations).values(input as any).returning();
    return row as ConversationRow;
  }

  async insertConversationParticipant(input: ConversationParticipantInsert): Promise<void> {
    await this.db.insert(conversationParticipants).values(input as any);
    bumpInboxFor([input.userId]);
  }

  async insertConversationParticipants(inputs: ConversationParticipantInsert[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.db.insert(conversationParticipants).values(inputs as any);
    bumpInboxFor(inputs.map((i) => i.userId));
  }

  async findParticipantUserIds(conversationId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    return rows.map((r: any) => r.userId as string);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)))
      .limit(1);
    return !!row;
  }

  async findParticipantsForConversation(conversationId: string): Promise<ConversationParticipantRow[]> {
    return (await this.db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId))) as ConversationParticipantRow[];
  }

  async findParticipantUserIdsForConversations(
    conversationIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(conversationIds.map((id) => [id, []]));
    if (conversationIds.length === 0) return result;
    const rows = await this.db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
      })
      .from(conversationParticipants)
      .where(inArray(conversationParticipants.conversationId, conversationIds));
    for (const r of rows as Array<{ conversationId: string; userId: string }>) {
      result.get(r.conversationId)?.push(r.userId);
    }
    return result;
  }

  async touchConversation(id: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ updatedAt: this.now() } as any)
      .where(eq(conversations.id, id));
  }

  async findMessagesForConversation(conversationId: string, limit = 100): Promise<MessageRow[]> {
    return (await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as MessageRow[];
  }

  async findVisibleMessagesForConversation(conversationId: string): Promise<MessageRow[]> {
    return (await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.createdAt))) as MessageRow[];
  }

  async findMessagesForParticipant(
    userId: string,
    opts: { conversationId?: string; limit?: number } = {},
  ): Promise<MessageRow[]> {
    const where = opts.conversationId
      ? and(eq(conversationParticipants.userId, userId), eq(messages.conversationId, opts.conversationId))
      : eq(conversationParticipants.userId, userId);
    const rows = (await this.db
      .select({ message: messages })
      .from(messages)
      .innerJoin(conversationParticipants, eq(messages.conversationId, conversationParticipants.conversationId))
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(500, Math.max(1, opts.limit ?? 100)))) as Array<{ message: MessageRow }>;
    return rows.map((r) => r.message);
  }

  async insertMessage(input: MessageInsert): Promise<MessageRow> {
    const [row] = await this.db.insert(messages).values(input as any).returning();
    return row as MessageRow;
  }

  async findReadMessageIdsInConversation(conversationId: string, userId: string): Promise<Set<string>> {
    const rows = (await this.db
      .select({ messageId: messageReadReceipts.messageId })
      .from(messageReadReceipts)
      .innerJoin(messages, eq(messages.id, messageReadReceipts.messageId))
      .where(
        and(
          eq(messageReadReceipts.userId, userId),
          eq(messages.conversationId, conversationId),
        ),
      )) as Array<{ messageId: string }>;
    return new Set(rows.map((r) => r.messageId));
  }

  async markConversationReadForUser(conversationId: string, userId: string, readAt: Date): Promise<number> {
    const rows = (await this.db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        receiptId: messageReadReceipts.id,
      })
      .from(messages)
      .leftJoin(
        messageReadReceipts,
        and(
          eq(messageReadReceipts.messageId, messages.id),
          eq(messageReadReceipts.userId, userId),
        ),
      )
      .where(and(eq(messages.conversationId, conversationId), eq(messages.isDeleted, false)))) as Array<{
      id: string;
      senderId: string | null;
      receiptId: string | null;
    }>;
    const toInsert = rows
      .filter((r) => r.receiptId == null && r.senderId !== userId)
      .map((r) => ({ messageId: r.id, userId, readAt }));
    if (toInsert.length > 0) {
      // Best-effort like the old per-row inserts: a receipt write failure
      // (e.g. a message deleted mid-request) must not fail the read call.
      await this.db
        .insert(messageReadReceipts)
        .values(toInsert)
        .onConflictDoNothing()
        .catch(() => undefined);
      bumpInboxFor([userId]);
    }
    return rows.length;
  }

  /** One latest-message-per-conversation lookup for an arbitrary list of
   *  conversation ids. Used by the inbox feed so we can render
   *  "lastMessage" previews without N+1 queries. */
  async findLatestMessagePerConversation(conversationIds: string[]): Promise<MessageRow[]> {
    if (conversationIds.length === 0) return [];
    const rows = (await this.db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt))) as MessageRow[];
    // First occurrence per conversationId wins because rows are already
    // sorted by createdAt DESC. JS dedupe is fine here — the inbox is
    // bounded by the user's conversation count, not the global message
    // volume.
    const seen = new Set<string>();
    const out: MessageRow[] = [];
    for (const row of rows) {
      if (seen.has(row.conversationId)) continue;
      seen.add(row.conversationId);
      out.push(row);
    }
    return out;
  }

  async countUnreadPerConversation(
    viewerId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (conversationIds.length === 0) return out;
    // LEFT JOIN read receipts scoped to the viewer; rows where the receipt
    // is missing are unread. Sender's own messages excluded because they
    // never "read" their own sends.
    const rows = (await this.db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(messages)
      .leftJoin(
        messageReadReceipts,
        and(
          eq(messageReadReceipts.messageId, messages.id),
          eq(messageReadReceipts.userId, viewerId),
        ),
      )
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          sql`${messages.senderId} <> ${viewerId}`,
          sql`${messages.isDeleted} = false`,
          sql`${messageReadReceipts.id} IS NULL`,
        ),
      )
      .groupBy(messages.conversationId)) as Array<{ conversationId: string; count: number }>;
    for (const row of rows) out.set(row.conversationId, Number(row.count) || 0);
    return out;
  }

  async findBusinessPhoneNumbersForUser(userId: string): Promise<BusinessPhoneNumberRow[]> {
    return (await this.db
      .select()
      .from(businessPhoneNumbers)
      .where(eq(businessPhoneNumbers.userId, userId))) as BusinessPhoneNumberRow[];
  }

  async findCallLogsForUser(userId: string, limit = 50): Promise<CallLogRow[]> {
    return (await this.db
      .select()
      .from(callLogs)
      .where(eq(callLogs.userId, userId))
      .orderBy(desc(callLogs.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as CallLogRow[];
  }

  async insertCallLog(input: CallLogInsert): Promise<void> {
    await this.db.insert(callLogs).values(input as any);
  }

  private readonly _andPinned = and;
}
