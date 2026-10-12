/**
 * PersonMergeRepository — duplicate-contact review queue
 * (`person_merge_queue`) + the owner's merge policy
 * (`workspace_person_merge_policy`, keyed by the owner's personal
 * workspace). Migrations 0123 + 0493.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { personMergeQueue, workspacePersonMergePolicy, workspaces } = schema;

export type DbLike = any;

export type PersonMergeQueueRow = typeof personMergeQueue.$inferSelect;
export type MergePolicyRow = typeof workspacePersonMergePolicy.$inferSelect;

export interface MergeQueueInsert {
  workspaceId: string | null;
  ownerUserId: string;
  targetPersonId: string;
  sourcePersonId: string;
  confidenceBps: number;
  status: string;
  decidedAt?: Date | null;
  decidedBy?: string | null;
}

export interface IPersonMergeRepository {
  findPersonalWorkspaceId(ownerUserId: string): Promise<string | null>;
  ensurePersonalWorkspaceId(ownerUserId: string): Promise<string>;
  findPolicy(workspaceId: string): Promise<MergePolicyRow | null>;
  upsertPolicy(workspaceId: string, mode: string, autoThresholdBps: number): Promise<MergePolicyRow>;
  /** No-op when the pair was already queued (pending OR decided). */
  enqueue(row: MergeQueueInsert): Promise<PersonMergeQueueRow | null>;
  listPending(ownerUserId: string): Promise<PersonMergeQueueRow[]>;
  findById(ownerUserId: string, id: string): Promise<PersonMergeQueueRow | null>;
  decide(id: string, status: string, decidedBy: string): Promise<void>;
}

const PENDING_LIST_LIMIT = 100;

export class PersonMergeRepository implements IPersonMergeRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findPersonalWorkspaceId(ownerUserId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, ownerUserId))
      .limit(1);
    return row?.id ?? null;
  }

  async ensurePersonalWorkspaceId(ownerUserId: string): Promise<string> {
    const existing = await this.findPersonalWorkspaceId(ownerUserId);
    if (existing) return existing;
    const [row] = await this.db.insert(workspaces).values({ ownerUserId }).returning({ id: workspaces.id });
    return row.id;
  }

  async findPolicy(workspaceId: string): Promise<MergePolicyRow | null> {
    const [row] = await this.db
      .select()
      .from(workspacePersonMergePolicy)
      .where(eq(workspacePersonMergePolicy.workspaceId, workspaceId))
      .limit(1);
    return row ?? null;
  }

  async upsertPolicy(workspaceId: string, mode: string, autoThresholdBps: number): Promise<MergePolicyRow> {
    const [row] = await this.db
      .insert(workspacePersonMergePolicy)
      .values({ workspaceId, mode, autoThresholdBps })
      .onConflictDoUpdate({
        target: workspacePersonMergePolicy.workspaceId,
        set: { mode, autoThresholdBps, updatedAt: this.now() },
      })
      .returning();
    return row;
  }

  async enqueue(row: MergeQueueInsert): Promise<PersonMergeQueueRow | null> {
    const [inserted] = await this.db.insert(personMergeQueue).values(row).onConflictDoNothing().returning();
    return inserted ?? null;
  }

  async listPending(ownerUserId: string): Promise<PersonMergeQueueRow[]> {
    return this.db
      .select()
      .from(personMergeQueue)
      .where(and(eq(personMergeQueue.ownerUserId, ownerUserId), eq(personMergeQueue.status, "pending")))
      .orderBy(desc(personMergeQueue.createdAt))
      .limit(PENDING_LIST_LIMIT);
  }

  async findById(ownerUserId: string, id: string): Promise<PersonMergeQueueRow | null> {
    const [row] = await this.db
      .select()
      .from(personMergeQueue)
      .where(and(eq(personMergeQueue.id, id), eq(personMergeQueue.ownerUserId, ownerUserId)))
      .limit(1);
    return row ?? null;
  }

  async decide(id: string, status: string, decidedBy: string): Promise<void> {
    await this.db
      .update(personMergeQueue)
      .set({ status, decidedBy, decidedAt: this.now() })
      .where(eq(personMergeQueue.id, id));
  }
}
