/**
 * InboxActionsRepository + InboxActionRunsRepository — the L2 action
 * engine's data access (#1981).
 *
 *   • inbox_actions     — per-profile (trigger)→handler config (CRUD).
 *   • inbox_action_runs — append-only audit; `recordRuns` is idempotent
 *     (ON CONFLICT (message_id, action_id) DO NOTHING) so re-sync never
 *     double-fires a handler.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { inboxActions, inboxActionRuns } = schema;

export type DbLike = any;

export type InboxActionRow = typeof inboxActions.$inferSelect;
export type InboxActionInsert = typeof inboxActions.$inferInsert;
export type InboxActionPatch = Partial<InboxActionInsert>;

export type InboxActionRunRow = typeof inboxActionRuns.$inferSelect;
export type InboxActionRunInsert = typeof inboxActionRuns.$inferInsert;

export interface IInboxActionsRepository {
  findEnabledForProfile(profileId: string): Promise<InboxActionRow[]>;
  findAllForProfile(profileId: string): Promise<InboxActionRow[]>;
  findById(id: string): Promise<InboxActionRow | null>;
  insert(input: InboxActionInsert): Promise<InboxActionRow>;
  patchOwned(id: string, ownerId: string, patch: InboxActionPatch): Promise<InboxActionRow | null>;
  removeOwned(id: string, ownerId: string): Promise<void>;
}

export class InboxActionsRepository implements IInboxActionsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findEnabledForProfile(profileId: string): Promise<InboxActionRow[]> {
    return (await this.db
      .select()
      .from(inboxActions)
      .where(and(eq(inboxActions.profileId, profileId), eq(inboxActions.isEnabled, true)))
      .orderBy(asc(inboxActions.priority))) as InboxActionRow[];
  }

  async findAllForProfile(profileId: string): Promise<InboxActionRow[]> {
    return (await this.db
      .select()
      .from(inboxActions)
      .where(eq(inboxActions.profileId, profileId))
      .orderBy(asc(inboxActions.priority))) as InboxActionRow[];
  }

  async findById(id: string): Promise<InboxActionRow | null> {
    const rows = (await this.db
      .select()
      .from(inboxActions)
      .where(eq(inboxActions.id, id))
      .limit(1)) as InboxActionRow[];
    return rows[0] ?? null;
  }

  async insert(input: InboxActionInsert): Promise<InboxActionRow> {
    const [row] = await this.db.insert(inboxActions).values(input as any).returning();
    return row as InboxActionRow;
  }

  async patchOwned(
    id: string,
    ownerId: string,
    patch: InboxActionPatch,
  ): Promise<InboxActionRow | null> {
    const rows = (await this.db
      .update(inboxActions)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(inboxActions.id, id), eq(inboxActions.ownerId, ownerId)))
      .returning()) as InboxActionRow[];
    return rows[0] ?? null;
  }

  async removeOwned(id: string, ownerId: string): Promise<void> {
    await this.db
      .delete(inboxActions)
      .where(and(eq(inboxActions.id, id), eq(inboxActions.ownerId, ownerId)));
  }
}

export interface IInboxActionRunsRepository {
  /** Bulk-insert run audit rows, idempotent on (message_id, action_id).
   *  Returns the rows actually inserted (conflicts are silently skipped). */
  recordRuns(inputs: InboxActionRunInsert[]): Promise<InboxActionRunRow[]>;
  findByMessageIds(messageIds: string[]): Promise<InboxActionRunRow[]>;
  findRecentForUser(userId: string, limit?: number): Promise<InboxActionRunRow[]>;
}

export class InboxActionRunsRepository implements IInboxActionRunsRepository {
  constructor(private readonly db: DbLike) {}

  async recordRuns(inputs: InboxActionRunInsert[]): Promise<InboxActionRunRow[]> {
    if (inputs.length === 0) return [];
    return (await this.db
      .insert(inboxActionRuns)
      .values(inputs as any)
      .onConflictDoNothing({
        target: [inboxActionRuns.messageId, inboxActionRuns.actionId],
      })
      .returning()) as InboxActionRunRow[];
  }

  async findByMessageIds(messageIds: string[]): Promise<InboxActionRunRow[]> {
    if (messageIds.length === 0) return [];
    return (await this.db
      .select()
      .from(inboxActionRuns)
      .where(inArray(inboxActionRuns.messageId, messageIds))) as InboxActionRunRow[];
  }

  async findRecentForUser(userId: string, limit = 50): Promise<InboxActionRunRow[]> {
    return (await this.db
      .select()
      .from(inboxActionRuns)
      .where(eq(inboxActionRuns.userId, userId))
      .orderBy(desc(inboxActionRuns.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as InboxActionRunRow[];
  }
}
