/**
 * PersonalTasksRepository — the personal-kanban view over `tasks`
 * (routes/task.ts). Every read/delete filters `segment_id IS NULL`: segment-
 * scoped CHRO action items share the table (see PeopleActionItemsRepository)
 * and must never leak into a user's personal task list.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { tasks } = schema;

export type PersonalTaskRow = typeof tasks.$inferSelect;
export type PersonalTaskInsert = typeof tasks.$inferInsert;
export type PersonalTaskPatch = Pick<
  PersonalTaskInsert,
  "title" | "description" | "metadata" | "status" | "completedAt" | "updatedAt"
>;

export interface IPersonalTasksRepository {
  listForUser(userId: string): Promise<PersonalTaskRow[]>;
  findForUser(id: string, userId: string): Promise<PersonalTaskRow | null>;
  /** Patch a row already confirmed owned via findForUser. */
  update(id: string, patch: PersonalTaskPatch): Promise<PersonalTaskRow>;
  insert(values: PersonalTaskInsert): Promise<PersonalTaskRow>;
  deleteForUser(id: string, userId: string): Promise<void>;
}

function personalScope(userId: string) {
  return and(eq(tasks.userId, userId), isNull(tasks.segmentId));
}

export class PersonalTasksRepository implements IPersonalTasksRepository {
  constructor(private readonly db: Db) {}

  async listForUser(userId: string): Promise<PersonalTaskRow[]> {
    return this.db.select().from(tasks).where(personalScope(userId)).orderBy(desc(tasks.createdAt));
  }

  async findForUser(id: string, userId: string): Promise<PersonalTaskRow | null> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), personalScope(userId)))
      .limit(1);
    return row ?? null;
  }

  async update(id: string, patch: PersonalTaskPatch): Promise<PersonalTaskRow> {
    const [row] = await this.db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    return row;
  }

  async insert(values: PersonalTaskInsert): Promise<PersonalTaskRow> {
    const [row] = await this.db.insert(tasks).values(values).returning();
    return row;
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    await this.db.delete(tasks).where(and(eq(tasks.id, id), personalScope(userId)));
  }
}
