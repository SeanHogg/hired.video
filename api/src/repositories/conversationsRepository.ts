/**
 * ConversationsRepository — user-to-user and user-to-AI messaging.
 *
 * Covers:
 *   • conversations             — DM / group thread root
 *   • conversationParticipants  — thread membership
 *   • messages                  — message bodies on user-to-user threads
 *   • aiChatSessions            — AI chat session state
 *   • aiChatMessages            — per-message body / role
 *   • businessPhoneNumbers      — per-user outbound phone provisioning
 *   • callLogs                  — call history
 *
 * Grouped because they're all "an ongoing exchange between two
 * parties" — different channels, same conversational shape.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  conversations,
  conversationParticipants,
  messages,
  aiChatSessions,
  aiChatMessages,
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
export type AiChatSessionRow = typeof aiChatSessions.$inferSelect;
export type AiChatSessionInsert = typeof aiChatSessions.$inferInsert;
export type AiChatMessageRow = typeof aiChatMessages.$inferSelect;
export type AiChatMessageInsert = typeof aiChatMessages.$inferInsert;
export type BusinessPhoneNumberRow = typeof businessPhoneNumbers.$inferSelect;
export type BusinessPhoneNumberInsert = typeof businessPhoneNumbers.$inferInsert;
export type CallLogRow = typeof callLogs.$inferSelect;
export type CallLogInsert = typeof callLogs.$inferInsert;

export interface IConversationsRepository {
  // ── conversations + participants ──────────────────────────────────────────
  findConversationById(id: string): Promise<ConversationRow | null>;
  findConversationsForUser(userId: string): Promise<ConversationRow[]>;
  /** Find an existing direct conversation between exactly these two users
   *  (any order). Used for find-or-create so we don't spawn duplicate
   *  threads when "Message" is clicked twice. */
  findDirectConversationBetween(userAId: string, userBId: string): Promise<ConversationRow | null>;
  insertConversation(input: ConversationInsert): Promise<ConversationRow>;
  insertConversationParticipant(input: ConversationParticipantInsert): Promise<void>;
  insertConversationParticipants(inputs: ConversationParticipantInsert[]): Promise<void>;
  findParticipantUserIds(conversationId: string): Promise<string[]>;
  /** Bump the conversation's `updatedAt` so the inbox sort by most-recent
   *  reflects the latest message without an extra select-then-update. */
  touchConversation(id: string): Promise<void>;
  // ── messages ──────────────────────────────────────────────────────────────
  findMessagesForConversation(conversationId: string, limit?: number): Promise<MessageRow[]>;
  insertMessage(input: MessageInsert): Promise<MessageRow>;
  /** Latest-message-per-conversation lookup — used by the inbox feed
   *  to render `lastMessage` previews without N+1 queries. */
  findLatestMessagePerConversation(conversationIds: string[]): Promise<MessageRow[]>;
  // ── AI chat (separate channel; same repo for the messaging bounded ctx) ──
  findAiChatSessionsForUser(userId: string, limit?: number): Promise<AiChatSessionRow[]>;
  insertAiChatSession(input: AiChatSessionInsert): Promise<AiChatSessionRow>;
  findAiChatMessages(sessionId: string): Promise<AiChatMessageRow[]>;
  insertAiChatMessage(input: AiChatMessageInsert): Promise<void>;
  findBusinessPhoneNumbersForUser(userId: string): Promise<BusinessPhoneNumberRow[]>;
  findCallLogsForUser(userId: string, limit?: number): Promise<CallLogRow[]>;
  insertCallLog(input: CallLogInsert): Promise<void>;
}

export class ConversationsRepository implements IConversationsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findConversationById(id: string): Promise<ConversationRow | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return (row as ConversationRow) ?? null;
  }

  async findConversationsForUser(userId: string): Promise<ConversationRow[]> {
    const rows = await this.db
      .select({ convo: conversations })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map((r: any) => r.convo) as ConversationRow[];
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
  }

  async insertConversationParticipants(inputs: ConversationParticipantInsert[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.db.insert(conversationParticipants).values(inputs as any);
  }

  async findParticipantUserIds(conversationId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    return rows.map((r: any) => r.userId as string);
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

  async insertMessage(input: MessageInsert): Promise<MessageRow> {
    const [row] = await this.db.insert(messages).values(input as any).returning();
    return row as MessageRow;
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

  async findAiChatSessionsForUser(userId: string, limit = 50): Promise<AiChatSessionRow[]> {
    return (await this.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(desc(aiChatSessions.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as AiChatSessionRow[];
  }

  async insertAiChatSession(input: AiChatSessionInsert): Promise<AiChatSessionRow> {
    const [row] = await this.db.insert(aiChatSessions).values(input as any).returning();
    return row as AiChatSessionRow;
  }

  async findAiChatMessages(sessionId: string): Promise<AiChatMessageRow[]> {
    return (await this.db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(aiChatMessages.createdAt)) as AiChatMessageRow[];
  }

  async insertAiChatMessage(input: AiChatMessageInsert): Promise<void> {
    await this.db.insert(aiChatMessages).values(input as any);
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
