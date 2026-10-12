/**
 * PushSubscriptionsRepository — browser Web Push endpoints per user
 * (`push_subscriptions`, migration 0002). One row per browser/device;
 * `endpoint` is globally unique, so a re-subscribe on the same browser
 * (or a device that changes hands between accounts) upserts onto the
 * existing row instead of duplicating it.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { pushSubscriptions } = schema;

export type DbLike = any;

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface IPushSubscriptionsRepository {
  listForUser(userId: string): Promise<PushSubscriptionRow[]>;
  /** Subscriptions for many users in ONE query, grouped by user id. Users
   *  with no subscriptions get an empty array. Empty input → no query. */
  listForUsers(userIds: readonly string[]): Promise<Map<string, PushSubscriptionRow[]>>;
  upsert(input: PushSubscriptionInput): Promise<void>;
  /** Owner-scoped removal (the user unsubscribing this browser). */
  deleteForUser(userId: string, endpoint: string): Promise<void>;
  /** Unscoped removal — the push service reported the endpoint gone. */
  deleteByEndpoint(endpoint: string): Promise<void>;
}

export class PushSubscriptionsRepository implements IPushSubscriptionsRepository {
  constructor(private readonly db: DbLike) {}

  async listForUser(userId: string): Promise<PushSubscriptionRow[]> {
    return this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async listForUsers(userIds: readonly string[]): Promise<Map<string, PushSubscriptionRow[]>> {
    const unique = [...new Set(userIds)];
    const out = new Map<string, PushSubscriptionRow[]>();
    for (const id of unique) out.set(id, []);
    if (unique.length === 0) return out;
    const rows: PushSubscriptionRow[] = await this.db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, unique));
    for (const row of rows) out.get(row.userId)?.push(row);
    return out;
  }

  async upsert(input: PushSubscriptionInput): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values(input)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
      });
  }

  async deleteForUser(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
}
