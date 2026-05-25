/**
 * CoffeeRequestsRepository — "Grab a coffee" proposal/accept aggregate.
 *
 * Owns the coffee_requests table plus the shared_task_participants
 * join that backs accountability on accept. The CoffeeRequestService
 * orchestrates the multi-table accept transaction (writes event,
 * attendees, task, participants) by calling out to:
 *   • this repo                                — coffee_requests row +
 *                                                 shared_task_participants
 *   • EventsRepository                         — scheduled_events row +
 *                                                 event_attendees
 *   • the tasks table (via insertTask here)
 *
 * See migration 0122_events_coffee_shared_tasks.sql for storage layout.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { coffeeRequests, sharedTaskParticipants, tasks } = schema;

export type DbLike = any;

export type CoffeeRequestRow = typeof coffeeRequests.$inferSelect;
export type CoffeeRequestInsert = typeof coffeeRequests.$inferInsert;
export type CoffeeRequestPatch = Partial<CoffeeRequestInsert>;

export type SharedTaskParticipantRow = typeof sharedTaskParticipants.$inferSelect;
export type SharedTaskParticipantInsert = typeof sharedTaskParticipants.$inferInsert;

export type TaskInsert = typeof tasks.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;

export interface ICoffeeRequestsRepository {
  findById(id: string): Promise<CoffeeRequestRow | null>;
  findPendingBetween(
    requesterUserId: string,
    recipientUserId: string,
  ): Promise<CoffeeRequestRow | null>;
  findIncomingForUser(userId: string, status?: string): Promise<CoffeeRequestRow[]>;
  findOutgoingForUser(userId: string, status?: string): Promise<CoffeeRequestRow[]>;
  insert(input: CoffeeRequestInsert): Promise<CoffeeRequestRow>;
  update(id: string, patch: CoffeeRequestPatch): Promise<CoffeeRequestRow | null>;

  // Shared task participants
  insertParticipant(input: SharedTaskParticipantInsert): Promise<void>;
  findParticipantsForTask(taskId: string): Promise<SharedTaskParticipantRow[]>;
  findSharedTasksForUser(userId: string): Promise<SharedTaskParticipantRow[]>;

  // Tasks (direct — shared-task creation lives here because it's part of
  // the coffee-accept transaction; a separate TasksRepository hasn't been
  // extracted yet).
  insertTask(input: TaskInsert): Promise<TaskRow>;
}

export class CoffeeRequestsRepository implements ICoffeeRequestsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findById(id: string): Promise<CoffeeRequestRow | null> {
    const [row] = await this.db
      .select()
      .from(coffeeRequests)
      .where(eq(coffeeRequests.id, id))
      .limit(1);
    return (row as CoffeeRequestRow | undefined) ?? null;
  }

  async findPendingBetween(
    requesterUserId: string,
    recipientUserId: string,
  ): Promise<CoffeeRequestRow | null> {
    const [row] = await this.db
      .select()
      .from(coffeeRequests)
      .where(
        and(
          eq(coffeeRequests.requesterUserId, requesterUserId),
          eq(coffeeRequests.recipientUserId, recipientUserId),
          eq(coffeeRequests.status, "pending"),
        ),
      )
      .limit(1);
    return (row as CoffeeRequestRow | undefined) ?? null;
  }

  async findIncomingForUser(userId: string, status?: string): Promise<CoffeeRequestRow[]> {
    const where = status
      ? and(eq(coffeeRequests.recipientUserId, userId), eq(coffeeRequests.status, status))
      : eq(coffeeRequests.recipientUserId, userId);
    return (await this.db
      .select()
      .from(coffeeRequests)
      .where(where)
      .orderBy(desc(coffeeRequests.createdAt))) as CoffeeRequestRow[];
  }

  async findOutgoingForUser(userId: string, status?: string): Promise<CoffeeRequestRow[]> {
    const where = status
      ? and(eq(coffeeRequests.requesterUserId, userId), eq(coffeeRequests.status, status))
      : eq(coffeeRequests.requesterUserId, userId);
    return (await this.db
      .select()
      .from(coffeeRequests)
      .where(where)
      .orderBy(desc(coffeeRequests.createdAt))) as CoffeeRequestRow[];
  }

  async insert(input: CoffeeRequestInsert): Promise<CoffeeRequestRow> {
    const [row] = await this.db
      .insert(coffeeRequests)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as CoffeeRequestRow;
  }

  async update(id: string, patch: CoffeeRequestPatch): Promise<CoffeeRequestRow | null> {
    const [row] = await this.db
      .update(coffeeRequests)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(coffeeRequests.id, id))
      .returning();
    return (row as CoffeeRequestRow | undefined) ?? null;
  }

  async insertParticipant(input: SharedTaskParticipantInsert): Promise<void> {
    await this.db.insert(sharedTaskParticipants).values(input as any).onConflictDoNothing();
  }

  async findParticipantsForTask(taskId: string): Promise<SharedTaskParticipantRow[]> {
    return (await this.db
      .select()
      .from(sharedTaskParticipants)
      .where(eq(sharedTaskParticipants.taskId, taskId))) as SharedTaskParticipantRow[];
  }

  async findSharedTasksForUser(userId: string): Promise<SharedTaskParticipantRow[]> {
    return (await this.db
      .select()
      .from(sharedTaskParticipants)
      .where(eq(sharedTaskParticipants.userId, userId))
      .orderBy(desc(sharedTaskParticipants.createdAt))) as SharedTaskParticipantRow[];
  }

  async insertTask(input: TaskInsert): Promise<TaskRow> {
    const [row] = await this.db
      .insert(tasks)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as TaskRow;
  }
}
