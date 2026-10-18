/**
 * The signed-in user's notification feed (the /api/notifications routes):
 * list, unread count (isolate-cached), read/delete mutations and the
 * AI-ranked "smart" feed. Writes go through NotificationsRepository, which
 * bumps the inbox cache version on every write.
 */
import { getDb } from "../../db/index.js";
import {
  NotificationsRepository,
  type NotificationRow,
} from "../../repositories/notificationsRepository.js";
import { getCachedUnreadCount } from "../messaging/inboxCache.js";

function repo(): NotificationsRepository {
  return new NotificationsRepository(getDb());
}

export function listNotifications(
  userId: string,
  fields: readonly string[] | null,
  limit = 50,
): Promise<Partial<NotificationRow>[]> {
  return repo().listForUser(userId, fields, limit);
}

/** Newest unread notifications (the SSE hub's burst). With `since` (the
 *  client's poll cursor) only rows created at/after it — so a 60s re-poll
 *  costs a tiny range scan instead of re-sending every unread row. */
export function listUnreadNotifications(
  userId: string,
  limit = 50,
  since: Date | null = null,
): Promise<NotificationRow[]> {
  return repo().listUnreadForUser(userId, limit, since);
}

/** Overlap applied to the client's cursor: an insert whose transaction
 *  began before the previous poll (so its created_at is older than the
 *  newest row that poll saw) but committed after it is still picked up.
 *  The client dedupes the re-sent rows by id. */
export const NOTIFICATION_CURSOR_OVERLAP_MS = 10_000;

/** Parse the hub's `since` query param (an ISO timestamp) into the lower
 *  bound for the poll, or null for a full unread burst. The bound is the
 *  cursor minus the overlap, clamped to now so a bogus future cursor can't
 *  hide new rows. */
export function parseNotificationCursor(raw: string | undefined | null, now: Date = new Date()): Date | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.min(ms, now.getTime()) - NOTIFICATION_CURSOR_OVERLAP_MS);
}

/** The cursor the client should send next: the newest returned row's
 *  createdAt, else the bound this poll used (overlap re-added), else null
 *  (no unread rows yet — the next poll is a cheap full burst). */
export function notificationCursorFrom(
  rows: ReadonlyArray<{ createdAt: Date | string | null }>,
  since: Date | null,
): string | null {
  let newest = -Infinity;
  for (const r of rows) {
    const ms = r.createdAt == null ? NaN : new Date(r.createdAt).getTime();
    if (Number.isFinite(ms) && ms > newest) newest = ms;
  }
  if (Number.isFinite(newest)) return new Date(newest).toISOString();
  return since ? new Date(since.getTime() + NOTIFICATION_CURSOR_OVERLAP_MS).toISOString() : null;
}

export function countUnreadNotifications(userId: string): Promise<number> {
  return getCachedUnreadCount(repo(), userId);
}

export function markAllNotificationsRead(userId: string): Promise<void> {
  return repo().markAllReadForUser(userId);
}

export function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  return repo().markReadForUser(userId, notificationId);
}

export function deleteNotification(userId: string, notificationId: string): Promise<void> {
  return repo().deleteForUser(userId, notificationId);
}

// Priority weights (higher = more important):
//   match/interview/offer  → 10
//   message/application    → 7
//   review/feedback        → 5
//   system/general         → 2
// Recency bonus: +5 if < 1 hour old, +3 if < 24 hours, +1 if < 7 days.
// Unread bonus: +4 if unread.
const TYPE_WEIGHT: Record<string, number> = {
  match: 10,
  interview: 10,
  offer: 10,
  message: 7,
  application: 7,
  review: 5,
  feedback: 5,
  system: 2,
  general: 2,
};

function priorityScore(n: { type?: string | null; isRead?: boolean | null; createdAt?: Date | string | null }): number {
  const typeKey = (n.type ?? "general").toLowerCase();
  let score = TYPE_WEIGHT[typeKey] ?? 2;
  if (!n.isRead) score += 4;
  const ageMs = Date.now() - new Date(n.createdAt ?? 0).getTime();
  if (ageMs < 60 * 60 * 1000) score += 5;
  else if (ageMs < 24 * 60 * 60 * 1000) score += 3;
  else if (ageMs < 7 * 24 * 60 * 60 * 1000) score += 1;
  return score;
}

/** The 50 most actionable of the user's latest 100 notifications, ranked by
 *  type weight + recency + unread, regardless of creation order. */
export async function rankNotifications(userId: string): Promise<Array<NotificationRow & { priorityScore: number }>> {
  const rows = await repo().findNotificationsForUser(userId, 100);
  return rows
    .map((n) => ({ ...n, priorityScore: priorityScore(n) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 50);
}
