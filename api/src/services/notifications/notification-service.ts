/**
 * NotificationService.notify() — the single write path for durable
 * notifications. Consolidates the previously-bypassed flow: badge unlocks /
 * service inquiries called sendPushToUser() directly and persisted NOTHING,
 * so the existing `notifications` table (+ its route, smart feed, unread
 * count, bootstrap seed) never saw them and the bell had no history.
 *
 * notify() now:
 *   1. persists a row in the existing `notifications` table (analytics.ts)
 *   2. fans out the existing Web Push (transport unchanged — web-push.ts)
 *
 * Ephemeral realtime signals (game presence) stay on raw sendPushToUser —
 * they aren't worth a persisted row. One table, one pipeline; no second
 * notification system.
 */

import { getDb, schema } from "../../db/index.js";
import { sendPushToUser } from "../push/web-push.js";

export type NotificationType =
  | "badge"
  | "points"
  | "course"
  | "assignment"
  | "certificate"
  | "service_inquiry"
  | "review"
  | "system";

export interface NotifyInput {
  userId: string;
  /** Maps to notifications.type — drives icon + smart-feed weighting. */
  type: NotificationType;
  title: string;
  /** Maps to notifications.message (NOT NULL — defaults to title). */
  message?: string;
  /** Deep link opened on click. Stored in notifications.data.url. */
  url?: string;
  /** Optional source entity, stashed in notifications.data for "view source". */
  refType?: string;
  refId?: string;
  /** Set false to persist only (no Web Push). Default true. */
  push?: boolean;
}

export const NotificationService = {
  /** Persist a notification in the canonical `notifications` table + push it.
   *  Best-effort: a push failure never blocks the persisted row. */
  async notify(input: NotifyInput): Promise<string | null> {
    const db = getDb();
    const message = input.message ?? input.title;
    const data: Record<string, unknown> = {};
    if (input.url) data.url = input.url;
    if (input.refType) data.refType = input.refType;
    if (input.refId) data.refId = input.refId;

    let id: string | null = null;
    try {
      const [row] = await db
        .insert(schema.notifications)
        .values({
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 255),
          message,
          data: Object.keys(data).length > 0 ? data : null,
        } as any)
        .returning({ id: schema.notifications.id });
      id = row?.id ?? null;
    } catch {
      // Never let a persistence hiccup take down the action that triggered it.
      id = null;
    }

    if (input.push !== false) {
      await sendPushToUser(input.userId, {
        title: input.title,
        body: message,
        url: input.url,
      }).catch(() => undefined);
    }

    return id;
  },
};
