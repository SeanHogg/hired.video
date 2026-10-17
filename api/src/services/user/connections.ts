/**
 * Connection use cases behind `/api/users/*connections*`: send / accept /
 * remove a request, list accepted + pending, single + batch status, and the
 * viewer's connections as People cards (+ typeahead search).
 *
 * Caches: the viewer's accepted-connection id set and card list are
 * read-through cached per viewer (isolate edge cache) and invalidated on
 * accept/remove for BOTH sides (#802).
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { sendConnectionRequestEmail } from "../adapters/email/senders/network.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";
import { bumpInboxFor } from "../messaging/inboxCacheVersion.js";
import type { GamificationService } from "../../domains/gamification/index.js";
import { logger } from "../../lib/logger.js";
import {
  acceptIncoming,
  deleteForParticipant,
  findAcceptedConnectionUserIds,
  findAcceptedConnections,
  findBetweenViewerAndMany,
  findPendingIncoming,
} from "../../repositories/userConnectionsRepository.js";
import { findActiveCardRowsByIds } from "../../repositories/userCardsRepository.js";
import { cardRowToDto, makeConnectionDto } from "./userDtos.js";

export const SendConnectionRequestSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().optional(),
});

export type SendConnectionRequestInput = z.infer<typeof SendConnectionRequestSchema>;

const connCardsKey = (userId: string) => `conns:cards:${userId}`;
const connIdsKey = (userId: string) => `conns:ids:${userId}`;

function invalidateConnectionCaches(...userIds: string[]): void {
  for (const id of userIds) invalidateIsolateKey(connCardsKey(id));
  for (const id of userIds) invalidateIsolateKey(connIdsKey(id));
}

/** The viewer's accepted-connection user ids — the stable, expensive part of the
 *  connections graph. Read-through cached per viewer + invalidated on
 *  accept/remove (same lifecycle as the card list), so the typeahead search
 *  doesn't re-walk `user_connections` on every keystroke. Bounded by the
 *  viewer's connection count. */
function loadConnectionIds(me: string): Promise<string[]> {
  return getOrSetIsolateCached({
    key: connIdsKey(me),
    ttlSeconds: 120,
    loader: () => findAcceptedConnectionUserIds(me),
  });
}

/** POST /connections — send a request (idempotent across both directions). */
export async function sendConnectionRequest(from: string, input: SendConnectionRequestInput) {
  if (from === input.toUserId) {
    throw new DomainError(400, "BAD_REQUEST", "Cannot send connection request to yourself");
  }
  const db = getDb();
  const repos = buildRepos(db);

  // Prevent duplicates: if a connection already exists in either direction, return it.
  const existing = await repos.users.findConnection(from, input.toUserId);
  if (existing) return { status: 200 as const, connection: makeConnectionDto(existing) };

  const conn = await repos.users.insertConnection({
    fromUserId: from,
    toUserId: input.toUserId,
    status: "pending",
    requestMessage: input.message ?? null,
  });

  // Fire-and-forget side effects: inbox notification + email. Don't block the response.
  (async () => {
    try {
      const { actor, actorName } = await resolveActor({ repos }, from);
      const [recipient] = await repos.users.findManyByIds([input.toUserId]);

      const message = input.message?.trim();
      await emitNotification(
        { repos },
        {
          recipientIds: [input.toUserId],
          type: "connection_request",
          actor,
          title: `${actorName} wants to connect`,
          message: message || `${actorName} sent you a connection request.`,
          target: { id: conn.id, type: "connection" },
        },
      ).catch((err) => logger.error("[connections] notification insert failed", err));

      if (recipient?.email) {
        await sendConnectionRequestEmail(
          recipient.email,
          recipient.name ?? "there",
          actorName,
          from,
          input.message ?? null,
        ).catch((err) => logger.error("[connections] email send failed", err));
      }
    } catch (err) {
      logger.error("[connections] post-send side effects failed", err);
    }
  })();

  return { status: 201 as const, connection: makeConnectionDto(conn) };
}

/** Accepted connections of `userId` (self or any user) as connection DTOs. */
export async function listAcceptedConnections(userId: string) {
  const list = await findAcceptedConnections(userId);
  return list.map((row) => makeConnectionDto(row));
}

/** The viewer's accepted connections as People cards (#802). Your own
 *  connections are visible regardless of public-directory visibility. */
export function listConnectionCards(me: string) {
  return getOrSetIsolateCached({
    key: connCardsKey(me),
    ttlSeconds: 120,
    loader: async () => {
      const otherIds = await loadConnectionIds(me);
      if (otherIds.length === 0) return [];
      return (await findActiveCardRowsByIds(otherIds)).map(cardRowToDto);
    },
  });
}

