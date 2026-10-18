/**
 * UserConnectionsRepository — read access to the `user_connections` social
 * graph for the professional-graph traversals (mutuals / 2nd-degree path /
 * top introducers). Batch-first: the traversals ask for the peers of MANY
 * users at once, so one `IN (...)` query replaces a per-peer round-trip
 * (neon-http makes each query a full HTTP request).
 *
 * Also the single-user reads/writes behind the `/api/users` connection
 * endpoints (accepted list, pending inbox, accept, remove, batch status);
 * single-pair lookup + insert live on UsersRepository (`findConnection`,
 * `insertConnection`). Typed Drizzle wrappers only; rules live in
 * services/user/connections.ts.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb, schema, type Db } from "../db/index.js";
import type { UserConnectionRow } from "./usersRepository.js";
import type { ConnectionStatus } from "../../../shared/statuses.js";

const ACCEPTED: ConnectionStatus = "accepted";

/**
 * Accepted-connection peers for every id in `userIds`, bidirectional.
 * Returns a map containing an entry (possibly empty) for EVERY requested id.
 * One query regardless of `userIds.length`; empty input → no query.
 */
export async function findAcceptedPeersByUser(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, Set<string>>();
  for (const id of ids) out.set(id, new Set());
  if (ids.length === 0) return out;

  const t = schema.userConnections;
  const rows: { from: string; to: string }[] = await db
    .select({ from: t.fromUserId, to: t.toUserId })
    .from(t)
    .where(
      and(
        or(inArray(t.fromUserId, ids), inArray(t.toUserId, ids)),
        eq(t.status, ACCEPTED),
      ),
    )
    .catch(() => [] as { from: string; to: string }[]);

  for (const r of rows) {
    if (!r.from || !r.to || r.from === r.to) continue;
    out.get(r.from)?.add(r.to);
    out.get(r.to)?.add(r.from);
  }
  return out;
}

// ── /api/users connection endpoints ─────────────────────────────────────────

const { userConnections } = schema;

function involves(userId: string) {
  return or(eq(userConnections.fromUserId, userId), eq(userConnections.toUserId, userId));
}

/** Every accepted connection the user is either side of. */
export async function findAcceptedConnections(userId: string): Promise<UserConnectionRow[]> {
  return (await getDb()
    .select()
    .from(userConnections)
    .where(and(eq(userConnections.status, ACCEPTED), involves(userId)))) as UserConnectionRow[];
}

/** The ids on the far side of the user's accepted connections (de-duplicated). */
export async function findAcceptedConnectionUserIds(userId: string): Promise<string[]> {
  const links = await getDb()
    .select({ fromUserId: userConnections.fromUserId, toUserId: userConnections.toUserId })
    .from(userConnections)
    .where(and(eq(userConnections.status, ACCEPTED), involves(userId)));
  return [...new Set(links.map((l) => (l.fromUserId === userId ? l.toUserId : l.fromUserId)))];
}

/** Pending requests addressed TO the user (status "pending"). */
export async function findPendingIncoming(userId: string): Promise<UserConnectionRow[]> {
  return (await getDb()
    .select()
    .from(userConnections)
    .where(and(eq(userConnections.status, "pending"), eq(userConnections.toUserId, userId)))) as UserConnectionRow[];
}

/** Accept a request addressed to `recipientId`; null when no such request. */
export async function acceptIncoming(id: string, recipientId: string): Promise<UserConnectionRow | null> {
  const [updated] = await getDb()
    .update(userConnections)
    .set({ status: ACCEPTED, updatedAt: new Date() } as Partial<typeof userConnections.$inferInsert>)
    .where(and(eq(userConnections.id, id), eq(userConnections.toUserId, recipientId)))
    .returning();
  return (updated as UserConnectionRow) ?? null;
}

/** Delete a connection the user is either side of; returns the removed row. */
export async function deleteForParticipant(id: string, userId: string): Promise<UserConnectionRow | null> {
  const [removed] = await getDb()
    .delete(userConnections)
    .where(and(eq(userConnections.id, id), involves(userId)))
    .returning();
  return (removed as UserConnectionRow) ?? null;
}

/** Any-status connections between `viewerId` and each of `otherIds`. */
export async function findBetweenViewerAndMany(viewerId: string, otherIds: string[]): Promise<UserConnectionRow[]> {
  return (await getDb()
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, viewerId), inArray(userConnections.toUserId, otherIds)),
        and(eq(userConnections.toUserId, viewerId), inArray(userConnections.fromUserId, otherIds)),
      ),
    )) as UserConnectionRow[];
}

/** Every accepted edge with either side in `userIds` (raw from/to pairs, row
 *  order) — the 2nd-degree walk behind /api/network/warm-intros. */
export async function findAcceptedEdgesTouching(userIds: string[]): Promise<{ from: string; to: string }[]> {
  return getDb()
    .select({ from: userConnections.fromUserId, to: userConnections.toUserId })
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, ACCEPTED),
        or(inArray(userConnections.fromUserId, userIds), inArray(userConnections.toUserId, userIds)),
      ),
    );
}
