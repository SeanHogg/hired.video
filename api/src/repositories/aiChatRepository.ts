/**
 * AiChatRepository — the legacy user-to-AI chat channel
 * (`ai_chat_sessions` + `ai_chat_messages`), split out of
 * ConversationsRepository so that repository stays focused on
 * user-to-user threads.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { aiChatSessions, aiChatMessages } = schema;

export type DbLike = any;

export type AiChatSessionRow = typeof aiChatSessions.$inferSelect;
export type AiChatSessionInsert = typeof aiChatSessions.$inferInsert;
export type AiChatMessageRow = typeof aiChatMessages.$inferSelect;
export type AiChatMessageInsert = typeof aiChatMessages.$inferInsert;

export interface IAiChatRepository {
  /** Newest-first sessions, capped at `limit` (default 50, max 200). */
  findAiChatSessionsForUser(userId: string, limit?: number): Promise<AiChatSessionRow[]>;
  /** Every session the user owns, oldest first (legacy `POST /api/messages`). */
  findAllAiChatSessionsForUserOldestFirst(userId: string): Promise<AiChatSessionRow[]>;
  /** Any one session the user owns (legacy single-session chat), or null. */
  findAnyAiChatSessionForUser(userId: string): Promise<AiChatSessionRow | null>;
  insertAiChatSession(input: AiChatSessionInsert): Promise<AiChatSessionRow>;
  findAiChatMessages(sessionId: string): Promise<AiChatMessageRow[]>;
  insertAiChatMessage(input: AiChatMessageInsert): Promise<void>;
  /** Newest-updated-first public summaries (no `model` / `systemPrompt`). */
  findAiChatSessionSummariesForUser(userId: string, limit: number): Promise<AiChatSessionSummary[]>;
  findAiChatSessionById(id: string): Promise<AiChatSessionRow | null>;
  /** The session id when `id` exists AND is owned by `userId`, else null. */
  findOwnedAiChatSessionId(id: string, userId: string): Promise<string | null>;
  touchAiChatSession(id: string): Promise<void>;
  deleteAiChatSession(id: string): Promise<void>;
  /** The last `limit` messages (role + content), oldest first. */
  findRecentAiChatTurns(sessionId: string, limit: number): Promise<Array<{ role: string; content: string }>>;
}

export interface AiChatSessionSummary {
  id: string;
  title: AiChatSessionRow["title"];
  isActive: AiChatSessionRow["isActive"];
  createdAt: AiChatSessionRow["createdAt"];
  updatedAt: AiChatSessionRow["updatedAt"];
}

export class AiChatRepository implements IAiChatRepository {
  constructor(private readonly db: DbLike) {}

  async findAiChatSessionsForUser(userId: string, limit = 50): Promise<AiChatSessionRow[]> {
    return (await this.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(desc(aiChatSessions.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as AiChatSessionRow[];
  }

  async findAllAiChatSessionsForUserOldestFirst(userId: string): Promise<AiChatSessionRow[]> {
    return (await this.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(asc(aiChatSessions.createdAt))) as AiChatSessionRow[];
  }

  async findAnyAiChatSessionForUser(userId: string): Promise<AiChatSessionRow | null> {
    const [row] = await this.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .limit(1);
    return (row as AiChatSessionRow) ?? null;
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

  async findAiChatSessionSummariesForUser(userId: string, limit: number): Promise<AiChatSessionSummary[]> {
    return (await this.db
      .select({
        id: aiChatSessions.id,
        title: aiChatSessions.title,
        isActive: aiChatSessions.isActive,
        createdAt: aiChatSessions.createdAt,
        updatedAt: aiChatSessions.updatedAt,
      })
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(desc(aiChatSessions.updatedAt))
      .limit(limit)) as AiChatSessionSummary[];
  }

  async findAiChatSessionById(id: string): Promise<AiChatSessionRow | null> {
    const [row] = await this.db.select().from(aiChatSessions).where(eq(aiChatSessions.id, id)).limit(1);
    return (row as AiChatSessionRow) ?? null;
  }

  async findOwnedAiChatSessionId(id: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: aiChatSessions.id })
      .from(aiChatSessions)
      .where(and(eq(aiChatSessions.id, id), eq(aiChatSessions.userId, userId)))
      .limit(1);
    return (row?.id as string | undefined) ?? null;
  }

  async touchAiChatSession(id: string): Promise<void> {
    await this.db.update(aiChatSessions).set({ updatedAt: new Date() } as any).where(eq(aiChatSessions.id, id));
  }

  async deleteAiChatSession(id: string): Promise<void> {
    await this.db.delete(aiChatSessions).where(eq(aiChatSessions.id, id));
  }

  async findRecentAiChatTurns(sessionId: string, limit: number): Promise<Array<{ role: string; content: string }>> {
    const rows = (await this.db
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(limit)) as Array<{ role: string; content: string }>;
    return rows.reverse();
  }
}
