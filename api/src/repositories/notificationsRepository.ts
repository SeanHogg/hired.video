/**
 * NotificationsRepository — system-to-user alerts.
 *
 * Two methods used in production: `insertNotification` (from the
 * notification service) and `findNotificationsForUser` (from the inbox
 * aggregator). The mark-read paths historically lived here but the
 * live route in `routes/notifications.ts` updates the DB directly, and
 * the repo variants set a non-existent `read_at` column — so they were
 * dropped. Tasks live in `routes/task.ts` and read `schema.tasks`
 * directly; no repo method survived from that surface either.
 */

import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { notifications } = schema;

export type DbLike = any;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;

export interface INotificationsRepository {
  findNotificationsForUser(userId: string, limit?: number): Promise<NotificationRow[]>;
  insertNotification(input: NotificationInsert): Promise<void>;
  /** Bulk insert in one round-trip — used by the inbox action engine so
   *  a chunk of `notify` effects collapses to a single write (no N+1). */
  insertNotifications(inputs: NotificationInsert[]): Promise<void>;
}

export class NotificationsRepository implements INotificationsRepository {
  constructor(private readonly db: DbLike, _now: () => Date = () => new Date()) {
    // `_now` kept for factory-signature parity with the other repos
    // (see `repositories/index.ts`); not consumed since this repo has
    // no timestamp-stamping writes after the read_at cleanup.
    void _now;
  }

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

  async insertNotifications(inputs: NotificationInsert[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.db.insert(notifications).values(inputs as any);
  }
}
