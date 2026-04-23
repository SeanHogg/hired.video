/**
 * ConversationsRepository — user-to-user and user-to-AI messaging.
 *
 * Covers:
 *   • conversationParticipants — DM thread membership
 *   • aiChatSessions           — AI chat session state
 *   • aiChatMessages           — per-message body / role
 *   • businessPhoneNumbers     — per-user outbound phone provisioning
 *   • callLogs                 — call history
 *
 * Grouped because they're all "an ongoing exchange between two
 * parties" — different channels, same conversational shape.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  conversationParticipants,
  aiChatSessions,
  aiChatMessages,
  businessPhoneNumbers,
  callLogs,
} = schema;

export type DbLike = any;

export type ConversationParticipantRow = typeof conversationParticipants.$inferSelect;
export type ConversationParticipantInsert = typeof conversationParticipants.$inferInsert;
export type AiChatSessionRow = typeof aiChatSessions.$inferSelect;
export type AiChatSessionInsert = typeof aiChatSessions.$inferInsert;
export type AiChatMessageRow = typeof aiChatMessages.$inferSelect;
export type AiChatMessageInsert = typeof aiChatMessages.$inferInsert;
export type BusinessPhoneNumberRow = typeof businessPhoneNumbers.$inferSelect;
export type BusinessPhoneNumberInsert = typeof businessPhoneNumbers.$inferInsert;
export type CallLogRow = typeof callLogs.$inferSelect;
export type CallLogInsert = typeof callLogs.$inferInsert;

export interface IConversationsRepository {
  findConversationsForUser(userId: string): Promise<ConversationParticipantRow[]>;
  insertConversationParticipant(input: ConversationParticipantInsert): Promise<void>;
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

  async findConversationsForUser(userId: string): Promise<ConversationParticipantRow[]> {
    return (await this.db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId))) as ConversationParticipantRow[];
  }

  async insertConversationParticipant(input: ConversationParticipantInsert): Promise<void> {
    await this.db.insert(conversationParticipants).values(input as any);
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
