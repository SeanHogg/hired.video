/**
 * AI game-builder chat threads (gap #1638) — `game_agent_conversations`, one
 * row per game project. The turn use case (services/studio/game-agent.ts)
 * owns the message shape and history policy; this module owns the SQL.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { gameAgentConversations } = schema;

export type GameAgentConversationRow = typeof gameAgentConversations.$inferSelect;

export async function findGameAgentConversation(db: Db, projectId: string): Promise<GameAgentConversationRow | null> {
  const [row] = await db
    .select()
    .from(gameAgentConversations)
    .where(eq(gameAgentConversations.projectId, projectId))
    .limit(1);
  return row ?? null;
}

export async function insertGameAgentConversation(
  db: Db,
  values: { projectId: string; userId: string; messages: unknown[]; tokensSpent: number },
): Promise<void> {
  await db.insert(gameAgentConversations).values(values);
}

export async function updateGameAgentConversation(
  db: Db,
  id: string,
  patch: { messages: unknown[]; tokensSpent: number; updatedAt: Date },
): Promise<void> {
  await db.update(gameAgentConversations).set(patch).where(eq(gameAgentConversations.id, id));
}
