/**
 * NotificationsRepository — system-to-user alerts and task list.
 *
 * Covers:
 *   • notifications — "you got a connection request" etc.
 *   • tasks         — per-user action items
 *
 * Separate from Conversations (user-to-user) and FollowUps (scheduled
 * outbound) because the lifecycle differs: notifications are
 * dismissable events, tasks have status progression, neither has a
 * reply/thread model the way conversations do.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { notifications, tasks } = schema;

export type DbLike = any;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;

export interface INotificationsRepository {
  findNotificationsForUser(userId: string, limit?: number): Promise<NotificationRow[]>;
  insertNotification(input: NotificationInsert): Promise<void>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsReadForUser(userId: string): Promise<void>;
  findTasksForUser(userId: string): Promise<TaskRow[]>;
  insertTask(input: TaskInsert): Promise<TaskRow>;
  updateTask(id: string, userId: string, patch: Partial<TaskInsert>): Promise<void>;
}

export class NotificationsRepository implements INotificationsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findNotificationsForUser(userId: string, limit = 50): Promise<NotificationRow[]> {
    return (await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as NotificationRow[];
  }

  async insertNotification(input: NotificationInsert): Promise<void> {
    await this.db.insert(notifications).values(input as any);
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true, readAt: this.now() } as any)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsReadForUser(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true, readAt: this.now() } as any)
      .where(eq(notifications.userId, userId));
  }

  async findTasksForUser(userId: string): Promise<TaskRow[]> {
    return (await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt))) as TaskRow[];
  }

  async insertTask(input: TaskInsert): Promise<TaskRow> {
    const [row] = await this.db.insert(tasks).values(input as any).returning();
    return row as TaskRow;
  }

  async updateTask(id: string, userId: string, patch: Partial<TaskInsert>): Promise<void> {
    await this.db
      .update(tasks)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
}
