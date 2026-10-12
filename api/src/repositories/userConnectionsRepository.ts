/**
 * UserConnectionsRepository — read access to the `user_connections` social
 * graph for the professional-graph traversals (mutuals / 2nd-degree path /
 * top introducers). Batch-first: the traversals ask for the peers of MANY
 * users at once, so one `IN (...)` query replaces a per-peer round-trip
 * (neon-http makes each query a full HTTP request).
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const ACCEPTED = "Accepted";

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
