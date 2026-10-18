/**
 * NotificationsRepository — system-to-user alerts.
 *
 * Owns every read/write the `/api/notifications` surface, the bootstrap
 * aggregate and the inbox aggregator make against `notifications`, so
 * routes never touch the table directly (n-layer).
 */

import { and, count, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import { pickSelectShape } from "../../../shared/projection.js";
import { bumpInboxFor } from "../services/messaging/inboxCacheVersion.js";

const { notifications } = schema;

export type DbLike = any;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;

// Full row-select shape. `listForUser` subsets it to the caller's
// `?fields=` set so Neon only reads + ships those columns (gap #1445).
// Keys MUST match `NOTIFICATION_LIST_FIELDS` in shared/projection.ts.
const NOTIFICATION_SELECT_SHAPE = {
  id: notifications.id,
  type: notifications.type,
  title: notifications.title,
  message: notifications.message,
  isRead: notifications.isRead,
  createdAt: notifications.createdAt,
  data: notifications.data,
} as const;

export interface INotificationsRepository {
  findNotificationsForUser(userId: string, limit?: number): Promise<NotificationRow[]>;
  /** Projected list (newest first); `fields` null = every list column. */
  listForUser(userId: string, fields: readonly string[] | null, limit: number): Promise<Partial<NotificationRow>[]>;
  /** SQL COUNT — never ships the unread rows to the Worker. */
  countUnreadForUser(userId: string): Promise<number>;
  /** Newest unread rows (list columns), capped at `limit`. */
  listUnreadForUser(userId: string, limit: number): Promise<NotificationRow[]>;
  markAllReadForUser(userId: string): Promise<void>;
  markReadForUser(userId: string, notificationId: string): Promise<void>;
  deleteForUser(userId: string, notificationId: string): Promise<void>;
  /** Bulk insert in one round-trip. ONLY `services/notifications/
   *  notificationService.ts` (emitNotification/emitNotifications) may call
   *  this — every other writer goes through the dispatcher so the
   *  recipient's preferences + push/email fan-out are honoured. */
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
      .select({ ...NOTIFICATION_SELECT_SHAPE, userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as NotificationRow[];
  }

  async listForUser(
    userId: string,
    fields: readonly string[] | null,
    limit: number,
  ): Promise<Partial<NotificationRow>[]> {
    return (await this.db
      .select(pickSelectShape(NOTIFICATION_SELECT_SHAPE, fields))
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)) as Partial<NotificationRow>[];
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(row?.n ?? 0);
  }

  async listUnreadForUser(userId: string, limit: number): Promise<NotificationRow[]> {
    return (await this.db
      .select(NOTIFICATION_SELECT_SHAPE)
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)) as NotificationRow[];
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true } as any)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    bumpInboxFor([userId]);
  }

  async markReadForUser(userId: string, notificationId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true } as any)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    bumpInboxFor([userId]);
  }

  async deleteForUser(userId: string, notificationId: string): Promise<void> {
    await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    bumpInboxFor([userId]);
  }

  async insertNotifications(inputs: NotificationInsert[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.db.insert(notifications).values(inputs as any);
    bumpInboxFor(inputs.map((i) => i.userId));
  }
}