/** Typeahead over the viewer's accepted connections. The id SET is cached;
 *  the per-query filter runs live and bounded (id IN set + LIMIT) — not
 *  cached per `q` (unbounded keyspace). */
export async function searchConnectionCards(me: string, q: string, limit: number) {
  const otherIds = await loadConnectionIds(me);
  if (otherIds.length === 0) return [];
  const rows = await findActiveCardRowsByIds(otherIds, { q: q || undefined, limit, orderByName: true });
  return rows.map(cardRowToDto);
}

/** Pending requests addressed to the viewer, each with its sender actor. */
export async function listPendingConnections(me: string) {
  const repos = buildRepos(getDb());
  const rows = await findPendingIncoming(me);
  // One actor lookup for the whole batch — far cheaper than a join per row
  // and keeps the actor projection identical to every other notification
  // surface.
  const senderIds = [...new Set(rows.map((r) => r.fromUserId))];
  const actors = await repos.users.findActorsByIds(senderIds);
  const actorById = new Map(actors.map((a) => [a.id, a]));
  return rows.map((row) => makeConnectionDto(row, { fromUser: actorById.get(row.fromUserId) ?? null }));
}

/** PUT /connections/:id/accept — only the recipient may accept. */
export async function acceptConnection(id: string, me: string, getGame: () => GamificationService) {
  const updated = await acceptIncoming(id, me);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Connection request not found");

  // Both sides just gained a connection — drop their cached card + id lists (#802).
  invalidateConnectionCaches(me, updated.fromUserId);
  // The request leaves the accepter's inbox "pending" list.
  bumpInboxFor([me]);

  // Notify the original sender that their request was accepted.
  (async () => {
    try {
      const repos = buildRepos(getDb());
      const { actor, actorName } = await resolveActor({ repos }, me);
      await emitNotification(
        { repos },
        {
          recipientIds: [updated.fromUserId],
          type: "connection_accepted",
          actor,
          title: `${actorName} accepted your connection request`,
          message: `You and ${actorName} are now connected on hired.video.`,
          target: { id: updated.id, type: "connection" },
        },
      ).catch((err) => logger.error("[connections] accept notification failed", err));

      // #1258 — if both users attended the same event in the last 30 days,
      // reward the networking the event drove (both sides earn once).
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sharedEventId = await repos.events
        .findSharedRecentEvent(me, updated.fromUserId, thirtyDaysAgo)
        .catch(() => null);
      if (sharedEventId) {
        const game = getGame();
        await Promise.all([
          game
            .onEventConnectionMade({ userId: me, connectionId: updated.id, eventId: sharedEventId })
            .catch(() => undefined),
          game
            .onEventConnectionMade({
              userId: updated.fromUserId,
              connectionId: updated.id,
              eventId: sharedEventId,
            })
            .catch(() => undefined),
        ]);
      }
    } catch (err) {
      logger.error("[connections] accept side effects failed", err);
    }
  })();

  return makeConnectionDto(updated);
}

/** DELETE /connections/:id — either side may remove; a miss is a silent no-op. */
export async function removeConnection(id: string, me: string): Promise<null> {
  const removed = await deleteForParticipant(id, me);
  // Drop both sides' cached card + id lists so a removed connection disappears (#802).
  if (removed) invalidateConnectionCaches(removed.fromUserId, removed.toUserId);
  return null;
}

/** GET /connections/status — any-status link between two users. */
export async function getConnectionStatus(fromUserId: string, toUserId: string) {
  const found = await buildRepos(getDb()).users.findConnection(fromUserId, toUserId);
  if (!found) return { connected: false, status: "none" };
  return { connected: true, ...makeConnectionDto(found) };
}

/** POST /connections/statuses — batch lookup (capped at 100 ids). */
export async function getConnectionStatuses(me: string, requestedIds: string[]) {
  const userIds = requestedIds.slice(0, 100); // cap at 100
  const statuses: Record<string, { connected: boolean; status: string; id?: string; fromUserId?: string }> = {};
  if (userIds.length === 0) return statuses;

  const rows = await findBetweenViewerAndMany(me, userIds);
  for (const id of userIds) {
    statuses[id] = { connected: false, status: "none" };
  }
  for (const row of rows) {
    const otherId = row.fromUserId === me ? row.toUserId : row.fromUserId;
    statuses[otherId] = { connected: true, ...makeConnectionDto(row) };
  }
  return statuses;
}
