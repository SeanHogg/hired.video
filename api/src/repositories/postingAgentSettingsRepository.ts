/**
 * posting_agent_settings persistence (#2300).
 * CRUD operations for user-level AI Posting Agent configuration.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { postingAgentSettings, type PostingAgentSettingsRow, type PostingAgentSettingsInsert } from "../db/schema/distribution.js";

export type PostingAgentSettings = PostingAgentSettingsRow;

/** Get settings for a user (or null if not configured). */
export async function getSettings(userId: string, db: Db = getDb()): Promise<PostingAgentSettings | null> {
  const [row] = await db
    .select()
    .from(postingAgentSettings)
    .where(eq(postingAgentSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Create or update settings for a user. */
export async function upsertSettings(
  userId: string,
  settings: Partial<Omit<PostingAgentSettingsInsert, "userId" | "createdAt" | "updatedAt">>,
  db: Db = getDb(),
): Promise<PostingAgentSettings> {
  const now = new Date();
  const [row] = await db
    .insert(postingAgentSettings)
    .values({
      userId,
      ...settings,
    })
    .onConflictDoUpdate({
      target: postingAgentSettings.userId,
      set: {
        ...settings,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Enable the agent for a user. */
export async function enableAgent(userId: string, db: Db = getDb()): Promise<PostingAgentSettings> {
  const now = new Date();
  const [row] = await db
    .insert(postingAgentSettings)
    .values({
      userId,
      enabled: true,
      nextPlanAt: now, // plan immediately
    })
    .onConflictDoUpdate({
      target: postingAgentSettings.userId,
      set: {
        enabled: true,
        pausedReason: null,
        nextPlanAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Disable the agent for a user (inserts a paused row if none exists). */
export async function disableAgent(userId: string, reason: "user" | "plan" | "admin", db: Db = getDb()): Promise<PostingAgentSettings> {
  const now = new Date();
  const [row] = await db
    .insert(postingAgentSettings)
    .values({
      userId,
      enabled: false,
      pausedReason: reason,
      nextPlanAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: postingAgentSettings.userId,
      set: {
        enabled: false,
        pausedReason: reason,
        nextPlanAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Find users whose agent is due for planning. */
export async function findDueForPlanning(limit: number, db: Db = getDb()): Promise<PostingAgentSettings[]> {
  const now = new Date();
  return db
    .select()
    .from(postingAgentSettings)
    .where(sql`enabled = true AND (next_plan_at IS NULL OR next_plan_at <= ${now.toISOString()}::timestamptz)`)
    .for("update", { skipLocked: true })
    .limit(limit);
}

/** Update next_plan_at after planning. */
export async function updateNextPlanAt(userId: string, nextPlanAt: Date, db: Db = getDb()): Promise<void> {
  await db
    .update(postingAgentSettings)
    .set({ nextPlanAt, updatedAt: new Date() })
    .where(eq(postingAgentSettings.userId, userId));
}

/** Check if a user has an active agent (enabled and not paused). */
export async function isAgentActive(userId: string, db: Db = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ enabled: postingAgentSettings.enabled })
    .from(postingAgentSettings)
    .where(eq(postingAgentSettings.userId, userId))
    .limit(1);
  return row?.enabled ?? false;
}
